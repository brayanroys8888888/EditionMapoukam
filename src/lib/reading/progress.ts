import { createServiceClient, type AppSupabaseClient } from '@/lib/supabase/clients';
import { getAccess } from '@/lib/access/engine';
import {
  INTERVALLE_ECRITURE_MS,
  doitEcrire,
  type Reprise,
} from '@/domain/reading/progress';
import { logger } from '@/lib/logger';

/**
 * Progression de lecture — §4.2 F7.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ L'ÉCHEC D'UNE SAUVEGARDE NE DOIT JAMAIS BLOQUER NI RALENTIR LA LECTURE. │
 * │                                                                          │
 * │ Sur connexion lente — §5.1 — ces écritures s'empilent derrière la        │
 * │ lecture des pages, qui est ce que l'utilisateur attend vraiment. Une     │
 * │ progression perdue coûte un feuilletage ; une lecture bloquée coûte la   │
 * │ séance.                                                                  │
 * │                                                                          │
 * │ D'où deux dispositions : le regroupement côté serveur, et un échec       │
 * │ d'écriture qui est TRACÉ mais jamais propagé à l'appelant.               │
 * └──────────────────────────────────────────────────────────────────────────┘
 */

/**
 * Dernières écritures retenues, par (utilisateur, livre, langue).
 *
 * En mémoire, dans un seul processus — même limite que la limitation de débit,
 * et acceptable pour la même raison : au pire, deux instances écrivent chacune
 * une fois par intervalle au lieu d'une. La contrainte de clé primaire, elle,
 * garantit qu'il n'y aura jamais deux lignes.
 */
const dernieresEcritures = new Map<string, number>();

function cle(userId: string, bookId: string, langue: string): string {
  return `${userId}:${bookId}:${langue}`;
}

/** Réservé aux tests : oublie le regroupement en cours. */
export function reinitialiserRegroupement(): void {
  dernieresEcritures.clear();
}

export type RefusProgression = 'acces_refuse' | 'version_introuvable' | 'page_hors_bornes';

export type ResultatEcriture =
  | { ok: true; enregistree: boolean; page: number }
  | { ok: false; raison: RefusProgression };

/**
 * Page de reprise pour une version linguistique.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LA PROGRESSION SURVIT À LA PERTE D'ACCÈS.                               │
 * │                                                                          │
 * │ Un abonnement qui expire ne supprime pas la progression : un             │
 * │ réabonnement doit reprendre là où l'enfant s'était arrêté. La LECTURE de │
 * │ la progression n'exige donc aucun droit d'accès au titre — seulement     │
 * │ d'en être le propriétaire.                                              │
 * │                                                                          │
 * │ L'ÉCRITURE, elle, exige un droit de lecture effectif : sans cela, la     │
 * │ table deviendrait un moyen de sonder l'existence d'identifiants de       │
 * │ livres, et un journal des titres qu'on a tenté d'ouvrir sans y avoir     │
 * │ droit.                                                                   │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export async function lireReprise(
  userId: string,
  bookId: string,
  langue: 'fr' | 'en',
  options: { client?: AppSupabaseClient } = {},
): Promise<Reprise> {
  const client = options.client ?? createServiceClient();

  // Le calcul vit en SQL : il a besoin du nombre de pages rendues pour la
  // version ouverte, que seule la table des pages connaît — et dont la lecture
  // est réservée au service de pages (test d'architecture dédié). Le faire ici
  // ouvrirait un second chemin vers elle.
  const { data, error } = await client.rpc('reprise_lecture', {
    p_user_id: userId,
    p_book_id: bookId,
    p_langue: langue,
  } as never);

  if (error) {
    // Une reprise indisponible ne doit pas empêcher d'ouvrir le livre : on
    // repart de la première page, ce qui est le comportement d'un premier
    // accès.
    logger.warn('Reprise de lecture indisponible', { bookId, langue, detail: error.message });
    return { page: 1, langueOrigine: null, borneAppliquee: false };
  }

  const ligne = (data as { page: number; langue_origine: string | null; borne_appliquee: boolean }[] | null)?.[0];
  if (!ligne) {
    return { page: 1, langueOrigine: null, borneAppliquee: false };
  }

  if (ligne.borne_appliquee) {
    // Signalé : c'est le cas de pagination divergente, et il mérite d'être vu
    // au moins une fois pour confirmer que la règle joue.
    logger.info('Reprise ramenée à la longueur de la version ouverte', {
      bookId,
      langue,
      langueOrigine: ligne.langue_origine,
      page: ligne.page,
    });
  }

  return {
    page: ligne.page,
    langueOrigine: (ligne.langue_origine as 'fr' | 'en' | null) ?? null,
    borneAppliquee: ligne.borne_appliquee,
  };
}

/**
 * Enregistre la progression, ou l'absorbe si elle arrive trop tôt.
 *
 * Rend `enregistree: false` quand l'écriture a été regroupée — ce n'est PAS un
 * échec, et l'appelant répond succès dans les deux cas. Distinguer les deux
 * pousserait un client à réessayer, c'est-à-dire à défaire le regroupement.
 */
export async function enregistrerProgression(
  userId: string,
  bookId: string,
  langue: 'fr' | 'en',
  page: number,
  options: { client?: AppSupabaseClient } = {},
): Promise<ResultatEcriture> {
  const client = options.client ?? createServiceClient();

  // ┌────────────────────────────────────────────────────────────────────────┐
  // │ `canRead` SEUL, et non « canRead ou extrait ».                         │
  // │                                                                        │
  // │ C'est la condition exacte de la politique RLS posée à l'étape 4        │
  // │ (migration 0017) : `(access_for(uid, book_id)).can_read`. Le serveur    │
  // │ passe par `service_role`, qui contourne RLS — si les deux conditions   │
  // │ divergeaient, la même écriture serait acceptée par un chemin et        │
  // │ refusée par l'autre, et personne ne saurait laquelle fait autorité.    │
  // │                                                                        │
  // │ Conséquence assumée : la position d'un lecteur dans un EXTRAIT n'est   │
  // │ pas conservée. Trois pages ne valent pas une reprise, et persister le  │
  // │ parcours de quelqu'un qui n'a pas accès au titre reviendrait à tenir   │
  // │ un journal de ce qu'il a tenté d'ouvrir.                              │
  // └────────────────────────────────────────────────────────────────────────┘
  //
  // Le contrôle vient EN PREMIER. Sans lui, la table dirait quels identifiants
  // de livres existent.
  const acces = await getAccess(userId, bookId, { client });
  if (!acces.canRead) {
    return { ok: false, raison: 'acces_refuse' };
  }

  const version = await client
    .from('book_translations')
    .select('id')
    .eq('book_id', bookId)
    .eq('langue', langue)
    .eq('statut', 'publie')
    .maybeSingle();

  if (!version.data) {
    return { ok: false, raison: 'version_introuvable' };
  }

  // ┌────────────────────────────────────────────────────────────────────────┐
  // │ `pages_publiees`, ET NON `book_translations.nb_pages`.                  │
  // │                                                                        │
  // │ Les deux répondent à « combien de pages a cette version ? » et ne       │
  // │ s'accordaient pas. `nb_pages` est une métadonnée DÉCLARÉE à            │
  // │ l'ingestion ; la table des pages rendues, elle, dit ce qu'on sait       │
  // │ réellement servir — et c'est elle qui fait autorité.                    │
  // │                                                                        │
  // │ La divergence était active : sur un titre annonçant 12 pages dont 6     │
  // │ seulement étaient rendues, ce service acceptait d'enregistrer la page   │
  // │ 10 — que `servirPage` refusait d'ouvrir, et que la reprise ramenait     │
  // │ ensuite à 6 en invoquant une « pagination divergente entre langues »   │
  // │ dont il n'était pas question. Le lecteur était rembobiné en silence,   │
  // │ sur un faux motif.                                                     │
  // │                                                                        │
  // │ La borne vient donc de la MÊME fonction SQL que `reprise_lecture`       │
  // │ (migration 0033), pour que les deux ne puissent plus diverger.         │
  // └────────────────────────────────────────────────────────────────────────┘
  //
  // La borne reste celle de la version RÉELLEMENT ouverte : une page 19 est
  // valide en français et ne l'est pas dans une version anglaise de 16 pages.
  const compte = await client.rpc('pages_publiees', {
    p_book_id: bookId,
    p_langue: langue,
  });

  if (compte.error) {
    logger.warn('Longueur de version indisponible', {
      bookId,
      langue,
      detail: compte.error.message,
    });
    return { ok: false, raison: 'version_introuvable' };
  }

  const nbPages = compte.data ?? 0;
  if (page < 1 || page > nbPages) {
    return { ok: false, raison: 'page_hors_bornes' };
  }

  const existante = await client
    .from('reading_progress')
    .select('derniere_page')
    .eq('user_id', userId)
    .eq('book_id', bookId)
    .eq('langue', langue)
    .maybeSingle();

  const identifiant = cle(userId, bookId, langue);
  const derniere = dernieresEcritures.get(identifiant);

  // ┌────────────────────────────────────────────────────────────────────────┐
  // │ HEURE RÉELLE, et non l'horloge métier injectable.                      │
  // │                                                                        │
  // │ Elle ne date pas un fait métier : elle arbitre une concurrence entre   │
  // │ appareils. Une console de simulation qui reculerait le temps ferait    │
  // │ perdre une écriture postérieure au profit d'une écriture antérieure.   │
  // └────────────────────────────────────────────────────────────────────────┘
  const maintenant = new Date();

  if (!doitEcrire(derniere ? new Date(derniere) : null, maintenant, existante.data?.derniere_page ?? null, page)) {
    return { ok: true, enregistree: false, page };
  }

  const { error } = await client.from('reading_progress').upsert(
    {
      user_id: userId,
      book_id: bookId,
      langue,
      derniere_page: page,
      // L'heure du SERVEUR, jamais celle du client : deux appareils aux
      // horloges décalées feraient reculer la progression.
      maj_le: maintenant.toISOString(),
    },
    { onConflict: 'user_id,book_id,langue' },
  );

  if (error) {
    // TRACÉ, jamais propagé : une progression perdue coûte un feuilletage, une
    // lecture bloquée coûte la séance.
    logger.warn('Progression non enregistrée', { userId, bookId, langue, detail: error.message });
    return { ok: true, enregistree: false, page };
  }

  dernieresEcritures.set(identifiant, maintenant.getTime());
  return { ok: true, enregistree: true, page };
}

export { INTERVALLE_ECRITURE_MS };

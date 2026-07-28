import { createServiceClient } from '@/lib/supabase/clients';
import type { AppSupabaseClient } from '@/lib/supabase/clients';
import { getAccess } from '@/lib/access/engine';
import type { MotifAcces } from '@/domain/access/types';
import { getServerEnv } from '@/lib/config/env';

/**
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ SEUL MODULE DU DÉPÔT AUTORISÉ À INTERROGER `book_pages`.                 │
 * │                                                                          │
 * │ Un test d'architecture parcourt `src/**` et échoue si un autre fichier   │
 * │ y fait référence. Ce test n'est pas une commodité : il REMPLACE le filet │
 * │ de sécurité que la base ne peut pas tendre ici.                          │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * POURQUOI CE MODULE EXISTE
 *
 * `book_pages` a RLS activée et une politique de refus total : aucun client
 * `anon` ou `authenticated` ne l'atteint. Mais le serveur y accède avec
 * `service_role`, qui contourne RLS par construction. Sur cette table — la plus
 * sensible du schéma, puisqu'elle porte le contenu vendu — la base ne rattrape
 * donc pas une erreur applicative.
 *
 * La compensation est architecturale : un point de passage unique, où la
 * vérification des droits est INTÉGRÉE. Il est impossible d'obtenir une page
 * sans avoir traversé `access_for`, parce qu'aucun autre chemin n'existe.
 *
 * Écart assumé avec la règle de sécurité n°1 de CLAUDE.md, consigné dans
 * docs/PLAN.md. Une option plus forte — un rôle PostgreSQL dédié, soumis à RLS,
 * avec une politique appelant `access_for` — est chiffrée pour l'étape 16.
 */

export interface DemandePage {
  bookId: string;
  langue: 'fr' | 'en';
  numero: number;
}

export interface PageServie {
  numero: number;
  cheminHaute: string;
  cheminAllegee: string;
  largeur: number | null;
  hauteur: number | null;
  texte: string | null;
  /** Vrai si la page est servie au titre de l'extrait, non d'un droit complet. */
  auTitreDeLExtrait: boolean;
  /** Détermine la durée de validité de l'URL signée à émettre (D6). */
  livreGratuit: boolean;
}

export type RefusPage =
  | 'acces_refuse'
  | 'hors_extrait'
  | 'traduction_introuvable'
  | 'page_introuvable';

export type ResultatPage =
  | { ok: true; page: PageServie; motif: MotifAcces }
  | { ok: false; raison: RefusPage; motif: MotifAcces };

interface ContexteLecture {
  translationId: string;
  nbPagesExtrait: number;
  /**
   * Le titre est-il gratuit ?
   *
   * Détermine la durée de validité de l'URL signée émise ensuite : 3 600
   * secondes pour un titre gratuit, 300 pour tout contenu payant (D6). À ne pas
   * déduire du motif d'accès — un conte gratuit lu par un abonné renvoie
   * `subscription`, et resterait pourtant éligible à la durée longue.
   */
  livreGratuit: boolean;
}

/**
 * Résout la version linguistique et la longueur de l'extrait.
 *
 * Seules les traductions PUBLIÉES sont servies, y compris à un acheteur du
 * livre (docs/PLAN.md D2 point 4).
 */
async function contexte(
  client: AppSupabaseClient,
  bookId: string,
  langue: string,
): Promise<ContexteLecture | null> {
  const { data } = await client
    .from('book_translations')
    .select('id, books!inner(nb_pages_extrait, gratuit)')
    .eq('book_id', bookId)
    .eq('langue', langue)
    .eq('statut', 'publie')
    .maybeSingle();

  if (!data) return null;

  const parDefaut = getServerEnv().EXCERPT_PAGES_DEFAULT;
  return {
    translationId: data.id,
    nbPagesExtrait: data.books.nb_pages_extrait ?? parDefaut,
    livreGratuit: data.books.gratuit,
  };
}

/**
 * Sert une page, après vérification des droits.
 *
 * Trois issues, et trois seulement :
 *   - droit complet  → n'importe quelle page ;
 *   - extrait        → les premières pages seulement (§4.1 F3) ;
 *   - aucun droit    → rien, pas même la première page.
 *
 * @param userId `null` pour un visiteur non connecté — chemin nominal.
 */
export async function servirPage(
  userId: string | null,
  demande: DemandePage,
  options: { client?: AppSupabaseClient; at?: Date } = {},
): Promise<ResultatPage> {
  const client = options.client ?? createServiceClient();

  // Le contrôle vient EN PREMIER, avant toute lecture de contenu. L'ordre
  // compte : lire puis filtrer laisserait une fenêtre où le contenu est en
  // mémoire, et un `return` oublié suffirait à le laisser sortir.
  const acces = await getAccess(userId, demande.bookId, {
    client,
    ...(options.at ? { at: options.at } : {}),
  });

  if (!acces.canRead && acces.reason !== 'preview') {
    return { ok: false, raison: 'acces_refuse', motif: acces.reason };
  }

  const contexteLecture = await contexte(client, demande.bookId, demande.langue);
  if (!contexteLecture) {
    return { ok: false, raison: 'traduction_introuvable', motif: acces.reason };
  }

  const auTitreDeLExtrait = !acces.canRead;
  if (auTitreDeLExtrait && demande.numero > contexteLecture.nbPagesExtrait) {
    return { ok: false, raison: 'hors_extrait', motif: acces.reason };
  }

  const { data } = await client
    .from('book_pages')
    .select('numero, chemin_haute, chemin_allegee, largeur, hauteur, texte')
    .eq('translation_id', contexteLecture.translationId)
    .eq('numero', demande.numero)
    .maybeSingle();

  if (!data) {
    return { ok: false, raison: 'page_introuvable', motif: acces.reason };
  }

  return {
    ok: true,
    motif: acces.reason,
    page: {
      numero: data.numero,
      cheminHaute: data.chemin_haute,
      cheminAllegee: data.chemin_allegee,
      largeur: data.largeur,
      hauteur: data.hauteur,
      texte: data.texte,
      auTitreDeLExtrait,
      livreGratuit: contexteLecture.livreGratuit,
    },
  };
}

export interface SommaireLecture {
  nbPages: number;
  nbPagesLisibles: number;
  motif: MotifAcces;
  integral: boolean;
}

/**
 * Nombre de pages du titre, et nombre réellement lisibles par cet utilisateur.
 *
 * Sert au lecteur en ligne pour afficher « page 3 sur 5 de l'extrait » plutôt
 * que de laisser l'utilisateur buter sur un refus.
 */
export async function sommaire(
  userId: string | null,
  bookId: string,
  langue: 'fr' | 'en',
  options: { client?: AppSupabaseClient; at?: Date } = {},
): Promise<SommaireLecture | null> {
  const client = options.client ?? createServiceClient();

  const acces = await getAccess(userId, bookId, {
    client,
    ...(options.at ? { at: options.at } : {}),
  });
  if (!acces.canRead && acces.reason !== 'preview') {
    return { nbPages: 0, nbPagesLisibles: 0, motif: acces.reason, integral: false };
  }

  const contexteLecture = await contexte(client, bookId, langue);
  if (!contexteLecture) return null;

  const { count } = await client
    .from('book_pages')
    .select('numero', { count: 'exact', head: true })
    .eq('translation_id', contexteLecture.translationId);

  const nbPages = count ?? 0;
  return {
    nbPages,
    nbPagesLisibles: acces.canRead ? nbPages : Math.min(contexteLecture.nbPagesExtrait, nbPages),
    motif: acces.reason,
    integral: acces.canRead,
  };
}

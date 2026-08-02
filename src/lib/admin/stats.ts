import { createServiceClient, type AppSupabaseClient } from '@/lib/supabase/clients';
import { getClock, type Clock } from '@/lib/clock';
import { logger } from '@/lib/logger';

/**
 * Statistiques agrégées — §4.3 F13.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ L'AGRÉGATION EST FAITE EN SQL, JAMAIS EN MÉMOIRE.                       │
 * │                                                                          │
 * │ Ce n'est pas une question de vitesse. Agréger en TypeScript exigerait de │
 * │ RAPATRIER les lignes — toutes les commandes, toutes les progressions de  │
 * │ lecture — dans le processus applicatif. Le seuil d'agrégation qui protège │
 * │ les lecteurs deviendrait alors un filtre appliqué APRÈS coup, sur des    │
 * │ données nominatives déjà sorties de la base.                            │
 * │                                                                          │
 * │ En SQL, ce qui ne doit pas sortir ne sort jamais.                       │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * LES BORNES DE PÉRIODE PASSENT PAR L'HORLOGE MÉTIER INJECTABLE. Après un
 * déplacement du temps par la console de simulation, « les trente derniers
 * jours » doivent suivre — sans quoi les séries seraient incohérentes avec les
 * faits que la simulation vient de produire.
 */
export interface Periode {
  debut?: string | null;
  fin?: string | null;
}

export type ResultatStats<T> =
  | { ok: true; donnees: T }
  | { ok: false; raison: 'periode_invalide' | 'indisponible'; detail: string };

interface ErreurPostgres {
  code?: string;
  message: string;
}

async function agreger<T>(
  client: AppSupabaseClient,
  clock: Clock,
  nom: string,
  args: Record<string, unknown>,
): Promise<ResultatStats<T>> {
  const reponse = (await client.rpc(nom as never, {
    ...args,
    // L'instant courant vient de l'horloge injectée, jamais de `now()` : c'est
    // ce qui rend les séries reproductibles sous simulation et en test.
    p_at: clock.now().toISOString(),
  } as never)) as { data: unknown; error: ErreurPostgres | null };

  if (reponse.error) {
    // `check_violation` : période inversée ou trop large. C'est une erreur
    // d'appel, pas une panne — elle mérite un 400 et non un 500.
    if (reponse.error.code === '23514' || /P0001/.test(reponse.error.code ?? '')) {
      return { ok: false, raison: 'periode_invalide', detail: reponse.error.message };
    }
    logger.warn('Statistique indisponible', {
      agregat: nom,
      code: reponse.error.code,
      detail: reponse.error.message,
    });
    return { ok: false, raison: 'indisponible', detail: reponse.error.message };
  }

  return { ok: true, donnees: reponse.data as T };
}

interface Options {
  client?: AppSupabaseClient;
  clock?: Clock;
}

function contexte(options: Options): { client: AppSupabaseClient; clock: Clock } {
  return {
    client: options.client ?? createServiceClient(),
    clock: options.clock ?? getClock(),
  };
}

/**
 * Chiffre d'affaires, ventilé PAR FLUX, PAR DEVISE et PAR ZONE.
 *
 * Aucune fonction de ce module ne rend « le » chiffre d'affaires : additionner
 * des euros et des francs CFA sans taux de change ne produit pas un chiffre
 * approximatif, il n'en produit aucun (D4 point 4).
 */
export async function chiffreAffaires(periode: Periode = {}, options: Options = {}) {
  const { client, clock } = contexte(options);
  return await agreger<unknown[]>(client, clock, 'stats_chiffre_affaires', {
    p_debut: periode.debut ?? null,
    p_fin: periode.fin ?? null,
  });
}

/**
 * Abonnés par statut OBSERVÉ.
 *
 * Le statut stocké dit ce que le prestataire a rapporté en dernier ; le statut
 * effectif dit où en est l'abonnement aujourd'hui. Une anomalie n'est comptée
 * ni en actif ni en expiré (arbitrage N2).
 */
export async function abonnes(options: Options = {}) {
  const { client, clock } = contexte(options);
  return await agreger<unknown[]>(client, clock, 'stats_abonnes', {});
}

export async function mouvementsAbonnement(periode: Periode = {}, options: Options = {}) {
  const { client, clock } = contexte(options);
  return await agreger<unknown[]>(client, clock, 'stats_mouvements_abonnement', {
    p_debut: periode.debut ?? null,
    p_fin: periode.fin ?? null,
  });
}

export async function titresAchetes(
  periode: Periode & { page: number; taille: number },
  options: Options = {},
) {
  const { client, clock } = contexte(options);
  return await agreger<unknown[]>(client, clock, 'stats_titres_achetes', {
    p_debut: periode.debut ?? null,
    p_fin: periode.fin ?? null,
    p_page: periode.page,
    p_taille: periode.taille,
  });
}

/**
 * Titres les plus lus — AGRÉGAT.
 *
 * Aucun identifiant d'utilisateur n'entre ni ne sort, et un seuil de cinq
 * lecteurs distincts s'applique en base : « 1 lecteur » serait une donnée
 * nominative déguisée en statistique.
 */
export async function titresLus(
  periode: Periode & { page: number; taille: number },
  options: Options = {},
) {
  const { client, clock } = contexte(options);
  return await agreger<unknown[]>(client, clock, 'stats_titres_lus', {
    p_debut: periode.debut ?? null,
    p_fin: periode.fin ?? null,
    p_page: periode.page,
    p_taille: periode.taille,
  });
}

export async function langues(periode: Periode = {}, options: Options = {}) {
  const { client, clock } = contexte(options);
  return await agreger<unknown[]>(client, clock, 'stats_langues', {
    p_debut: periode.debut ?? null,
    p_fin: periode.fin ?? null,
  });
}

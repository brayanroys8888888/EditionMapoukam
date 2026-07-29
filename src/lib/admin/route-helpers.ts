import { z } from 'zod';

import { requireAdmin } from '@/lib/auth/session';
import { errors, fail } from '@/lib/http/responses';
import { RateLimiter } from '@/lib/http/rate-limit';
import type { RefusAdmin, ResultatAdmin } from './service';

/**
 * Socle commun des routes d'administration.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LA GARDE, LE QUOTA ET LA PAGINATION SONT INSÉPARABLES.                  │
 * │                                                                          │
 * │ Réunis dans un seul point d'entrée, ils ne peuvent pas être appliqués à   │
 * │ moitié. Une route d'administration écrite dans six mois qui appellerait   │
 * │ `gardeAdmin` obtient les trois d'un coup ; une route qui les recopierait  │
 * │ un par un finirait par en oublier un — et ce serait le quota.             │
 * └──────────────────────────────────────────────────────────────────────────┘
 */

/**
 * Quota commun à toutes les routes d'administration.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ POURQUOI UN COMPTE ADMINISTRATEUR EST LIMITÉ EN DÉBIT.                   │
 * │                                                                          │
 * │ Ce n'est pas de la défiance envers l'éditeur : c'est que le vol d'un      │
 * │ compte d'administration donne accès à la base de clientèle entière. La    │
 * │ pagination plafonne ce qu'une requête emporte ; le quota plafonne combien │
 * │ de requêtes peuvent être enchaînées. Sans le second, le premier ne coûte  │
 * │ qu'une boucle.                                                           │
 * │                                                                          │
 * │ 300 par quart d'heure : très au-dessus d'un usage humain — un éditeur qui │
 * │ range son catalogue enchaîne quelques dizaines d'actions — et très en     │
 * │ dessous de ce qu'exigerait l'aspiration de dizaines de milliers de        │
 * │ comptes par pages de cent.                                               │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
const QUOTA_ADMIN = { limite: 300, fenetreMs: 15 * 60 * 1000 } as const;

const limiteur = new RateLimiter();

/** Réservé aux tests : le quota vit en mémoire du processus. */
export function reinitialiserQuotaAdmin(): void {
  limiteur.vider();
}

/**
 * Pagination commune.
 *
 * Le plafond n'est PAS ici : il vit dans `taille_page_admin()` en base. Ce
 * schéma borne les entrées pour rendre un message clair ; la protection réelle
 * est en base, où une route qui l'oublierait en hérite quand même.
 */
export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  taille: z.coerce.number().int().min(1).max(100).default(25),
});

export interface AppelantAdmin {
  id: string;
  email: string;
}

export type GardeAdmin =
  | { ok: true; acteur: AppelantAdmin }
  | { ok: false; response: Response };

/**
 * Garde d'une route d'administration.
 *
 * Le rôle est lu EN BASE à chaque requête — `requireAdmin` relit le profil,
 * jamais une prétention du jeton — puis revérifié une seconde fois par
 * `admin_poser_acteur` au moment de l'écriture (étape 13, point 1).
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ L'ACTEUR RENDU ICI EST LA SEULE IDENTITÉ ADMISE.                        │
 * │                                                                          │
 * │ Aucune route d'administration n'accepte un `user_id` venant du client     │
 * │ pour « agir au nom de » (point 2). Un tel paramètre ferait de chaque      │
 * │ route un point d'usurpation, et le journal d'audit nommerait la victime   │
 * │ au lieu de l'auteur — c'est-à-dire qu'il mentirait.                       │
 * │                                                                          │
 * │ Un `user_id` désignant une CIBLE reste légitime : suspendre le compte     │
 * │ d'un autre est le métier même de l'administration. La distinction est     │
 * │ entre agir SUR quelqu'un, qui est tracé, et agir EN TANT QUE quelqu'un,   │
 * │ qui n'existe pas.                                                        │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export async function gardeAdmin(request: Request): Promise<GardeAdmin> {
  const garde = await requireAdmin(request);
  if (!garde.ok) return { ok: false, response: garde.response };

  const quota = limiteur.consommer(`admin:${garde.appelant.id}`, QUOTA_ADMIN);
  if (!quota.autorise) {
    return { ok: false, response: errors.tropDeRequetes(quota.retryAfter) };
  }

  return { ok: true, acteur: { id: garde.appelant.id, email: garde.appelant.email } };
}

/**
 * Traduit un refus du service en réponse HTTP.
 *
 * Le détail interne reste côté serveur : les fonctions d'administration nomment
 * des contraintes et des tables dans leurs messages, et une contrainte violée
 * décrit la structure de la base.
 */
export function refusEnReponse(raison: RefusAdmin): Response {
  switch (raison) {
    case 'introuvable':
      return errors.introuvable();
    case 'refuse':
      return errors.interdit();
    case 'regle_metier':
      return fail(422, {
        code: 'action_impossible',
        message: 'Cette action est refusée par une règle métier.',
      });
    case 'indisponible':
      return errors.interne();
  }
}

/** Rend les données, ou traduit le refus. */
export function reponseAdmin<T>(resultat: ResultatAdmin<T>): Response | { donnees: T } {
  if (!resultat.ok) return refusEnReponse(resultat.raison);
  return { donnees: resultat.donnees };
}

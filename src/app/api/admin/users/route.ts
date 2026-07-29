import { z } from 'zod';

import { gardeAdmin, paginationSchema, refusEnReponse } from '@/lib/admin/route-helpers';
import { listerUtilisateurs } from '@/lib/admin/service';
import { ok } from '@/lib/http/responses';
import { parseSearchParams } from '@/lib/http/validate';

/**
 * Recherche de comptes — §4.3 F11.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ « LISTER TOUS LES UTILISATEURS » SANS PLAFOND EST UN VECTEUR             │
 * │ D'EXFILTRATION.                                                          │
 * │                                                                          │
 * │ Si un compte d'administration est compromis, une seule requête sans       │
 * │ plafond emporte la base de clientèle entière. Deux bornes s'y opposent :  │
 * │ la pagination, plafonnée à cent lignes EN BASE et non ici, et le quota de │
 * │ requêtes appliqué par `gardeAdmin`. La première seule ne coûterait qu'une │
 * │ boucle à contourner.                                                     │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * L'identité d'un compte anonymisé n'est jamais rendue, et la recherche ne
 * l'atteint pas : `admin_lister_utilisateurs` s'en charge, et un test le prouve.
 */
const filtresSchema = paginationSchema.extend({
  recherche: z.string().trim().min(1).max(200).optional(),
  statut: z.enum(['actif', 'suspendu', 'anonymise']).optional(),
});

export async function GET(request: Request): Promise<Response> {
  const garde = await gardeAdmin(request);
  if (!garde.ok) return garde.response;

  const query = parseSearchParams(request, filtresSchema);
  if (!query.ok) return query.response;

  const resultat = await listerUtilisateurs({
    recherche: query.data.recherche ?? null,
    statut: query.data.statut ?? null,
    page: query.data.page,
    taille: query.data.taille,
  });
  if (!resultat.ok) return refusEnReponse(resultat.raison);

  return ok({ comptes: resultat.donnees, page: query.data.page });
}

import { z } from 'zod';

import { gardeAdmin, paginationSchema, refusEnReponse } from '@/lib/admin/route-helpers';
import { listerCommandes } from '@/lib/admin/service';
import { ok } from '@/lib/http/responses';
import { parseSearchParams } from '@/lib/http/validate';

/**
 * Commandes vues de l'administration — §4.3 F11.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ CETTE VUE EST LA PLUS EXPOSÉE AU PIÈGE DE LA RÉ-IDENTIFICATION.         │
 * │                                                                          │
 * │ C'est la seule qui ait une raison légitime de joindre les factures — et   │
 * │ une facture porte `facture_nom` et `facture_email`, figés au moment de    │
 * │ l'émission et conservés après l'anonymisation du compte, comme la loi     │
 * │ l'exige.                                                                 │
 * │                                                                          │
 * │ Le danger n'est donc pas la conservation, c'est la JOINTURE : afficher     │
 * │ l'email de facturation à côté de la commande reconstituerait, en toute     │
 * │ bonne foi et en une ligne de SQL, l'identité que l'utilisateur a demandé   │
 * │ d'effacer.                                                               │
 * │                                                                          │
 * │ `admin_lister_commandes` ne rend donc QUE le numéro de facture, jamais    │
 * │ son contenu nominatif. Un test le prouve sur un compte réellement         │
 * │ anonymisé.                                                               │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
const filtresSchema = paginationSchema.extend({
  statut: z.enum(['en_attente', 'paye', 'echoue', 'rembourse', 'abandonne']).optional(),
  user_id: z.uuid().optional(),
});

export async function GET(request: Request): Promise<Response> {
  const garde = await gardeAdmin(request);
  if (!garde.ok) return garde.response;

  const query = parseSearchParams(request, filtresSchema);
  if (!query.ok) return query.response;

  const resultat = await listerCommandes({
    statut: query.data.statut ?? null,
    userId: query.data.user_id ?? null,
    page: query.data.page,
    taille: query.data.taille,
  });
  if (!resultat.ok) return refusEnReponse(resultat.raison);

  return ok({ commandes: resultat.donnees, page: query.data.page });
}

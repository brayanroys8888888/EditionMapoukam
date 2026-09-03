import { z } from 'zod';

import { gardeAdmin, refusEnReponse } from '@/lib/admin/route-helpers';
import { poserPrixOffre } from '@/lib/admin/service';
import { errors, ok } from '@/lib/http/responses';
import { parseJsonBody } from '@/lib/http/validate';

/**
 * LE PRIX D'UNE OFFRE, ZONE PAR ZONE — §3.3, §4.3 F12 bis.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LA ZONE EST ICI UNE CIBLE, JAMAIS UNE PRÉTENTION.                       │
 * │                                                                          │
 * │ La règle de §3.3 — « la zone d'encaissement ne vient jamais du client » — │
 * │ porte sur l'ACHAT : un acheteur ne choisit pas sa grille tarifaire, elle  │
 * │ se déduit du pays de son moyen de paiement. Ici, la zone dit simplement   │
 * │ QUELLE LIGNE de la grille l'éditeur est en train d'écrire, ce qui est le  │
 * │ métier même de l'administration. C'est exactement la distinction que      │
 * │ `route-helpers` pose entre agir SUR quelqu'un et agir EN TANT QUE.        │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LA DEVISE N'EST PAS DÉDUITE DE LA ZONE.                                 │
 * │                                                                          │
 * │ La zone `afrique` couvre XAF et XOF (docs/PLAN.md D4 point 4) : deux      │
 * │ devises pour une même zone. En déduire l'une libellerait le montant dans  │
 * │ une devise que personne n'a demandée.                                    │
 * │                                                                          │
 * │ Le MONTANT est dans la plus petite unité de sa devise, et le franc CFA    │
 * │ n'en a pas : 799 vaut 7,99 € quand 2500 vaut 2 500 FCFA. Recopier ici la  │
 * │ logique de l'euro multiplierait la somme par cent.                       │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * `PUT` et non `POST` : poser un prix est idempotent. La fonction SQL écrit ou
 * remplace la ligne de la zone, et rejouer la même requête ne crée pas de
 * seconde grille.
 */
const prixSchema = z.object({
  zone: z.enum(['international', 'afrique']),
  montant: z.int().positive().max(100_000_000),
  devise: z.enum(['EUR', 'XAF', 'XOF']),
});

export async function PUT(
  request: Request,
  contexte: { params: Promise<{ id: string }> },
): Promise<Response> {
  const garde = await gardeAdmin(request);
  if (!garde.ok) return garde.response;

  const corps = await parseJsonBody(request, prixSchema);
  if (!corps.ok) return corps.response;

  const { id } = await contexte.params;
  if (!z.uuid().safeParse(id).success) return errors.introuvable();

  const resultat = await poserPrixOffre(garde.acteur.id, id, {
    zone: corps.data.zone,
    montant: corps.data.montant,
    devise: corps.data.devise,
  });
  if (!resultat.ok) return refusEnReponse(resultat.raison);

  return ok(resultat.donnees);
}

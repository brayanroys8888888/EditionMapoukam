import { z } from 'zod';

import { gardeAdmin, refusEnReponse } from '@/lib/admin/route-helpers';
import { definirPrix } from '@/lib/admin/service';
import { errors, ok } from '@/lib/http/responses';
import { parseJsonBody } from '@/lib/http/validate';

/**
 * Prix par zone — §4.3 F10, docs/PLAN.md D4.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LA DEVISE N'EST PAS DÉDUITE DE LA ZONE.                                 │
 * │                                                                          │
 * │ La zone `afrique` couvre XAF et XOF (D4 point 4) : deux devises           │
 * │ distinctes de la même zone. Déduire l'une de l'autre obligerait à choisir │
 * │ arbitrairement, et le montant serait libellé dans une devise que          │
 * │ personne n'a demandée.                                                   │
 * │                                                                          │
 * │ Le MONTANT est exprimé dans la plus petite unité de la devise, et le      │
 * │ franc CFA n'en a pas : 500 vaut 500 FCFA, quand 500 vaut 5 € (migration   │
 * │ 0005). Recopier la logique de l'euro multiplierait la somme par cent.     │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Retirer le prix d'une zone retire le titre de la vente dans cette zone, sans
 * repli sur une autre grille (arbitrage N1) : c'est une décision commerciale, et
 * elle est tracée comme telle.
 */
const corpsSchema = z.object({
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

  const corps = await parseJsonBody(request, corpsSchema);
  if (!corps.ok) return corps.response;

  const { id } = await contexte.params;
  if (!z.uuid().safeParse(id).success) return errors.introuvable();

  const resultat = await definirPrix(garde.acteur.id, id, {
    zone: corps.data.zone,
    montant: corps.data.montant,
    devise: corps.data.devise,
  });
  if (!resultat.ok) return refusEnReponse(resultat.raison);

  return ok(resultat.donnees);
}

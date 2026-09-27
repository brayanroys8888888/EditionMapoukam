import { z } from 'zod';

import { gardeAdmin, refusEnReponse } from '@/lib/admin/route-helpers';
import { rembourserCommande } from '@/lib/admin/service';
import { errors, ok } from '@/lib/http/responses';
import { parseJsonBody } from '@/lib/http/validate';

/**
 * Remboursement d'une commande — §4.3 F11.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LA MÊME FONCTION QUE LE WEBHOOK DE REMBOURSEMENT.                       │
 * │                                                                          │
 * │ `refund_order` retire les droits LIGNE PAR LIGNE (arbitrage Q9.1) : une   │
 * │ commande de trois titres dont un seul est remboursé ne doit pas coûter    │
 * │ l'accès aux deux autres. Cette logique ne peut pas exister deux fois —    │
 * │ elle divergerait, et c'est le chemin le moins emprunté qui deviendrait     │
 * │ faux (docs/PLAN.md §5 quinquies).                                        │
 * │                                                                          │
 * │ Un remboursement demandé par l'administration passe donc exactement par   │
 * │ le chemin d'un remboursement venu du prestataire. Seule la trace          │
 * │ diffère : elle nomme l'administrateur.                                   │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Le montant n'est PAS un paramètre : rembourser partiellement supposerait de
 * décider quels titres restent accessibles, ce que la spécification ne prévoit
 * pas. Un remboursement porte sur la commande, et retire les droits qu'elle a
 * ouverts.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LE MOTIF EST EXIGÉ ICI, ET NON EN BASE.                                 │
 * │                                                                          │
 * │ `orders.motif_remboursement` accepte le nul, parce qu'un remboursement   │
 * │ rapporté par le prestataire n'a pas de motif choisi chez nous — l'exiger │
 * │ en base ferait échouer le webhook, c'est-à-dire perdre l'enregistrement  │
 * │ d'un remboursement qui a DÉJÀ eu lieu.                                   │
 * │                                                                          │
 * │ L'obligation vit donc là où un humain choisit : cette route. Le client   │
 * │ lira ce motif, et un remboursement sans explication inquiète plus qu'il  │
 * │ ne rassure.                                                              │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
const remboursementSchema = z.object({
  motif: z.enum(['demande_client', 'paiement_double', 'fichier_defectueux', 'geste_commercial']),
});
export async function POST(
  request: Request,
  contexte: { params: Promise<{ id: string }> },
): Promise<Response> {
  const garde = await gardeAdmin(request);
  if (!garde.ok) return garde.response;

  const { id } = await contexte.params;
  if (!z.uuid().safeParse(id).success) return errors.introuvable();

  const corps = await parseJsonBody(request, remboursementSchema);
  if (!corps.ok) return corps.response;

  const resultat = await rembourserCommande(garde.acteur.id, id, { motif: corps.data.motif });
  if (!resultat.ok) return refusEnReponse(resultat.raison);

  return ok({ order_id: id, statut: 'rembourse' });
}

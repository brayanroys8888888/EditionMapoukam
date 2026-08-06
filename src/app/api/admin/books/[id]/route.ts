import { z } from 'zod';

import { gardeAdmin, refusEnReponse } from '@/lib/admin/route-helpers';
import { supprimerLivre } from '@/lib/admin/service';
import { errors, ok } from '@/lib/http/responses';
import { parseJsonBody } from '@/lib/http/validate';

/**
 * Suppression d'un titre — §4.3 F10.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ ELLE NE MORD QUE SUR UN BROUILLON, ET LA GARDE EST EN BASE.            │
 * │                                                                          │
 * │ Un dépôt raté doit pouvoir disparaître : un PDF déposé deux fois laisse   │
 * │ un doublon au slug suffixé, que l'archivage ne fait que cacher.           │
 * │                                                                          │
 * │ Mais un titre PUBLIÉ OU ARCHIVÉ ne se supprime pas, même sans vente :     │
 * │ `entitlements` et `order_items` le référencent en `on delete cascade`,    │
 * │ si bien qu'une suppression effacerait silencieusement les droits de       │
 * │ clients qui ont payé, et des lignes de commande qui sont des pièces       │
 * │ comptables.                                                              │
 * │                                                                          │
 * │ Cette route ne vérifie donc RIEN de tout cela : `admin_supprimer_livre`   │
 * │ le fait, et c'est le seul endroit qu'une autre route ne pourra pas        │
 * │ contourner. Elle transporte des arguments et traduit un refus.            │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LE MOTIF EST OBLIGATOIRE, ET CE N'EST PAS UNE POLITESSE.                │
 * │                                                                          │
 * │ C'est la contrepartie d'un levier irréversible : le journal d'audit doit  │
 * │ pouvoir dire pourquoi un titre a disparu, six mois plus tard, à quelqu'un │
 * │ qui le cherche. La base l'exige aussi — ici, c'est pour rendre un message │
 * │ clair plutôt qu'une violation de contrainte.                             │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
const corpsSchema = z.object({
  motif: z.string().trim().min(3).max(300),
});

export async function DELETE(
  request: Request,
  contexte: { params: Promise<{ id: string }> },
): Promise<Response> {
  const garde = await gardeAdmin(request);
  if (!garde.ok) return garde.response;

  const corps = await parseJsonBody(request, corpsSchema);
  if (!corps.ok) return corps.response;

  const { id } = await contexte.params;
  if (!z.uuid().safeParse(id).success) return errors.introuvable();

  const resultat = await supprimerLivre(garde.acteur.id, id, corps.data.motif);
  if (!resultat.ok) return refusEnReponse(resultat.raison);

  return ok({ supprime: true });
}

import { z } from 'zod';

import { gardeAdmin, refusEnReponse } from '@/lib/admin/route-helpers';
import { octroyerDroit, retirerDroit } from '@/lib/admin/service';
import { created, errors, noContent } from '@/lib/http/responses';
import { parseJsonBody, parseSearchParams } from '@/lib/http/validate';

/**
 * Octroi manuel d'un droit — §4.3 F11.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LE MOTIF EST OBLIGATOIRE, ET CE N'EST PAS UNE FORMALITÉ.                │
 * │                                                                          │
 * │ C'est le bouton qui donne du contenu gratuitement. Il ne laisse aucune    │
 * │ trace comptable — pas de commande, pas de facture, pas de paiement — et   │
 * │ accorde un accès définitif. Sans motif, le journal dirait « quelqu'un a   │
 * │ offert ce titre » sans jamais dire pourquoi : ce n'est pas une trace,     │
 * │ c'est un constat.                                                        │
 * │                                                                          │
 * │ Le motif est exigé à TROIS niveaux, et c'est délibéré : ici par Zod pour  │
 * │ un message clair, dans `admin_octroyer_droit` où il est un paramètre      │
 * │ obligatoire, et dans le déclencheur d'audit qui refuse l'écriture sans    │
 * │ lui. Les deux derniers tiennent même si cette route est réécrite.         │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Le droit accordé est de type `offert`. Il n'ouvre PAS le téléchargement par
 * défaut : celui-ci ne s'obtient normalement que par un achat (règle métier
 * centrale), et l'offrir doit rester un geste explicite.
 */
const octroiSchema = z.object({
  book_id: z.uuid(),
  motif: z.string().trim().min(3).max(1000),
  peut_telecharger: z.boolean().default(false),
  expire_le: z.iso.datetime({ offset: true }).optional(),
});

export async function POST(
  request: Request,
  contexte: { params: Promise<{ id: string }> },
): Promise<Response> {
  const garde = await gardeAdmin(request);
  if (!garde.ok) return garde.response;

  const corps = await parseJsonBody(request, octroiSchema);
  if (!corps.ok) return corps.response;

  const { id } = await contexte.params;
  if (!z.uuid().safeParse(id).success) return errors.introuvable();

  const resultat = await octroyerDroit(garde.acteur.id, {
    // Le bénéficiaire vient de l'URL, l'acteur de la session : jamais l'inverse,
    // et jamais les deux du même endroit.
    userId: id,
    bookId: corps.data.book_id,
    motif: corps.data.motif,
    peutTelecharger: corps.data.peut_telecharger,
    expireLe: corps.data.expire_le ?? null,
  });
  if (!resultat.ok) return refusEnReponse(resultat.raison);

  return created(resultat.donnees);
}

/**
 * Retrait d'un droit OFFERT.
 *
 * Un droit issu d'un achat n'est pas retirable ici : §3.1 promet à l'acheteur un
 * accès « sans limite de durée », et le retirer serait reprendre ce qui a été
 * payé. Le seul chemin qui retire un droit d'achat est le remboursement, qui
 * rend l'argent en même temps. La base le refuse aussi, indépendamment.
 */
const retraitSchema = z.object({
  entitlement_id: z.uuid(),
  motif: z.string().trim().min(3).max(1000).optional(),
});

export async function DELETE(
  request: Request,
  contexte: { params: Promise<{ id: string }> },
): Promise<Response> {
  const garde = await gardeAdmin(request);
  if (!garde.ok) return garde.response;

  const query = parseSearchParams(request, retraitSchema);
  if (!query.ok) return query.response;

  const { id } = await contexte.params;
  if (!z.uuid().safeParse(id).success) return errors.introuvable();

  const resultat = await retirerDroit(
    garde.acteur.id,
    query.data.entitlement_id,
    query.data.motif ?? null,
  );
  if (!resultat.ok) return refusEnReponse(resultat.raison);

  return noContent();
}

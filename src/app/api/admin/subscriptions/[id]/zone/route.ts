import { z } from 'zod';

import { gardeAdmin, refusEnReponse } from '@/lib/admin/route-helpers';
import { changerZoneAbonnement } from '@/lib/admin/service';
import { errors, ok } from '@/lib/http/responses';
import { parseJsonBody } from '@/lib/http/validate';

/**
 * Changement de zone d'un abonnement — arbitrage N4.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ JAMAIS ACCESSIBLE À L'UTILISATEUR.                                      │
 * │                                                                          │
 * │ Un abonné qui déménage réellement change de grille tarifaire, et le refus │
 * │ pur et simple serait injuste. Mais offrir ce choix au client reviendrait à │
 * │ publier une grille tarifaire au libre choix de chacun : il suffirait de    │
 * │ déclarer un déménagement pour payer le tarif de la zone la moins chère.   │
 * │                                                                          │
 * │ Le geste appartient donc à l'administration, et il est TRACÉ — qui, quand, │
 * │ ancienne et nouvelle zone. C'est la contrepartie exacte d'un pouvoir qui   │
 * │ n'est pas offert à l'intéressé.                                          │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * LE MONTANT ET LA DEVISE NE CHANGENT PAS. Ils sont figés sur l'abonnement
 * (D4 point 7) et ne suivront la nouvelle zone qu'au prochain renouvellement.
 * Les modifier maintenant réviserait rétroactivement une période déjà payée —
 * et pourrait la rendre plus chère après encaissement.
 */
const corpsSchema = z.object({
  zone: z.enum(['international', 'afrique']),
  motif: z.string().trim().min(3).max(1000).optional(),
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

  const resultat = await changerZoneAbonnement(
    garde.acteur.id,
    id,
    corps.data.zone,
    corps.data.motif ?? null,
  );
  if (!resultat.ok) return refusEnReponse(resultat.raison);

  return ok(resultat.donnees);
}

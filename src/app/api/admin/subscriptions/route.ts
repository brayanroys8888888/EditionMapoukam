import { z } from 'zod';

import { gardeAdmin, paginationSchema, refusEnReponse } from '@/lib/admin/route-helpers';
import { listerAbonnements } from '@/lib/admin/service';
import { ok } from '@/lib/http/responses';
import { parseSearchParams } from '@/lib/http/validate';

/**
 * Abonnements — §4.3 F11.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LES ANOMALIES SONT EN TÊTE DE LISTE, ET C'EST TOUT LE PROPOS.           │
 * │                                                                          │
 * │ Arbitrage N2 : « un abonnement `actif` à période échue ressemble          │
 * │ exactement à un abonnement sain — rien ne le distingue, il se fond dans   │
 * │ la masse. » L'état dérivé `anomalie` existe pour le nommer ; le ranger    │
 * │ ensuite au milieu des autres reviendrait à le taire une seconde fois.     │
 * │                                                                          │
 * │ Le filtre porte donc sur le statut OBSERVÉ et non sur le statut stocké :  │
 * │ chercher les anomalies en filtrant `statut = 'anomalie'` ne rendrait rien, │
 * │ cette valeur n'étant jamais écrite en base (migration 0029).             │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
const filtresSchema = paginationSchema.extend({
  // `anomalie` est une valeur du statut OBSERVÉ, pas du statut stocké.
  statut: z.enum(['essai', 'actif', 'annule', 'impaye', 'expire', 'anomalie']).optional(),
});

export async function GET(request: Request): Promise<Response> {
  const garde = await gardeAdmin(request);
  if (!garde.ok) return garde.response;

  const query = parseSearchParams(request, filtresSchema);
  if (!query.ok) return query.response;

  const resultat = await listerAbonnements({
    statut: query.data.statut ?? null,
    page: query.data.page,
    taille: query.data.taille,
  });
  if (!resultat.ok) return refusEnReponse(resultat.raison);

  return ok({ abonnements: resultat.donnees, page: query.data.page });
}

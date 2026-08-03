import { z } from 'zod';

import { gardeAdmin, pagination, paginationSchema, refusEnReponse } from '@/lib/admin/route-helpers';
import { listerAudit } from '@/lib/admin/service';
import { ok } from '@/lib/http/responses';
import { parseSearchParams } from '@/lib/http/validate';

/**
 * Journal d'audit — lecture seule (§4.3 F10).
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ AUCUNE ROUTE N'ÉCRIT NI N'EFFACE CE JOURNAL.                            │
 * │                                                                          │
 * │ Il est alimenté par des déclencheurs, et la table refuse `update`,        │
 * │ `delete` et `truncate` à tout le monde — y compris à `service_role`, qui   │
 * │ contourne pourtant RLS. Un journal dont on peut retirer une ligne ne       │
 * │ prouve rien.                                                             │
 * │                                                                          │
 * │ Il n'y a donc ici qu'un GET. Ce n'est pas un oubli.                      │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
const filtresSchema = paginationSchema.extend({
  action: z
    .enum([
      'prix_modifie',
      'gratuit_modifie',
      'inclus_abonnement_modifie',
      'disponible_achat_modifie',
      'publication_modifiee',
      'parametres_modifies',
      'droit_octroye',
      'droit_retire',
      'remboursement',
      'zone_abonnement_modifiee',
      'compte_suspendu',
      'compte_reactive',
      'code_promo_modifie',
      'purge_copies',
    ])
    .optional(),
  cible_id: z.uuid().optional(),
});

export async function GET(request: Request): Promise<Response> {
  const garde = await gardeAdmin(request);
  if (!garde.ok) return garde.response;

  const query = parseSearchParams(request, filtresSchema);
  if (!query.ok) return query.response;

  const resultat = await listerAudit({
    action: query.data.action ?? null,
    cibleId: query.data.cible_id ?? null,
    page: query.data.page,
    taille: query.data.taille,
  });
  if (!resultat.ok) return refusEnReponse(resultat.raison);

  return ok({
    entrees: resultat.donnees,
    // Le total vient de `total_lignes`, porte par chaque ligne. Une page vide
    // n'en a aucune : l'enveloppe le ramene a zero plutot que de disparaitre.
    ...pagination(
      resultat.donnees as { total_lignes?: number | string }[],
      query.data.page,
      query.data.taille,
    ),
  });
}

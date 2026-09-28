import { z } from 'zod';

import { gardeAdmin, refusEnReponse } from '@/lib/admin/route-helpers';
import { enregistrerMotDuMois } from '@/lib/admin/service';
import { ok } from '@/lib/http/responses';
import { parseJsonBody } from '@/lib/http/validate';

/**
 * LE MOT DU MOIS — le message du bureau, en tête de l'espace adhérent.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ ENREGISTRER ARCHIVE, N'ÉCRASE PAS.                                       │
 * │                                                                          │
 * │ `admin_enregistrer_mot_du_mois` désactive le précédent et en insère un   │
 * │ nouveau. Cette route ne le sait pas et n'a pas à le savoir : elle        │
 * │ transporte un texte et une signature. Si l'archivage devait changer, il  │
 * │ changerait à un seul endroit.                                            │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
const motSchema = z.object({
  texte: z.string().trim().min(1).max(2000),
  // Vide vaut ABSENT : la base pose alors « Le bureau de l'Association DAVE »,
  // qui est le cas courant. Un champ laissé vide ne doit pas produire un mot
  // non signé.
  signature: z.string().trim().max(160).optional(),
});

export async function PUT(request: Request): Promise<Response> {
  const garde = await gardeAdmin(request);
  if (!garde.ok) return garde.response;

  const corps = await parseJsonBody(request, motSchema);
  if (!corps.ok) return corps.response;

  const resultat = await enregistrerMotDuMois(
    garde.acteur.id,
    corps.data.texte,
    corps.data.signature ?? null,
  );
  if (!resultat.ok) return refusEnReponse(resultat.raison);

  return ok({ mot: resultat.donnees });
}

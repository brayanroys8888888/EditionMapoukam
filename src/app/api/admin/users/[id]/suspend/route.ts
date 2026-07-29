import { z } from 'zod';

import { gardeAdmin, refusEnReponse } from '@/lib/admin/route-helpers';
import { definirStatutCompte } from '@/lib/admin/service';
import { errors, ok } from '@/lib/http/responses';
import { parseJsonBody } from '@/lib/http/validate';

/**
 * Suspension et réactivation d'un compte — §4.3 F11.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LE COMPTE VISÉ EST DANS L'URL, L'ACTEUR VIENT DE LA SESSION.             │
 * │                                                                          │
 * │ Ce n'est pas une convention d'écriture, c'est la règle du point 2 :       │
 * │ aucune route d'administration n'accepte un identifiant de compte comme    │
 * │ AUTEUR de l'action. Un `acteur` dans le corps de la requête suffirait à   │
 * │ faire mentir le journal d'audit, qui nommerait quelqu'un d'autre.         │
 * │                                                                          │
 * │ Agir SUR un compte est le métier de l'administration ; agir EN TANT QUE   │
 * │ quelqu'un n'existe pas.                                                  │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
const corpsSchema = z.object({
  suspendu: z.boolean(),
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

  const resultat = await definirStatutCompte(
    garde.acteur.id,
    id,
    corps.data.suspendu,
    corps.data.motif ?? null,
  );
  if (!resultat.ok) return refusEnReponse(resultat.raison);

  return ok({ suspendu: corps.data.suspendu });
}

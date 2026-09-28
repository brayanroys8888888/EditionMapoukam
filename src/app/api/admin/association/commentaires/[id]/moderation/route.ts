import { z } from 'zod';

import { gardeAdmin, refusEnReponse } from '@/lib/admin/route-helpers';
import { modererCommentaireAssociation } from '@/lib/admin/service';
import { errors, ok } from '@/lib/http/responses';
import { parseJsonBody } from '@/lib/http/validate';

/**
 * MODÉRER UN ÉCHANGE ENTRE ADHÉRENTS.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ DEUX DÉCISIONS, ET LE SCHÉMA LES ÉNUMÈRE.                               │
 * │                                                                          │
 * │ `en_attente` n'en est pas une : un message renvoyé dans la file y        │
 * │ reviendrait indéfiniment sans que rien dise pourquoi. La base le refuse  │
 * │ déjà ; ce schéma le refuse plus tôt, avec un message qui parle du geste  │
 * │ plutôt que d'une contrainte.                                             │
 * │                                                                          │
 * │ Les deux contrôles sont voulus : celui-ci évite un aller-retour, celui   │
 * │ de la base tient quand l'appel ne vient pas d'ici.                        │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
const moderationSchema = z.object({
  decision: z.enum(['publie', 'masque']),
});

export async function POST(
  request: Request,
  contexte: { params: Promise<{ id: string }> },
): Promise<Response> {
  const garde = await gardeAdmin(request);
  if (!garde.ok) return garde.response;

  const corps = await parseJsonBody(request, moderationSchema);
  if (!corps.ok) return corps.response;

  const { id } = await contexte.params;
  if (!z.uuid().safeParse(id).success) return errors.introuvable();

  const resultat = await modererCommentaireAssociation(garde.acteur.id, id, corps.data.decision);
  if (!resultat.ok) return refusEnReponse(resultat.raison);

  return ok({ commentaire: resultat.donnees });
}

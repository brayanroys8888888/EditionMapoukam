import { z } from 'zod';

import { requireUser } from '@/lib/auth/session';
import { errors, ok } from '@/lib/http/responses';
import { parseSearchParams } from '@/lib/http/validate';
import { lireBibliotheque } from '@/lib/account/bibliotheque';
import { LANGUES } from '@/domain/catalog/schemas';
import { logger } from '@/lib/logger';

/**
 * Ma bibliothèque — §4.2 F7.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LE COMPTE VISÉ EST TOUJOURS CELUI DE LA SESSION.                        │
 * │                                                                          │
 * │ Aucun `user_id` n'est accepté en entrée. La règle de l'étape 13 vaut ici │
 * │ autant que côté administration : agir SUR quelqu'un peut se tracer,      │
 * │ LIRE la bibliothèque de quelqu'un d'autre n'a aucune justification.      │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * La composition des deux sections — et la raison pour laquelle elles ne
 * coïncident pas — vit dans `src/lib/account/bibliotheque.ts`, que la PAGE de
 * l'espace personnel appelle également.
 */
const requeteSchema = z.object({
  langue: z.enum(LANGUES).default('fr'),
});

export async function GET(request: Request): Promise<Response> {
  const garde = await requireUser(request);
  if (!garde.ok) return garde.response;

  const query = parseSearchParams(request, requeteSchema);
  if (!query.ok) return query.response;

  try {
    return ok(await lireBibliotheque(garde.appelant.id, query.data.langue));
  } catch (erreur) {
    logger.error('Bibliothèque illisible', { detail: erreur });
    return errors.interne(erreur);
  }
}

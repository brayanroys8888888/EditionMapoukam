import { z } from 'zod';

import { gardeAdmin, refusEnReponse } from '@/lib/admin/route-helpers';
import { poserVersionAssociation } from '@/lib/admin/service';
import { LANGUES_INTERFACE } from '@/i18n';
import { errors, ok } from '@/lib/http/responses';
import { parseJsonBody } from '@/lib/http/validate';

/**
 * LE TEXTE D'UN CONTENU, DANS UNE LANGUE — §3.6.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LE CORPS EST UN TABLEAU DE SECTIONS, ET IL EST VALIDÉ TROIS FOIS.       │
 * │                                                                          │
 * │ Ici, sur sa forme — un tableau de sections ayant chacune un titre et,     │
 * │ éventuellement, des paragraphes et des points. En base, sur son type      │
 * │ (`jsonb_typeof(corps) = 'array'`). Et une dernière fois à la lecture      │
 * │ publique, section par section, où une section mal formée est écartée      │
 * │ plutôt que de faire tomber la page.                                      │
 * │                                                                          │
 * │ Ce n'est pas une règle métier écrite trois fois : c'est une FORME, et     │
 * │ une forme se vérifie à chaque frontière qu'elle franchit. La règle        │
 * │ d'accès, elle, n'existe qu'une fois — dans `access_for_association`.      │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * `PUT` : écrire deux fois la même version donne le même résultat. La fonction
 * SQL insère ou remplace la ligne `(contenu, langue)`.
 */
const sectionSchema = z.object({
  titre: z.string().trim().min(1).max(200),
  paragraphes: z.array(z.string().trim().min(1).max(4000)).max(50).optional(),
  points: z.array(z.string().trim().min(1).max(1000)).max(50).optional(),
});

const versionSchema = z.object({
  // Les deux langues de l'interface, et elles seules : une version dans une
  // langue que rien n'affiche serait du texte écrit pour personne.
  langue: z.enum(LANGUES_INTERFACE),
  titre: z.string().trim().min(1).max(200),
  chapeau: z.string().trim().max(400).nullable().default(null),
  corps: z.array(sectionSchema).max(80).nullable().default(null),
});

export async function PUT(
  request: Request,
  contexte: { params: Promise<{ id: string }> },
): Promise<Response> {
  const garde = await gardeAdmin(request);
  if (!garde.ok) return garde.response;

  const corps = await parseJsonBody(request, versionSchema);
  if (!corps.ok) return corps.response;

  const { id } = await contexte.params;
  if (!z.uuid().safeParse(id).success) return errors.introuvable();

  const resultat = await poserVersionAssociation(garde.acteur.id, id, {
    langue: corps.data.langue,
    titre: corps.data.titre,
    chapeau: corps.data.chapeau,
    corps: corps.data.corps,
  });
  if (!resultat.ok) return refusEnReponse(resultat.raison);

  return ok(resultat.donnees);
}

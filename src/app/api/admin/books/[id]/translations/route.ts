import { z } from 'zod';

import { gardeAdmin, refusEnReponse } from '@/lib/admin/route-helpers';
import { modifierTraduction } from '@/lib/admin/service';
import { errors, ok } from '@/lib/http/responses';
import { parseJsonBody } from '@/lib/http/validate';

/**
 * Titre et résumé d'une version linguistique — §4.3 F10.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ POURQUOI CE QUI VIENT DU PDF DOIT QUAND MÊME POUVOIR ÊTRE CORRIGÉ.      │
 * │                                                                          │
 * │ La chaîne d'ingestion lit le titre dans les métadonnées du PDF, puis dans │
 * │ le nom de fichier. Elle a donc raison la plupart du temps, et tort        │
 * │ exactement là où on ne peut rien y faire : un PDF exporté depuis un       │
 * │ traitement de texte porte souvent « Document1 » en métadonnée.            │
 * │                                                                          │
 * │ Le résumé, lui, n'est JAMAIS extrait — il est nul après ingestion, et      │
 * │ c'est pourtant le texte qu'un client lit sur la fiche avant d'acheter.    │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LE SLUG N'EST PAS MODIFIABLE, ET SON ABSENCE EST UNE DÉCISION.          │
 * │                                                                          │
 * │ Il est dans l'URL publique du conte. Le changer casserait les liens       │
 * │ partagés, les marque-pages et les résultats déjà indexés, pour un gain    │
 * │ purement cosmétique — le slug n'est lu par personne.                      │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * La version visée est désignée par son propre identifiant, et le titre parent
 * par l'URL : la route vérifie que l'une appartient bien à l'autre, sans quoi
 * l'identifiant du parent ne servirait à rien et n'importe quelle version
 * pourrait être modifiée depuis n'importe quel titre.
 */
const corpsSchema = z
  .object({
    translation_id: z.uuid(),
    titre: z.string().trim().min(1).max(300).optional(),
    // Le résumé accepte la chaîne VIDE, qui le retire : c'est un champ
    // facultatif, et l'éditeur doit pouvoir effacer un texte qu'il a écrit.
    resume: z.string().trim().max(2000).optional(),
  })
  .refine((v) => v.titre !== undefined || v.resume !== undefined, {
    message: 'Aucun champ à modifier.',
    path: ['titre'],
  });

export async function PATCH(
  request: Request,
  contexte: { params: Promise<{ id: string }> },
): Promise<Response> {
  const garde = await gardeAdmin(request);
  if (!garde.ok) return garde.response;

  const corps = await parseJsonBody(request, corpsSchema);
  if (!corps.ok) return corps.response;

  const { id } = await contexte.params;
  if (!z.uuid().safeParse(id).success) return errors.introuvable();

  const resultat = await modifierTraduction(garde.acteur.id, id, corps.data.translation_id, {
    ...(corps.data.titre !== undefined ? { titre: corps.data.titre } : {}),
    ...(corps.data.resume !== undefined ? { resume: corps.data.resume } : {}),
  });
  if (!resultat.ok) return refusEnReponse(resultat.raison);

  return ok(resultat.donnees);
}

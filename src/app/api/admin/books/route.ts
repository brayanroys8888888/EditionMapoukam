import { z } from 'zod';

import { gardeAdmin, pagination, paginationSchema, refusEnReponse } from '@/lib/admin/route-helpers';
import { listerLivres, modifierLivre } from '@/lib/admin/service';
import { errors, ok } from '@/lib/http/responses';
import { parseJsonBody, parseSearchParams } from '@/lib/http/validate';

/**
 * Catalogue vu de l'administration — §4.3 F10.
 *
 * Chaque titre est rendu avec ce qui lui MANQUE pour être publiable, calculé par
 * `manques_pour_publication()` — la fonction même qu'applique le déclencheur de
 * publication. L'éditeur voit donc exactement ce que la base refusera, et non
 * une approximation qui laisserait découvrir le refus au moment de publier.
 */
const filtresSchema = paginationSchema.extend({
  statut: z.enum(['brouillon', 'publie', 'archive']).optional(),
});

export async function GET(request: Request): Promise<Response> {
  const garde = await gardeAdmin(request);
  if (!garde.ok) return garde.response;

  const query = parseSearchParams(request, filtresSchema);
  if (!query.ok) return query.response;

  const resultat = await listerLivres({
    statut: query.data.statut ?? null,
    page: query.data.page,
    taille: query.data.taille,
  });
  if (!resultat.ok) return refusEnReponse(resultat.raison);

  return ok({
    livres: resultat.donnees,
    // Le total vient de `total_lignes`, porte par chaque ligne. Une page vide
    // n'en a aucune : l'enveloppe le ramene a zero plutot que de disparaitre.
    ...pagination(
      resultat.donnees as { total_lignes?: number | string }[],
      query.data.page,
      query.data.taille,
    ),
  });
}

/**
 * Modification d'un titre, leviers commerciaux compris.
 *
 * `gratuit`, `inclus_abonnement` et `disponible_achat` sont INDÉPENDANTS : un
 * titre peut être simultanément inclus dans l'abonnement et vendu à l'unité
 * (règle métier centrale). Chacun est tracé séparément dans le journal d'audit,
 * pour qu'une modification touchant deux leviers ne produise pas une ligne
 * fourre-tout dont on ne saurait dire lequel a bougé.
 */
const modificationSchema = z
  .object({
    id: z.uuid(),
    gratuit: z.boolean().optional(),
    inclus_abonnement: z.boolean().optional(),
    disponible_achat: z.boolean().optional(),
    auteur: z.string().trim().min(1).max(200).optional(),
    origine_culturelle: z.string().trim().min(1).max(200).optional(),
    age_min: z.int().min(0).max(18).optional(),
    age_max: z.int().min(0).max(18).optional(),
    nb_pages_extrait: z.int().min(1).max(100).optional(),
  })
  .refine((v) => v.age_min === undefined || v.age_max === undefined || v.age_min <= v.age_max, {
    message: 'L’âge minimum ne peut pas dépasser l’âge maximum.',
    path: ['age_min'],
  });

export async function PATCH(request: Request): Promise<Response> {
  const garde = await gardeAdmin(request);
  if (!garde.ok) return garde.response;

  const corps = await parseJsonBody(request, modificationSchema);
  if (!corps.ok) return corps.response;

  const { id, ...champs } = corps.data;
  if (Object.values(champs).every((v) => v === undefined)) {
    return errors.validation({ _: ['Aucun champ à modifier.'] });
  }

  const resultat = await modifierLivre(garde.acteur.id, id, {
    ...(champs.gratuit !== undefined ? { gratuit: champs.gratuit } : {}),
    ...(champs.inclus_abonnement !== undefined
      ? { inclusAbonnement: champs.inclus_abonnement }
      : {}),
    ...(champs.disponible_achat !== undefined
      ? { disponibleAchat: champs.disponible_achat }
      : {}),
    ...(champs.auteur !== undefined ? { auteur: champs.auteur } : {}),
    ...(champs.origine_culturelle !== undefined
      ? { origineCulturelle: champs.origine_culturelle }
      : {}),
    ...(champs.age_min !== undefined ? { ageMin: champs.age_min } : {}),
    ...(champs.age_max !== undefined ? { ageMax: champs.age_max } : {}),
    ...(champs.nb_pages_extrait !== undefined
      ? { nbPagesExtrait: champs.nb_pages_extrait }
      : {}),
  });
  if (!resultat.ok) return refusEnReponse(resultat.raison);

  return ok(resultat.donnees);
}

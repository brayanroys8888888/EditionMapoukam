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
    illustrateur: z.string().trim().min(1).max(200).optional(),
    origine_culturelle: z.string().trim().min(1).max(200).optional(),
    /*
     * LES THÈMES ONT PRIS LA PLACE DE LA RÉGION.
     *
     * La région rangeait les contes par tradition d'origine. Elle ne disait
     * rien d'une fiche d'activités, qui n'en a pas — et depuis que le
     * catalogue porte deux supports, elle en cachait la moitié derrière un
     * filtre qui ne pouvait pas les décrire. Les thèmes valent pour les deux :
     * « ruse », « amitié », « saisons » se posent sur un conte comme sur un
     * livret.
     *
     * Ils sont en SAISIE LIBRE, et rien ne les énumère ici : les pastilles du
     * catalogue viennent des facettes, c'est-à-dire de ce que le catalogue
     * porte vraiment. Une liste fermée aurait à être rouverte à chaque idée.
     *
     * Un TABLEAU VIDE efface les thèmes — c'est ainsi que l'éditeur retire le
     * dernier. `undefined` les laisse intacts. Le nettoyage — vides retirés,
     * doublons fondus, ordre alphabétique — est fait EN BASE par
     * `admin_modifier_livre`, une seule fois, plutôt qu'à chaque appelant.
     */
    themes: z.array(z.string().trim().min(1).max(60)).max(12).optional(),
    /*
     * LE TYPE DE SUPPORT ET L'ORIENTATION, créés par la migration 0061.
     *
     * Ils n'ont pas été posables avant la 0062, et leur symptôme était MUET :
     * `conte` et `portrait` étant des valeurs par défaut non nulles, la
     * publication ne s'en plaignait pas. Un livret déposé serait simplement
     * resté un conte, en portrait, dans un catalogue qui ne saurait pas le
     * distinguer.
     *
     * L'orientation n'est pas déduite du fichier : l'ingestion connaît les
     * dimensions des pages, mais un livret porte souvent une couverture
     * portrait devant des planches paysage.
     */
    type_document: z.enum(['conte', 'livret_pedagogique']).optional(),
    orientation: z.enum(['paysage', 'portrait']).optional(),
    age_min: z.int().min(0).max(18).optional(),
    age_max: z.int().min(0).max(18).optional(),
    nb_pages_extrait: z.int().min(1).max(100).optional(),
    /*
     * LE NIVEAU ET LES OBJECTIFS — colonnes de la 0079, écrivables depuis
     * la 0081.
     *
     * Le niveau accepte la CHAÎNE VIDE, et c'est la seule chaîne vide acceptée
     * par ce schéma. Ailleurs, `min(1)` : effacer un auteur ou une origine
     * retiendrait la publication, l'éditeur n'a donc rien à y gagner. Le
     * niveau, lui, ne retient rien — un livret sans niveau reste publiable —
     * et l'éditeur doit pouvoir le retirer d'un titre où il n'a pas de sens.
     * `admin_modifier_livre` lit cette chaîne vide comme « efface » ; `null`
     * y voudrait dire « ne touche pas », et n'effacerait donc jamais rien.
     *
     * Les objectifs gardent leur ORDRE : ce sont les étapes d'un livret. Le
     * nettoyage — vides retirés — est fait en base, une fois, comme pour les
     * thèmes ; la seule chose que la base ne leur fait PAS est le tri.
     */
    niveau: z.string().trim().max(120).optional(),
    objectifs: z.array(z.string().trim().min(1).max(200)).max(12).optional(),
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
    ...(champs.illustrateur !== undefined ? { illustrateur: champs.illustrateur } : {}),
    ...(champs.origine_culturelle !== undefined
      ? { origineCulturelle: champs.origine_culturelle }
      : {}),
    ...(champs.themes !== undefined ? { themes: champs.themes } : {}),
    ...(champs.type_document !== undefined ? { typeDocument: champs.type_document } : {}),
    ...(champs.orientation !== undefined ? { orientation: champs.orientation } : {}),
    ...(champs.age_min !== undefined ? { ageMin: champs.age_min } : {}),
    ...(champs.age_max !== undefined ? { ageMax: champs.age_max } : {}),
    ...(champs.nb_pages_extrait !== undefined
      ? { nbPagesExtrait: champs.nb_pages_extrait }
      : {}),
    ...(champs.niveau !== undefined ? { niveau: champs.niveau } : {}),
    ...(champs.objectifs !== undefined ? { objectifs: champs.objectifs } : {}),
  });
  if (!resultat.ok) return refusEnReponse(resultat.raison);

  return ok(resultat.donnees);
}

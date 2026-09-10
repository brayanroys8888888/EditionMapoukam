import { z } from 'zod';

import { TYPES_DOCUMENT } from '@/domain/catalog/types';

/**
 * Validation des entrées du catalogue.
 *
 * Aucune règle métier ici : uniquement la forme des paramètres acceptés. Les
 * décisions — quels titres sortent, à quel prix, avec quel accès — sont prises
 * en SQL et par le moteur de droits.
 *
 * Les valeurs viennent d'une chaîne de requête : tout est donc coercé depuis du
 * texte, et borné. Une taille de page non bornée est une invitation à faire
 * tomber le service en demandant cent mille titres.
 */
export const LANGUES = ['fr', 'en'] as const;
export const TRIS = ['nouveautes', 'popularite', 'alphabetique', 'prix', 'pertinence'] as const;
export const TYPES_ACCES = ['abonnement', 'achat', 'gratuit'] as const;
export const ZONES = ['international', 'afrique'] as const;

export const TAILLE_PAGE_DEFAUT = 20;
export const TAILLE_PAGE_MAX = 50;

const listeSeparee = z
  .string()
  .transform((valeur) =>
    valeur
      .split(',')
      .map((element) => element.trim())
      .filter((element) => element.length > 0),
  )
  .pipe(z.array(z.string().min(1).max(60)).max(10));

export const catalogQuerySchema = z.object({
  langue: z.enum(LANGUES).default('fr'),

  /** Recherche plein texte. Bornée : une requête de 10 000 mots n'a aucun sens. */
  q: z.string().trim().min(1).max(200).optional(),

  age_min: z.coerce.number().int().min(0).max(18).optional(),
  age_max: z.coerce.number().int().min(0).max(18).optional(),

  themes: listeSeparee.optional(),
  origine: z.string().trim().min(1).max(80).optional(),

  /*
   * IL N'Y A PLUS DE FILTRE `region`.
   *
   * Retiré par la migration 0071, en même temps que le paramètre `p_region` de
   * `catalog_list` : la région ne s'applique qu'aux contes, si bien que
   * l'employer faisait disparaître tous les livrets pédagogiques. Le filtre de
   * `themes`, juste au-dessus, vaut pour les deux supports — c'est lui qui
   * prend la place.
   *
   * Un schéma Zod retirant les clés inconnues, une vieille adresse
   * `?region=sahel` mise en favori n'échoue pas : le paramètre est ignoré et
   * le catalogue complet s'affiche. C'est le comportement voulu — une page de
   * résultats vaut mieux qu'une erreur sur un lien partagé.
   */

  /**
   * Type de support — contes, livrets pédagogiques, ou les deux.
   *
   * Absent, il ne filtre RIEN : le catalogue reste ce qu'il était, les deux
   * types mêlés. Un défaut à « conte » aurait fait disparaître les livrets de
   * la recherche, du plan de site et des suggestions sans qu'un seul appelant
   * ait changé — le tri se demande, il ne s'impose pas.
   */
  type: z.enum(TYPES_DOCUMENT).optional(),

  acces: z.enum(TYPES_ACCES).optional(),

  /**
   * NIVEAU scolaire — un seul jeton à la fois : « MS », « CP ».
   *
   * ┌────────────────────────────────────────────────────────────────────────┐
   * │ C'EST LE FILTRE DU RAYON DES LIVRETS, ET DE LUI SEUL.                 │
   * │                                                                        │
   * │ Rien ne l'interdit ailleurs — le schéma ne connaît pas les écrans —    │
   * │ mais il n'y trouve rien : la colonne est nulle sur un conte. C'est le  │
   * │ symétrique de ce qui a fait sortir la région du catalogue à la 0071,   │
   * │ une facette qui ne s'applique qu'à une partie du fonds fait            │
   * │ disparaître le reste dès qu'on clique dessus.                          │
   * │                                                                        │
   * │ UN seul niveau, et non une liste comme les thèmes : les thèmes se      │
   * │ cumulent — on cherche « ruse ET animaux » —, les niveaux s'excluent.   │
   * │ On enseigne dans UNE classe, et « MS ou GS » est déjà ce que rend      │
   * │ « MS » sur un livret marqué « PS · MS · GS ».                          │
   * │                                                                        │
   * │ La comparaison se fait au JETON, en base : demander « MS » rend        │
   * │ « PS · MS · GS » comme « MS · GS ». Voir `niveaux_du_livre`, 0083.     │
   * └────────────────────────────────────────────────────────────────────────┘
   */
  niveau: z.string().trim().min(1).max(60).optional(),

  /**
   * Zone d'AFFICHAGE, provisoire et sans effet financier (docs/PLAN.md D4
   * point 5). La zone d'encaissement est déterminée au paiement, depuis le pays
   * réel du moyen de paiement, et elle seule est enregistrée sur la commande.
   */
  zone: z.enum(ZONES).default('international'),

  tri: z.enum(TRIS).default('nouveautes'),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  taille: z.coerce.number().int().min(1).max(TAILLE_PAGE_MAX).default(TAILLE_PAGE_DEFAUT),
});

export type CatalogQuery = z.infer<typeof catalogQuerySchema>;

export const ficheQuerySchema = z.object({
  langue: z.enum(LANGUES).default('fr'),
  zone: z.enum(ZONES).default('international'),
});

export const extraitQuerySchema = z.object({
  langue: z.enum(LANGUES).default('fr'),
  page: z.coerce.number().int().min(1).max(500).default(1),
});

/**
 * Cohérence de la tranche d'âge.
 *
 * Séparé du schéma pour que le message porte sur la combinaison plutôt que sur
 * l'un des deux champs : demander 8–3 ans n'est faux ni pour `age_min` seul,
 * ni pour `age_max` seul.
 */
export function trancheAgeCoherente(query: CatalogQuery): boolean {
  return query.age_min === undefined || query.age_max === undefined || query.age_min <= query.age_max;
}

import { z } from 'zod';

import { REGIONS_CONTE } from '@/domain/catalog/types';

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

  /**
   * Région du conte — énumération fermée, alimentée par `catalog_facets`.
   *
   * Elle a manqué jusqu'à l'étape F4 : la facette était rendue avec son
   * effectif, mais aucun paramètre ne permettait de l'appliquer. Un schéma Zod
   * retirant les clés inconnues, `?region=sahel` n'était pas refusé — il était
   * ignoré en silence, ce qui est le pire des deux.
   */
  region: z.enum(REGIONS_CONTE).optional(),

  acces: z.enum(TYPES_ACCES).optional(),

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

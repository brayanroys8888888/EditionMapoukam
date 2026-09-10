import { traduire, type LangueInterface } from '@/i18n';

/**
 * « 5–8 ans · 16 pages » — LA ligne de métadonnées, et il n'y en a qu'une.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ ELLE ÉTAIT ÉCRITE DEUX FOIS, ET ELLE L'AURAIT ÉTÉ TROIS.                │
 * │                                                                          │
 * │ `catalogue/index.tsx` et `v2/carte-conte.tsx` en portaient chacun une    │
 * │ copie — presque identiques, à un commentaire près. Le tiroir de panier   │
 * │ en réclamait une troisième.                                             │
 * │                                                                          │
 * │ Ce n'est pas une règle métier, mais c'en est une de FORME : la tranche   │
 * │ d'âge ouverte (« dès 5 ans ») et le point médian qui ne s'ajoute jamais  │
 * │ en queue sont deux décisions qu'on ne prend qu'une fois. Deux copies     │
 * │ divergent au premier titre sans pagination, et c'est toujours la copie   │
 * │ qu'on ne regarde pas qui affiche « 5–8 ans · ».                          │
 * └──────────────────────────────────────────────────────────────────────────┘
 */

/** Ce que la ligne de métadonnées demande — rien de plus. */
export interface DescriptionLivre {
  age_min: number | null;
  age_max: number | null;
  nb_pages: number | null;
}

/**
 * La tranche d'âge seule, ou `null` quand elle n'est pas renseignée.
 *
 * Un âge minimum sans maximum donne la forme OUVERTE — « dès 5 ans » — et
 * jamais « 5– ans » : la borne manquante est une donnée absente, pas un zéro.
 */
export function trancheAge(langue: LangueInterface, livre: DescriptionLivre): string | null {
  if (livre.age_min === null) return null;

  return livre.age_max === null
    ? traduire(langue, 'catalogue.trancheAgeCourteOuverte').replace(
        '{min}',
        String(livre.age_min),
      )
    : traduire(langue, 'catalogue.trancheAgeCourte')
        .replace('{min}', String(livre.age_min))
        .replace('{max}', String(livre.age_max));
}

/** L'âge et la pagination, séparés par un point médian. */
export function metaLivre(langue: LangueInterface, livre: DescriptionLivre): string {
  const morceaux: string[] = [];

  const age = trancheAge(langue, livre);
  if (age !== null) morceaux.push(age);

  if (livre.nb_pages !== null) {
    /*
     * ┌────────────────────────────────────────────────────────────────────┐
     * │ « 1 page », JAMAIS « 1 pages ».                                    │
     * │                                                                    │
     * │ Le défaut a vécu tant que le catalogue n'a porté que des contes de │
     * │ quatorze pages : aucun titre ne pouvait le montrer. Les feuilles   │
     * │ d'activité déposées le 7 septembre 2026 en font une page, et la    │
     * │ faute s'est affichée sur trois cartes d'un coup.                   │
     * │                                                                    │
     * │ Deux clés plutôt qu'une règle de pluriel : le singulier ne se      │
     * │ fabrique pas en retirant un « s ». L'anglais dit « 1 page / 2      │
     * │ pages », le français « 1 page / 2 pages », et une troisième langue │
     * │ pourrait avoir un duel. Une clé par forme laisse chaque traduction │
     * │ répondre pour elle-même.                                           │
     * └────────────────────────────────────────────────────────────────────┘
     */
    morceaux.push(
      livre.nb_pages === 1
        ? traduire(langue, 'catalogue.nbPagesUne')
        : traduire(langue, 'catalogue.nbPages').replace('{pages}', String(livre.nb_pages)),
    );
  }

  // Le point médian SÉPARE : il ne s'ajoute jamais en tête ni en queue.
  return morceaux.join(' · ');
}

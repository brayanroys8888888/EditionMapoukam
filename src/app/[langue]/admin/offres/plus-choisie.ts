/**
 * « LA PLUS CHOISIE » — la seule règle que cet écran invente.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ ELLE EST COMPTÉE, JAMAIS DÉCRÉTÉE — ET C'EST POUR ÇA QU'ELLE EST ICI.   │
 * │                                                                          │
 * │ Le prototype écrit « LE PLUS CHOISI » en dur sur sa première carte. Une  │
 * │ mention de ce genre est une affirmation faite au lecteur : elle doit      │
 * │ donc se vérifier, et le seul chiffre qui la vérifie est le nombre         │
 * │ d'abonnements que `admin_lister_offres` rend déjà.                       │
 * │                                                                          │
 * │ Extraite du composant pour être ÉPROUVÉE. Laissée dans le rendu, elle    │
 * │ n'aurait pu se tester qu'en lisant le HTML produit, et ses deux gardes   │
 * │ — celles qui l'empêchent de mentir — seraient restées sans test.          │
 * └──────────────────────────────────────────────────────────────────────────┘
 */

/** Le strict nécessaire : l'identité, le domaine, et le compte d'abonnés. */
export interface OffreComptee {
  id: string;
  domaine: string;
  /** `admin_lister_offres` rend un `bigint`, donc parfois une chaîne. */
  abonnements: number | string;
}

/**
 * Les offres qui portent la mention, une au plus par domaine.
 *
 * Trois gardes, et chacune répare un mensonge différent :
 *
 *  1. **au moins un abonné** — sans elle, la mention se poserait le premier
 *     jour sur une formule que personne n'a prise ;
 *  2. **strictement devant** — à égalité, deux formules se la disputeraient et
 *     l'ordre de la liste trancherait, c'est-à-dire le hasard ;
 *  3. **par domaine** — la lecture et l'adhésion ne se concurrencent pas ;
 *     comparer leurs effectifs dirait seulement lequel des deux publics est le
 *     plus nombreux, ce qui n'aide personne à choisir une formule.
 */
export function offresLesPlusChoisies(offres: readonly OffreComptee[]): Set<string> {
  const retenues = new Set<string>();
  const compte = (offre: OffreComptee): number => Number(offre.abonnements);

  for (const domaine of new Set(offres.map((offre) => offre.domaine))) {
    const duDomaine = offres.filter((offre) => offre.domaine === domaine);
    /*
     * `0` en graine, et non `-Infinity` : un domaine dont toutes les offres
     * sont à zéro doit donner une tête de zéro, que la garde suivante rejette.
     */
    const tete = Math.max(0, ...duDomaine.map(compte));
    if (tete <= 0) continue;

    const exaequo = duDomaine.filter((offre) => compte(offre) === tete);
    const seule = exaequo.length === 1 ? exaequo[0] : undefined;
    if (seule) retenues.add(seule.id);
  }

  return retenues;
}

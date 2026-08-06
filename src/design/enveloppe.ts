/**
 * QUELLE ENVELOPPE POUR QUELLE PAGE.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ UNE SEULE TABLE, LUE PAR L'ENVELOPPE — JAMAIS UNE CONDITION PAR ÉCRAN.  │
 * │                                                                          │
 * │ Chaque écran pourrait décider lui-même s'il veut une barre de            │
 * │ navigation. Ils le décideraient différemment, et l'un d'eux finirait par │
 * │ afficher deux pieds de page ou aucun — un défaut qu'on ne voit qu'en     │
 * │ visitant la page concernée.                                             │
 * │                                                                          │
 * │ La décision vit donc ici, en fonction du CHEMIN, et l'enveloppe l'applique.│
 * └──────────────────────────────────────────────────────────────────────────┘
 */

/** Ce que l'enveloppe rend autour d'un écran. */
export type SorteEnveloppe =
  /** En-tête et pied ordinaires — la plupart des écrans. */
  | 'complete'
  /**
   * En-tête TRANSPARENT posé sur le hero, qui blanchit au défilement.
   *
   * Réservé à l'accueil : c'est le seul écran dont le hero est une image assez
   * sombre pour porter du texte clair. Ailleurs, un en-tête transparent
   * deviendrait illisible.
   */
  | 'transparente'
  /**
   * Ni barre, ni pied.
   *
   * Deux familles d'écrans, pour deux raisons distinctes :
   *
   *   * l'AUTHENTIFICATION — ces cinq écrans n'ont qu'une tâche, et chaque
   *     élément qui ne la sert pas est une occasion de partir ailleurs au
   *     moment précis où l'on demande un mot de passe ;
   *
   *   * l'ADMINISTRATION — elle a son propre rail de navigation. Superposer
   *     l'en-tête public donnerait deux navigations concurrentes, et un pied
   *     de page commercial sous un tableau de commandes.
   */
  | 'nue';

/** Les segments d'authentification, sous `(auth)`. */
const AUTHENTIFICATION = new Set([
  'connexion',
  'inscription',
  'mot-de-passe-oublie',
  'nouveau-mot-de-passe',
  'confirmation',
]);

/**
 * Décide l'enveloppe d'un chemin.
 *
 * @param chemin chemin complet, préfixe de langue COMPRIS — `/fr/catalogue`.
 */
export function sorteEnveloppe(chemin: string): SorteEnveloppe {
  // `['', 'fr', 'catalogue', …]` — l'indice 2 porte le premier segment réel.
  const segments = chemin.split('/').filter(Boolean);
  const premier = segments[1];

  // `/fr` ou `/fr/` — l'accueil, et lui seul.
  if (premier === undefined) return 'transparente';

  if (premier === 'admin') return 'nue';
  if (AUTHENTIFICATION.has(premier)) return 'nue';

  return 'complete';
}

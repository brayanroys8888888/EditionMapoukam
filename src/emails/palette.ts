/**
 * ╔═══════════════════════════════════════════════════════════════════════════╗
 * ║ LA PALETTE DES EMAILS — un REFLET des jetons, vérifié par un test.        ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ POURQUOI CES VALEURS SONT ÉCRITES EN DUR, ALORS QUE C'EST INTERDIT.     │
 * │                                                                          │
 * │ `tests/unit/design-tokens.test.ts` refuse toute couleur littérale hors   │
 * │ de `src/design/tokens.css`, et il a raison : une seconde source de       │
 * │ vérité visuelle finit toujours par diverger.                             │
 * │                                                                          │
 * │ Un email n'a pourtant pas le choix. Gmail retire les feuilles de style,  │
 * │ et AUCUN client de messagerie ne résout `var(--v3-terre)` : une couleur  │
 * │ non littérale y disparaît purement et simplement. Le message partirait   │
 * │ en noir sur blanc.                                                       │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ CE QUI EMPÊCHE LA DIVERGENCE, PUISQUE LA COPIE EST INÉVITABLE.          │
 * │                                                                          │
 * │ Chaque valeur NOMME le jeton qu'elle reflète, et                         │
 * │ `tests/unit/emails-palette.test.ts` relit `tokens.css` pour exiger       │
 * │ qu'elles soient égales. Une retouche de la charte qui oublierait les     │
 * │ emails fait donc échouer la suite, au lieu de laisser partir des         │
 * │ messages aux anciennes couleurs pendant six mois.                        │
 * │                                                                          │
 * │ Une exception au test des jetons aurait, elle, rendu la dérive muette.   │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Les valeurs sont celles du thème CLAIR. Un email ne suit pas le thème du
 * lecteur : `prefers-color-scheme` n'est honoré que par une partie des
 * clients, et une version sombre à moitié appliquée est illisible.
 */

/** Chaque entrée : le jeton reflété, et sa valeur. */
export const PALETTE_EMAIL = {
  /** `--v3-fond` — la crème de fond de page. */
  fond: '#f5ead8',
  /** `--v3-carte` — la crème plus claire des surfaces posées dessus. */
  carte: '#f9f4ed',
  /** `--v3-fond-2` — la crème sourde, employée ici en filet. */
  ligne: '#efe3cd',
  /** `--v3-encre` — le texte courant. */
  encre: '#201e1d',
  /** `--v3-encre-douce` — les mentions secondaires. */
  encreDouce: '#645c50',
  /** `--v3-terre` — l'accent, fond du bouton. */
  terre: '#c67139',
  /** `--v3-terre-encre` — la terre assombrie, lisible en TEXTE sur crème. */
  terreEncre: '#8c491a',
} as const;

/**
 * Le blanc du texte sur le bouton.
 *
 * Il ne reflète aucun jeton : `--v3-terre` porte déjà `color:#fff` dans les
 * feuilles du site, et le contraste a été mesuré à cet endroit. Il est nommé
 * ici pour qu'aucune autre valeur claire ne soit inventée à sa place.
 */
export const BLANC = '#ffffff';

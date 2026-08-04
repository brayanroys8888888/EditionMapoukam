import type { ReactNode } from 'react';

/**
 * LES TROIS SEULES ICÔNES DU PRODUIT.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ AUCUNE BIBLIOTHÈQUE D'ICÔNES.                                           │
 * │                                                                          │
 * │ La direction artistique n'en retient que trois — loupe, buste, panier —  │
 * │ toutes trois dans l'en-tête. Installer une bibliothèque pour trois       │
 * │ tracés, c'est charger quelques centaines de kilooctets sur la connexion  │
 * │ lente qui est la condition réelle d'une partie du public (§5.1), et      │
 * │ ouvrir la porte à une quatrième icône, puis à une cinquième.             │
 * │                                                                          │
 * │ Les tracés viennent des maquettes, au point près.                        │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * `stroke: currentColor` : l'icône suit la couleur de texte de son conteneur,
 * y compris au survol. Sans cela, un bouton dont le texte fonce garderait une
 * icône claire — un détail qui se voit immédiatement.
 *
 * Toujours `aria-hidden` : le libellé accessible est porté par le `aria-label`
 * du contrôle qui les contient, jamais par le tracé.
 */

const COMMUNES = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2.2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
  focusable: false,
} as const;

export function IconeLoupe({ taille = 16 }: { taille?: number }): ReactNode {
  return (
    <svg {...COMMUNES} width={taille} height={taille}>
      <circle cx="11" cy="11" r="6.5" />
      <line x1="16" y1="16" x2="21" y2="21" />
    </svg>
  );
}

export function IconeCompte({ taille = 18 }: { taille?: number }): ReactNode {
  return (
    <svg {...COMMUNES} width={taille} height={taille}>
      <circle cx="12" cy="8" r="3.6" />
      <path d="M5 19.5a7 7 0 0 1 14 0" />
    </svg>
  );
}

export function IconePanier({ taille = 18 }: { taille?: number }): ReactNode {
  return (
    <svg {...COMMUNES} width={taille} height={taille}>
      <path d="M5 7.5h14l-1.4 11H6.4z" />
      <path d="M9 7.5a3 3 0 0 1 6 0" />
    </svg>
  );
}

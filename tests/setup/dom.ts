import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

/**
 * Préparation du DOM simulé.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LE NETTOYAGE N'EST PAS UNE POLITESSE.                                   │
 * │                                                                          │
 * │ Sans lui, les rendus s'accumulent dans le même document : une requête    │
 * │ `getByRole('button')` trouve alors le bouton du test PRÉCÉDENT, et un    │
 * │ test peut passer en observant ce qu'un autre a rendu. C'est une          │
 * │ validation vide de la pire espèce — verte, et portant sur autre chose.   │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
afterEach(() => {
  cleanup();
});

/**
 * `matchMedia` n'existe pas dans jsdom.
 *
 * Les composants qui respectent `prefers-reduced-motion` l'interrogent. Sans
 * cette implémentation, ils lèveraient — et le test échouerait pour une raison
 * qui n'a rien à voir avec ce qu'il vérifie.
 *
 * La valeur par défaut est `false` : le mouvement est actif, ce qui est le cas
 * le plus courant. Un test qui veut l'inverse le pose lui-même.
 */
if (typeof window !== 'undefined' && !window.matchMedia) {
  window.matchMedia = (requete: string): MediaQueryList =>
    ({
      matches: false,
      media: requete,
      onchange: null,
      addListener: () => undefined,
      removeListener: () => undefined,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      dispatchEvent: () => false,
    }) as MediaQueryList;
}

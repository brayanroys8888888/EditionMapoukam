import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';
import type * as NavigationNext from 'next/navigation';

/**
 * LE ROUTEUR DE NEXT N'EST PAS MONTÉ SOUS jsdom.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ `useRouter` LÈVE PLUTÔT QUE DE RENDRE null, ET C'EST VOULU DE LEUR PART. │
 * │                                                                          │
 * │ « invariant expected app router to be mounted » : hors d'une application │
 * │ Next, le contexte du routeur n'existe pas, et le crochet refuse de       │
 * │ deviner. Un composant client qui navigue — le tiroir du panier après     │
 * │ avoir retiré une ligne, la recherche du catalogue pendant la frappe —    │
 * │ ferait donc échouer des tests qui ne parlent ni de l'un ni de l'autre :  │
 * │ trois tests d'en-tête sont tombés ainsi, pour un routeur absent.         │
 * │                                                                          │
 * │ Le reste du module est CONSERVÉ tel quel (`importOriginal`) : seules les │
 * │ fonctions qui exigent le contexte sont fournies. `notFound` et           │
 * │ `redirect`, employés par les pages serveur, gardent leur vrai            │
 * │ comportement.                                                            │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Ce sont des `vi.fn()` et non des fonctions vides : un test qui voudra
 * vérifier qu'une action A NAVIGUÉ peut les interroger — ils vivent dans
 * `routeur.ts`, pour être importables des deux côtés.
 */
vi.mock('next/navigation', async (importOriginal) => {
  const reel = await importOriginal<typeof NavigationNext>();
  const { routeurSimule } = await import('./routeur');

  return { ...reel, useRouter: () => routeurSimule };
});

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
afterEach(async () => {
  cleanup();

  // Les espions du routeur sont PARTAGÉS entre les tests : sans remise à zéro,
  // un test lirait les navigations d'un autre — la même classe de défaut que
  // celle contre laquelle `cleanup()` protège le DOM.
  const { routeurSimule } = await import('./routeur');
  for (const espion of Object.values(routeurSimule)) espion.mockClear();
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

'use client';

import { useEffect, type ReactNode } from 'react';

/**
 * LE FILET DE L'EN-TÊTE, QUI N'APPARAÎT QU'UNE FOIS LA PAGE DÉFILÉE.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ L'ATTRIBUT DIT « JE SUIS EN HAUT », PAS « J'AI DÉFILÉ ».                 │
 * │                                                                          │
 * │ `10-animation-spec.md` demande un `data-scrolled` qui AJOUTE le filet.   │
 * │ On pose l'inverse — `data-sommet` — et pour une raison qui ne se voit    │
 * │ qu'en coupant le script : l'attribut n'existe pas dans le HTML servi.    │
 * │                                                                          │
 * │ Avec `data-scrolled`, un navigateur sans JavaScript n'aurait JAMAIS le   │
 * │ filet, et l'en-tête translucide flotterait sans limite au-dessus du      │
 * │ contenu qui passe dessous. Avec `data-sommet`, il l'a TOUJOURS : c'est   │
 * │ l'état sûr, et le script ne fait que le retirer là où il gêne.           │
 * │                                                                          │
 * │ C'est le même raisonnement que `EnteteReactif` tient sur son fond, et il │
 * │ vaut ici pour la même raison : ce qui se dégrade doit se dégrader vers   │
 * │ le lisible.                                                              │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Le composant ne rend RIEN. Il pose l'attribut sur `<html>`, à côté de
 * `data-design` et `data-theme` — l'en-tête et la barre utilitaire sont deux
 * éléments distincts, et une classe posée sur l'un ne saurait pas viser l'autre.
 */

/** Le seuil du dossier : huit pixels. Assez pour ne pas trembler au repos. */
const SEUIL = 8;

export function SuiviDefilement(): ReactNode {
  useEffect(() => {
    const racine = document.documentElement;

    function mesurer(): void {
      /*
       * `dataset` plutôt qu'une classe : `<html>` porte déjà `data-design` et
       * `data-theme`, et un troisième attribut de même nature se lit d'un coup
       * d'œil dans l'inspecteur — là où une classe se perdrait parmi celles
       * des modules CSS, hachées et illisibles.
       */
      if (window.scrollY <= SEUIL) racine.dataset['sommet'] = 'true';
      else delete racine.dataset['sommet'];
    }

    mesurer();
    window.addEventListener('scroll', mesurer, { passive: true });

    return () => {
      window.removeEventListener('scroll', mesurer);
      // Le composant démonté rend l'état sûr : le filet revient.
      delete racine.dataset['sommet'];
    };
  }, []);

  return null;
}

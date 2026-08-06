'use client';

import { useEffect } from 'react';

/**
 * PLACE LA VUE JUSTE SOUS LE BANDEAU DE TÊTE, À L'OUVERTURE.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ DÉPLACER LA PAGE SOUS QUELQU'UN EST HOSTILE — D'OÙ TROIS GARDES.        │
 * │                                                                          │
 * │ Le placement n'est acceptable qu'à l'ouverture, et à condition de ne     │
 * │ jamais contredire une intention de l'utilisateur :                       │
 * │                                                                          │
 * │   1. rien si l'URL porte une ancre — elle désigne déjà une destination ; │
 * │   2. rien si la page est déjà défilée — retour arrière, position         │
 * │      restaurée par le navigateur : l'utilisateur était quelque part ;    │
 * │   3. rien si le bandeau est introuvable — mieux vaut ne pas bouger que   │
 * │      se placer au hasard.                                                │
 * │                                                                          │
 * │ La quatrième garde a disparu avec ce qu'elle protégeait : elle sautait   │
 * │ le glissement sous `prefers-reduced-motion`. Il n'y a plus de            │
 * │ glissement du tout — voir l'encadré du corps.                            │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Le composant ne rend RIEN : il n'agit qu'au montage.
 */
export function DefilementSousHero({
  /**
   * Le sélecteur du bandeau à dépasser.
   *
   * Passé par l'appelant plutôt que deviné : chaque écran nomme sa propre
   * bannière, et un sélecteur codé ici deviendrait faux au premier écran qui
   * emploie une autre classe.
   */
  cible,
}: {
  cible: string;
}): null {
  useEffect(() => {
    // 1. Une ancre est une destination explicite : on ne la contredit pas.
    if (window.location.hash) return;

    // 2. Déjà quelque part — position restaurée, ou l'utilisateur a devancé
    //    l'effet en faisant défiler pendant le chargement.
    if (window.scrollY > 4) return;

    const banniere = document.querySelector(cible);
    // 4. Introuvable : on ne défile pas au hasard.
    if (!banniere) return;

    /*
     * ┌──────────────────────────────────────────────────────────────────────┐
     * │ ON SE PLACE, ON NE DÉFILE PAS.                                       │
     * │                                                                      │
     * │ Le glissement animé traversait la bannière sous les yeux du lecteur  │
     * │ à chaque ouverture : un demi-seconde de mouvement qu'il n'a pas       │
     * │ demandé, à chaque page. Et il ratait sa cible dès que la mise en      │
     * │ page bougeait pendant l'animation.                                    │
     * │                                                                      │
     * │ Le saut instantané se voit à peine — c'est un rendu de plus, pas un   │
     * │ mouvement — et il atterrit toujours au même endroit.                  │
     * │                                                                      │
     * │ La marge de 96 px disparaît avec lui : elle laissait paraître une     │
     * │ bande de bannière pour adoucir l'arrivée du glissement. Sans          │
     * │ glissement, elle ne fait que placer la vue AVANT le bas du bandeau,   │
     * │ c'est-à-dire pas là où on la veut.                                    │
     * └──────────────────────────────────────────────────────────────────────┘
     */
    const cibleY = banniere.getBoundingClientRect().bottom + window.scrollY;
    if (cibleY < 24) return;

    /*
     * Deux images successives, plutôt qu'une minuterie de 120 ms.
     *
     * La première laisse le navigateur poser la mise en page, la seconde la
     * mesure une fois posée. C'est la même précaution qu'avant — mesurer trop
     * tôt donne une position qui n'existe déjà plus — mais elle se règle sur
     * le rendu réel au lieu d'un délai deviné, donc sans bandeau visible
     * entre-temps.
     */
    let second = 0;
    const premier = window.requestAnimationFrame(() => {
      second = window.requestAnimationFrame(() => {
        const bas = banniere.getBoundingClientRect().bottom + window.scrollY;
        window.scrollTo({ top: bas, behavior: 'auto' });
      });
    });

    return () => {
      window.cancelAnimationFrame(premier);
      window.cancelAnimationFrame(second);
    };
  }, [cible]);

  return null;
}

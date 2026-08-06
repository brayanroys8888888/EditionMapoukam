'use client';

import { useEffect, useState, type ReactNode } from 'react';

import styles from '@/components/enveloppe/v2.module.css';

/**
 * L'EN-TÊTE QUI SE POSE SUR LE HERO, PUIS SE REMPLIT AU DÉFILEMENT.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ IL COMMENCE TRANSPARENT — ET C'EST LE PIÈGE.                            │
 * │                                                                          │
 * │ Un en-tête transparent n'est lisible que sur l'image sombre du hero. Dès │
 * │ qu'on défile, le contenu qui passe dessous est de la crème claire : le   │
 * │ texte blanc y devient illisible, et le défaut n'apparaît qu'après un     │
 * │ geste — c'est-à-dire jamais pendant qu'on écrit le composant.            │
 * │                                                                          │
 * │ Le basculement se déclenche donc TÔT, à quarante pixels, bien avant que  │
 * │ le hero ne quitte l'écran. Mieux vaut un fond qui apparaît un peu tôt    │
 * │ qu'un titre illisible une demi-seconde.                                  │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ SANS JAVASCRIPT, L'EN-TÊTE EST PLEIN — jamais transparent.              │
 * │                                                                          │
 * │ L'état initial rendu par le serveur porte déjà le fond. Le composant le  │
 * │ RETIRE au montage, une fois qu'il peut aussi le remettre. L'inverse —    │
 * │ commencer transparent et compter sur le script pour remplir — laisserait │
 * │ un en-tête illisible sur tout navigateur où le script échoue.            │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export function EnteteReactif({ children }: { children: ReactNode }): ReactNode {
  /*
   * `pose` : l'en-tête est-il posé sur le hero, sans fond ?
   *
   * Faux au premier rendu — donc fond plein, y compris dans le HTML servi.
   */
  const [pose, setPose] = useState(false);

  useEffect(() => {
    function mesurer(): void {
      // Au-delà de 40 px, le hero commence à sortir : on remet le fond.
      setPose(window.scrollY < 40);
    }

    // Le premier appel peut déjà rendre l'en-tête transparent — mais seulement
    // maintenant, c'est-à-dire une fois que l'écouteur qui le remplira est en
    // place. Sans cet ordre, un rechargement en milieu de page laisserait un
    // en-tête transparent sur du contenu clair.
    mesurer();

    window.addEventListener('scroll', mesurer, { passive: true });
    return () => {
      window.removeEventListener('scroll', mesurer);
    };
  }, []);

  /*
   * ┌──────────────────────────────────────────────────────────────────────────┐
   * │ `enteteSuperpose` EST POSÉE TOUJOURS, ET JAMAIS RETIRÉE AU DÉFILEMENT.  │
   * │                                                                          │
   * │ Elle sort l'en-tête du flux. Sans elle, l'en-tête était `sticky` — donc  │
   * │ il OCCUPAIT sa place — et le hero commençait dessous : l'image ne         │
   * │ passait pas derrière la navigation, et les boutons de l'en-tête          │
   * │ transparent se retrouvaient sur la crème de la page, invisibles.         │
   * │                                                                          │
   * │ Elle est indépendante de `pose` exprès. Basculer la position en même     │
   * │ temps que la couleur ferait ressauter la page de la hauteur de           │
   * │ l'en-tête au quarantième pixel de défilement — un tressaut qu'on         │
   * │ n'attribuerait jamais à un changement de couleur.                        │
   * └──────────────────────────────────────────────────────────────────────────┘
   */
  const classes = [styles.entete, styles.enteteSuperpose];
  if (pose) classes.push(styles.entetePose);

  return <header className={classes.join(' ')}>{children}</header>;
}

import type { CSSProperties, ReactNode } from 'react';

import type { RegionConte } from '@/domain/catalog/types';
import styles from './motif.module.css';

/**
 * APLAT DE MOTIF GÉOMÉTRIQUE — le substitut universel d'une image absente.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ IL N'Y A PAS DE RECTANGLE GRIS DANS CE PRODUIT.                         │
 * │                                                                          │
 * │ C'est la règle qui prime sur toutes les autres dans la direction         │
 * │ artistique : partout où une illustration manque — ornement d'encart,     │
 * │ vignette de tradition, volet d'un écran de compte, aplat du hero — la    │
 * │ place est tenue par la couleur de la tradition portant l'un des six      │
 * │ motifs.                                                                  │
 * │                                                                          │
 * │ Un bloc vide, une zone hachurée ou une icône d'image cassée se lisent    │
 * │ tous comme une panne. Un aplat à motif se lit comme une intention.       │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Toujours `aria-hidden` : c'est de la décoration, et l'annoncer ferait perdre
 * du temps à qui écoute la page sans rien lui apprendre.
 */

/** Où le motif est posé. Chaque emplacement a sa hauteur, relevée des maquettes. */
export type PlaceMotif =
  /** Ornement en tête d'encart — bandeau de 56 px. */
  | 'encart'
  /** Vignette d'une carte de tradition — 74 px. */
  | 'vignette'
  /** Aplat de rythme dans un texte long — 110 px. */
  | 'rythme'
  /** Hero et volets de compte : le motif prend toute la hauteur du conteneur. */
  | 'plein';

const HAUTEURS: Record<PlaceMotif, string> = {
  encart: '56px',
  vignette: '74px',
  rythme: '110px',
  plein: '100%',
};

/**
 * `'vide'` — le seul motif jaune du produit, celui de l'état « aucun résultat ».
 *
 * Il n'appartient à aucune tradition, et c'est délibéré : un catalogue vide
 * n'a pas d'origine. Lui donner la couleur d'une région ferait croire que le
 * filtre régional est en cause, ce qui est faux quatre fois sur cinq.
 */
export type TeinteMotif = RegionConte | 'vide' | null;

interface ProprietesMotif {
  region: TeinteMotif;
  place: PlaceMotif;
  /**
   * La variante douce du motif de l'Ouest, réservée à l'aplat du hero.
   *
   * Le motif ordinaire est trop appuyé derrière une couverture : la maquette
   * lui substitue une trame plus claire, croisillonnée. Sans effet sur les
   * autres traditions, qui n'ont qu'une recette.
   */
  hero?: boolean;
  /** Rayon propre à l'emplacement — 11 px par défaut, 0 sous un `overflow: hidden`. */
  rayon?: string;
  className?: string;
}

export function Motif({ region, place, hero = false, rayon, className }: ProprietesMotif): ReactNode {
  // Une région absente ne doit jamais se produire — elle est exigée à la
  // publication. Le repli est neutre plutôt que coloré : inventer une couleur
  // ferait prétendre une origine au conte.
  const cle = region ?? 'inconnue';
  const variante = hero && cle === 'afrique_ouest' ? '-hero' : '';

  const style = {
    '--motif-fond': `var(--region-${cle}-motif)`,
    '--motif-dessin': `var(--motif-${cle}${variante})`,
    // Deux recettes seulement portent une taille de fond ; la variable est
    // absente pour les autres, et le repli `auto` du module s'applique.
    '--motif-taille': `var(--motif-${cle}-taille, auto)`,
    '--motif-hauteur': HAUTEURS[place],
    ...(rayon === undefined ? {} : { '--motif-rayon': rayon }),
  } as CSSProperties;

  return (
    <span
      aria-hidden="true"
      className={className === undefined ? styles.motif : `${styles.motif} ${className}`}
      style={style}
    />
  );
}

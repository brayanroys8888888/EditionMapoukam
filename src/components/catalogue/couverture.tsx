'use client';

import { useState, type ReactNode } from 'react';

import { traduire, type LangueInterface } from '@/i18n';
import type { RegionConte } from '@/domain/catalog/types';
import { Motif } from '@/components/motif';
import styles from './catalogue.module.css';

/**
 * Couverture d'un conte, avec substitut si l'image manque.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ UN JETON DE COUVERTURE NE GARANTIT PAS QUE LE FICHIER EXISTE.           │
 * │                                                                          │
 * │ La base porte `couverture_jeton`, à partir duquel l'URL publique est     │
 * │ construite. Mais le jeton et le fichier vivent dans deux systèmes        │
 * │ différents — une ligne SQL et un objet de stockage — et rien n'oblige    │
 * │ le second à suivre le premier.                                          │
 * │                                                                          │
 * │ C'est arrivé sur le corpus de démonstration : les huit titres publiés    │
 * │ portaient un jeton, le bucket `covers` était vide, et la grille rendait  │
 * │ huit images cassées. Un `couverture === null` n'aurait rien vu : le      │
 * │ jeton, lui, était bien là.                                              │
 * │                                                                          │
 * │ Le substitut est donc déclenché par l'ÉCHEC DE CHARGEMENT, seul signal   │
 * │ qui dise la vérité — et il protège aussi des cas ordinaires en           │
 * │ production : objet purgé, CDN en défaut, migration de stockage.          │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * `use client` pour la seule gestion de l'erreur. Sans JavaScript, l'image est
 * demandée normalement et le navigateur affiche son propre substitut : le
 * comportement se dégrade, il ne casse pas.
 */
export function Couverture({
  langue,
  url,
  largeur,
  hauteur,
  tailles,
  region,
  alt,
  eager = false,
  classeImage,
}: {
  langue: LangueInterface;
  url: string;
  largeur: number;
  hauteur: number;
  tailles: string;
  /** Décide la couleur du substitut : jamais une teinte choisie au hasard. */
  region: RegionConte | null;
  /**
   * Descriptif du CONTENU de l'illustration.
   *
   * Jamais « couverture » seul, qui n'apprend rien à qui ne voit pas l'image.
   * Vide quand la couverture ne fait que redire le titre affiché juste à côté
   * — la répéter ferait entendre deux fois la même phrase.
   */
  alt: string;
  /** `eager` pour la seule image du hero, jamais dans une grille. */
  eager?: boolean;
  /** Mise en forme propre à l'écran — la grille et la fiche ne se ressemblent pas. */
  classeImage?: string;
}): ReactNode {
  const [manquante, setManquante] = useState(false);

  if (manquante) return <SubstitutCouverture langue={langue} region={region} />;

  return (
    <img
      src={url}
      srcSet={`${url} ${String(largeur)}w`}
      sizes={tailles}
      width={largeur}
      height={hauteur}
      loading={eager ? 'eager' : 'lazy'}
      decoding="async"
      alt={alt}
      className={classeImage ?? styles.couverture}
      onError={() => {
        setManquante(true);
      }}
    />
  );
}

/**
 * Le substitut : l'aplat de motif de la tradition, jamais un rectangle gris.
 *
 * Exporté séparément pour les cas où l'absence est connue AVANT le rendu —
 * `couverture === null`, un titre en cours d'ingestion — et où il serait
 * absurde de demander une image dont on sait qu'elle n'existe pas.
 */
export function SubstitutCouverture({
  langue,
  region,
}: {
  langue: LangueInterface;
  region: RegionConte | null;
}): ReactNode {
  return (
    <span className={styles.couvertureAbsente}>
      <Motif
        region={region}
        place="plein"
        rayon="0"
        className={styles.couvertureAbsenteMotif}
      />
      <span className={styles.couvertureAbsenteTexte}>
        {traduire(langue, 'catalogue.sansCouverture')}
      </span>
    </span>
  );
}

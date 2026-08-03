'use client';

import { useState, type ReactNode } from 'react';

import { traduire, type LangueInterface } from '@/i18n';
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
  classeImage,
  classeSubstitut,
}: {
  langue: LangueInterface;
  url: string;
  largeur: number;
  hauteur: number;
  tailles: string;
  /** Mise en forme propre à l'écran — la grille et la fiche ne se ressemblent pas. */
  classeImage?: string;
  classeSubstitut?: string;
}): ReactNode {
  const [manquante, setManquante] = useState(false);

  if (manquante) {
    return (
      <span className={classeSubstitut ?? styles.couvertureAbsente}>
        {traduire(langue, 'catalogue.sansCouverture')}
      </span>
    );
  }

  return (
    <img
      src={url}
      srcSet={`${url} ${String(largeur)}w`}
      sizes={tailles}
      width={largeur}
      height={hauteur}
      loading="lazy"
      decoding="async"
      alt=""
      className={classeImage ?? styles.couverture}
      onError={() => {
        setManquante(true);
      }}
    />
  );
}

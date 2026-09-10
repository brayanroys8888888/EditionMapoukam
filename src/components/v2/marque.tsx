import type { ReactNode } from 'react';

import { traduire, type LangueInterface } from '@/i18n';
import styles from './marque.module.css';

/**
 * LE MOT-SYMBOLE, avec le logo officiel.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LE NOM EST TOUJOURS ÉCRIT À CÔTÉ, EN TEXTE.                             │
 * │                                                                          │
 * │ Le logo est posé en masque CSS : si `mask-image` échouait — navigateur   │
 * │ ancien, image non chargée sur une connexion coupée — il ne resterait     │
 * │ qu'un disque coloré. Le nom en toutes lettres fait que la marque reste   │
 * │ lisible dans tous les cas, y compris pour qui écoute la page.            │
 * │                                                                          │
 * │ Il vient de `marque.nom`, l'unique clé du dictionnaire : un test échoue  │
 * │ s'il est écrit ailleurs.                                                 │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export function Marque({
  langue,
  petite = false,
  ton = 'clair',
  signature = false,
  className,
}: {
  langue: LangueInterface;
  /** Version réduite — pied de page, rail d'administration. */
  petite?: boolean;
  /**
   * Le fond sur lequel la marque est posée.
   *
   * `clair` — disque vert sur crème. `sombre` — disque ocre sur vert nuit.
   * `image` — disque crème, au-dessus d'une photographie.
   */
  ton?: 'clair' | 'sombre' | 'image';
  /**
   * La SIGNATURE sous le nom — « Contes d’Afrique ».
   *
   * Elle n’existe que dans l’en-tête de bureau du prototype. Le pied, lui,
   * porte la marque SANS signature et la baseline complète juste dessous :
   * les deux l’une sur l’autre diraient deux fois la même chose, en plus
   * court et en plus long.
   */
  signature?: boolean;
  className?: string;
}): ReactNode {
  const classes = [
    styles.marque,
    petite ? styles.marquePetite : null,
    ton === 'sombre' ? styles.surSombre : null,
    ton === 'image' ? styles.surImage : null,
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <a className={classes} href={`/${langue}`}>
      {/*
       * ┌──────────────────────────────────────────────────────────────────┐
       * │ LE SCEAU PORTE LE LOGO OFFICIEL — RECADRÉ SUR SON EMBLÈME.       │
       * │                                                                  │
       * │ Le fichier fourni est un LOCKUP : l'emblème ET les deux mots      │
       * │ « Editions Mapoukam », l'un sous l'autre. Réduit au disque de     │
       * │ 44 px, il rendait des mots hauts de quatre pixels.                │
       * │                                                                  │
       * │ Ce qu'il fallait retirer, ce sont les MOTS, pas le logo :         │
       * │ `logo-mapoukam-marque.png` est le même fichier, découpé sur la    │
       * │ ligne vide qu'il porte entre l'emblème et le mot. Aucun trait     │
       * │ n'est redessiné, et le nom reste écrit à côté, en texte.          │
       * │                                                                  │
       * │ Le dessin vit dans la FEUILLE, en masque : le composant ne        │
       * │ connaît ni la direction visuelle ni le thème, et c'est ce qui     │
       * │ lui permet d'être le même partout.                                │
       * │                                                                  │
       * │ Décoratif : le nom qui suit porte déjà l'information.             │
       * └──────────────────────────────────────────────────────────────────┘
       */}
      <span className={styles.sceau} aria-hidden="true" />
      {signature ? (
        <span className={styles.bloc}>
          <span className={styles.nom}>{traduire(langue, 'marque.nom')}</span>
          <span className={styles.signature}>{traduire(langue, 'marque.signature')}</span>
        </span>
      ) : (
        traduire(langue, 'marque.nom')
      )}
    </a>
  );
}

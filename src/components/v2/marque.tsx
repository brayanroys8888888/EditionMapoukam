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
      {/* Décoratif : le nom qui suit porte déjà l'information. */}
      <span className={styles.sceau} aria-hidden="true" />
      {traduire(langue, 'marque.nom')}
    </a>
  );
}

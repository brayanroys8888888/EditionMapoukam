import type { ReactNode } from 'react';

import styles from './bulles.module.css';

/**
 * LE DÉCOR ANIMÉ DE L'ARRIÈRE-PLAN.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ `aria-hidden`, ET AUCUN CONTENU.                                        │
 * │                                                                          │
 * │ Ce sont cinq `<span>` vides. Ils ne portent aucune information, ne sont  │
 * │ pas atteignables, et ne sont jamais annoncés. Un décor qui s'annonce est │
 * │ un décor qui interrompt.                                                 │
 * │                                                                          │
 * │ `pointer-events: none` en plus : posés en `fixed` par-dessus toute la    │
 * │ fenêtre, ils intercepteraient sinon chaque clic de la page.              │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Rendu une seule fois, dans l'enveloppe de langue — jamais par écran : cinq
 * champs de bulles superposés multiplieraient un effet déjà coûteux.
 */
export function Bulles(): ReactNode {
  return (
    <div className={styles.champ} aria-hidden="true">
      <span className={`${styles.bulle} ${styles.une}`} />
      <span className={`${styles.bulle} ${styles.deux}`} />
      <span className={`${styles.bulle} ${styles.trois}`} />
      <span className={`${styles.bulle} ${styles.quatre}`} />
      <span className={`${styles.bulle} ${styles.cinq}`} />
    </div>
  );
}

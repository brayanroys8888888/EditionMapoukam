import type { ReactNode } from 'react';

import { traduire, type LangueInterface } from '@/i18n';
import styles from './espace.module.css';

/**
 * ESPACE PERSONNEL — §4.2 F7, et §G des maquettes.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ AUCUNE DONNÉE D'ENFANT, NULLE PART DANS CET ÉCRAN.                      │
 * │                                                                          │
 * │ La maquette affiche « Page 7 sur 32 · lu par Kadi » sur les reprises de  │
 * │ lecture. Ce prénom est une donnée d'enfant : la règle de conformité      │
 * │ l'interdit partout, le schéma ne le porte nulle part, et la page de      │
 * │ confidentialité affirme le contraire de ce que la maquette affiche.      │
 * │                                                                          │
 * │ La mention est supprimée, et elle ne doit pas revenir : le compte        │
 * │ appartient à l'adulte, et lui seul.                                      │
 * └──────────────────────────────────────────────────────────────────────────┘
 */

/** Les trois onglets, et leur chemin. */
const ONGLETS = [
  { cle: 'compte.bibliotheque', chemin: 'compte/bibliotheque' },
  { cle: 'compte.abonnement', chemin: 'compte/abonnement' },
  { cle: 'compte.parametres', chemin: 'compte' },
] as const;

export type OngletEspace = (typeof ONGLETS)[number]['chemin'];

/**
 * Gabarit à deux colonnes de l'espace personnel.
 *
 * La navigation est faite de LIENS, jamais de boutons : chaque onglet est une
 * route réelle, partageable et atteignable sans JavaScript. `aria-current`
 * porte l'onglet ouvert — l'inversion de couleur ne fait que le redire.
 */
export function GabaritEspace({
  langue,
  onglet,
  email,
  children,
}: {
  langue: LangueInterface;
  onglet: OngletEspace;
  /**
   * L'adresse du TITULAIRE — un adulte.
   *
   * C'est la seule donnée personnelle de cette colonne, et elle est là pour
   * répondre à une question précise : « avec quel compte suis-je connecté ? ».
   */
  email: string;
  children: ReactNode;
}): ReactNode {
  return (
    <div className={styles.gabarit}>
      <nav className={styles.colonneNav} aria-label={traduire(langue, 'compte.titre')}>
        <p className={styles.navIntitule}>{traduire(langue, 'compte.titre')}</p>

        <div className={styles.onglets}>
          {ONGLETS.map((entree) => {
            const actif = entree.chemin === onglet;
            return (
              <a
                key={entree.chemin}
                className={actif ? `${styles.onglet} ${styles.ongletActif}` : styles.onglet}
                href={`/${langue}/${entree.chemin}`}
                aria-current={actif ? 'page' : undefined}
              >
                {traduire(langue, entree.cle)}
              </a>
            );
          })}
        </div>

        <p className={styles.navNote}>{email}</p>
      </nav>

      <div className={styles.contenu}>{children}</div>
    </div>
  );
}

export { styles as stylesEspace };

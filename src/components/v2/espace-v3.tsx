import type { ReactNode } from 'react';

import { traduire, type LangueInterface } from '@/i18n';

import styles from './espace-v3.module.css';

/**
 * ╔═══════════════════════════════════════════════════════════════════════════╗
 * ║ L'ESPACE PERSONNEL, SOUS ORGANIC (V3).                                    ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 *
 * Reproduit la maquette profil V3 :
 * - Bannière d'en-tête (Avatar + Nom + Statuts à droite)
 * - Navigation latérale gauche avec pastille orange sur l'onglet actif
 * - Zone de contenu à droite
 */

/**
 * Les onglets et leurs chemins de l'espace personnel.
 */
const ONGLETS = [
  { cle: 'compte.bibliotheque', chemin: 'compte/bibliotheque', icone: 'bibliotheque' },
  { cle: 'compte.parametres', chemin: 'compte', icone: 'informations' },
  { cle: 'compte.commandes', chemin: 'compte/commandes', icone: 'commandes' },
  { cle: 'compte.abonnement', chemin: 'compte/abonnement', icone: 'abonnement' },
] as const;

export type OngletEspaceV3 = (typeof ONGLETS)[number]['chemin'];

function IconeOnglet({ nom }: { nom: string }) {
  if (nom === 'bibliotheque') {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
        <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
      </svg>
    );
  }
  if (nom === 'informations') {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
        <circle cx="12" cy="7" r="4" />
      </svg>
    );
  }
  if (nom === 'commandes') {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="3 6 5 6 21 6" />
        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      </svg>
    );
  }
  if (nom === 'abonnement') {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
      </svg>
    );
  }
  return null;
}

export function GabaritEspaceV3({
  langue,
  onglet,
  email,
  nomComplet = 'Sophie Ngo Bell',
  initiales = 'SN',
  dateMembre = 'mars 2026',
  nbTitres = 3,
  nbLivretsGratuits = 1,
  langueLecture = 'FR',
  children,
}: {
  langue: LangueInterface;
  onglet: OngletEspaceV3;
  email: string;
  titre?: string;
  nomComplet?: string;
  initiales?: string;
  dateMembre?: string;
  nbTitres?: number;
  nbLivretsGratuits?: number;
  langueLecture?: string;
  children: ReactNode;
}): ReactNode {
  return (
    <main className={styles.page}>
      {/* ── En-tête profil : Avatar, Nom, Email et Statut en pilules ── */}
      <header className={styles.enteteProfil}>
        <div className={styles.identiteContainer}>
          <div className={styles.avatarCercle}>
            <span>{initiales}</span>
          </div>
          <div className={styles.identiteTexte}>
            <h1 className={styles.nomProfil}>{nomComplet}</h1>
            <p className={styles.emailProfil}>
              {email} · membre depuis {dateMembre}
            </p>
          </div>
        </div>

        <div className={styles.statsContainer}>
          <div className={styles.statPill}>
            <span className={styles.statValeur}>{nbTitres}</span>
            <span className={styles.statLibelle}>titres possédés</span>
          </div>
          <div className={styles.statPill}>
            <span className={styles.statValeur}>{nbLivretsGratuits}</span>
            <span className={styles.statLibelle}>livret gratuit</span>
          </div>
          <div className={styles.statPill}>
            <span className={styles.statValeur}>{langueLecture}</span>
            <span className={styles.statLibelle}>langue de lecture</span>
          </div>
        </div>
      </header>

      {/* ── Disposition 2 colonnes : Menu latéral + Contenu ── */}
      <div className={styles.grilleDisposition}>
        <nav className={styles.menuNav} aria-label={traduire(langue, 'compte.titre')}>
          <ul className={styles.listeOnglets}>
            {ONGLETS.map((entree) => {
              const courant = entree.chemin === onglet;

              return (
                <li key={entree.chemin}>
                  <a
                    className={courant ? `${styles.ongletItem} ${styles.ongletActif}` : styles.ongletItem}
                    href={`/${langue}/${entree.chemin}`}
                    aria-current={courant ? 'page' : undefined}
                  >
                    <span className={courant ? styles.iconeBadgeActif : styles.iconeBadgeInactif}>
                      <IconeOnglet nom={entree.icone} />
                    </span>
                    <span className={styles.libelleOnglet}>{traduire(langue, entree.cle)}</span>
                  </a>
                </li>
              );
            })}

            {/* Bouton Se déconnecter */}
            <li>
              <a className={styles.ongletItem} href={`/${langue}/connexion`}>
                <span className={styles.iconeBadgeInactif}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                    <polyline points="16 17 21 12 16 7" />
                    <line x1="21" y1="12" x2="9" y2="12" />
                  </svg>
                </span>
                <span className={styles.libelleOnglet}>Se déconnecter</span>
              </a>
            </li>
          </ul>
        </nav>

        {/* ── Panneau de contenu ── */}
        <section className={styles.contenuPanneau}>{children}</section>
      </div>
    </main>
  );
}

export { styles as stylesEspaceV3 };

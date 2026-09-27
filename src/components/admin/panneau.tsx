import type { ReactNode } from 'react';

import { traduire, type LangueInterface } from '@/i18n';
import styles from './admin.module.css';
import { FermerAuClavier } from './fermer-au-clavier';

/**
 * ╔═══════════════════════════════════════════════════════════════════════════╗
 * ║ LE PANNEAU LATÉRAL D'ADMINISTRATION.                                      ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ SON OUVERTURE EST DANS L'URL, COMME TOUT LE RESTE DE CET ÉCRAN.         │
 * │                                                                          │
 * │ `?commande=<id>` ouvre, l'absence du paramètre ferme. Trois conséquences │
 * │ qu'un tiroir piloté par un état de composant n'aurait pas :             │
 * │                                                                          │
 * │  · le contenu est rendu par le SERVEUR, donc le détail d'une commande    │
 * │    ne descend pas dans le navigateur tant que personne ne l'ouvre ;      │
 * │  · un lien vers une commande précise se colle dans un courriel ;         │
 * │  · le bouton « précédent » du navigateur referme le tiroir, au lieu de  │
 * │    quitter l'écran en laissant l'éditeur se demander où il est passé.    │
 * │                                                                          │
 * │ Le voile et la croix sont donc des LIENS, et l'écran fonctionne sans     │
 * │ JavaScript. La touche Échap, elle, en demande — c'est la seule pièce     │
 * │ cliente, et elle ne fait que ça.                                         │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ IL EST PARTAGÉ, PARCE QUE SIX ÉCRANS LE DEMANDENT.                      │
 * │                                                                          │
 * │ Commandes, Abonnements, Offres, Codes promo, Utilisateurs et Témoignages │
 * │ ouvrent le même tiroir avec le même en-tête collant, le même corps et le │
 * │ même pied d'actions. Six copies auraient divergé sur le rembourrage      │
 * │ avant d'avoir divergé sur autre chose.                                   │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export function Panneau({
  langue,
  oeil,
  titre,
  fermeture,
  pied,
  children,
}: {
  langue: LangueInterface;
  /** Le sur-titre — « Commande », « Abonné ». */
  oeil: string;
  titre: string;
  /** L'adresse qui referme : l'écran sans son paramètre d'ouverture. */
  fermeture: string;
  /** Les actions du pied, propres à chaque écran. Absent : pas de pied. */
  pied?: ReactNode;
  children: ReactNode;
}): ReactNode {
  const fermer = traduire(langue, 'admin.panneauFermer');

  return (
    <>
      {/*
        Le voile est un LIEN, pas un `div` avec un gestionnaire : il ferme au
        clic sans JavaScript, et il est atteignable au clavier comme n'importe
        quel lien. Son intitulé est lu, mais il reste vide à l'écran.
      */}
      <a className={styles.tiroirVoile} href={fermeture} aria-label={fermer} />

      <aside
        className={styles.tiroir}
        role="dialog"
        aria-modal="true"
        aria-label={`${oeil} ${titre}`}
      >
        <FermerAuClavier fermeture={fermeture} />

        <header className={styles.tiroirEntete}>
          <div className={styles.tiroirIdentite}>
            <p className={styles.tiroirOeil}>{oeil}</p>
            <h2 className={styles.tiroirTitre}>{titre}</h2>
          </div>

          <a className={styles.tiroirCroix} href={fermeture} aria-label={fermer}>
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.75"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </a>
        </header>

        <div className={styles.tiroirCorps}>{children}</div>

        {pied ? <footer className={styles.tiroirPied}>{pied}</footer> : null}
      </aside>
    </>
  );
}

/** Un bloc du corps : son sur-titre, puis ce qu'il porte. */
export function BlocPanneau({
  titre,
  children,
}: {
  titre: string;
  children: ReactNode;
}): ReactNode {
  return (
    <section className={styles.tiroirBloc}>
      <p className={styles.tiroirBlocTitre}>{titre}</p>
      {children}
    </section>
  );
}

/**
 * Une étape de la frise de suivi.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ TROIS ÉTATS, ET LE TRAIT QUI LES RELIE S'ARRÊTE À LA DERNIÈRE.          │
 * │                                                                          │
 * │ `faite` : pastille pleine. `attente` : pastille creuse, cerclée — ce     │
 * │ qu'on attend n'est pas ce qui est arrivé, et un cercle plein le dirait   │
 * │ faussement. `incident` : pastille terracotta, un refus ou un             │
 * │ remboursement.                                                           │
 * │                                                                          │
 * │ L'état se lit à la FORME autant qu'à la couleur — pleine, creuse — parce │
 * │ qu'une frise dont les trois états ne diffèrent que par leur teinte ne    │
 * │ dit rien à qui ne distingue pas le vert de l'orange.                     │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export function EtapeSuivi({
  etat,
  libelle,
  detail,
  derniere = false,
}: {
  etat: 'faite' | 'attente' | 'incident';
  libelle: string;
  detail?: string;
  derniere?: boolean;
}): ReactNode {
  const pastille =
    etat === 'faite'
      ? styles.suiviPastilleFaite
      : etat === 'attente'
        ? styles.suiviPastilleAttente
        : styles.suiviPastilleIncident;

  return (
    <li className={styles.suiviEtape}>
      <div className={styles.suiviColonne}>
        <span className={`${styles.suiviPastille} ${pastille}`} aria-hidden="true" />
        {derniere ? null : <span className={styles.suiviTrait} aria-hidden="true" />}
      </div>

      <div className={styles.suiviTexte}>
        <p
          className={
            etat === 'attente'
              ? `${styles.suiviLibelle} ${styles.suiviLibelleAttente}`
              : styles.suiviLibelle
          }
        >
          {libelle}
        </p>
        {detail ? <p className={styles.suiviDetail}>{detail}</p> : null}
      </div>
    </li>
  );
}

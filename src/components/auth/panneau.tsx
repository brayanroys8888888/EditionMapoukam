import type { ReactNode } from 'react';

import { traduire, type CleTraduction, type LangueInterface } from '@/i18n';
import { Marque } from '@/components/v2/marque';
import { estV3 } from '@/design/version';
import styles from './auth.module.css';

/**
 * ╔═══════════════════════════════════════════════════════════════════════════╗
 * ║ LES DEUX PIÈCES QUE LA V3 AJOUTE AUTOUR DES FORMULAIRES.                   ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 *
 * Le panneau de promesse, à gauche, et la bascule connexion / inscription, en
 * haut du formulaire. Aucun des deux ne touche à la SOUMISSION : les
 * formulaires, leurs Server Actions et leur indifférenciation d'erreurs sont
 * inchangés — c'est ce qui permet de reprendre le dessin d'Organic sans
 * rejouer l'étape F5.
 */

/* ══ Le panneau de promesse ═══════════════════════════════════════════════ */

/** Les trois lignes de preuve du prototype, dans son ordre. */
const PREUVES: CleTraduction[] = ['auth.preuveAchats', 'auth.preuveLecture', 'auth.preuveCompte'];

/**
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LE TITRE DU PANNEAU EST UN PARAGRAPHE, PAS UN `<h2>`.                   │
 * │                                                                          │
 * │ Le prototype écrit un `<h2>` — et il le pose AVANT le `<h1>` du          │
 * │ formulaire, puisque le panneau est la première colonne de la grille.     │
 * │ Un document dont le premier titre est de niveau 2 se parcourt mal : la   │
 * │ liste des titres d'un lecteur d'écran commence alors par une promesse    │
 * │ commerciale, et le titre de l'écran arrive après.                        │
 * │                                                                          │
 * │ Le dessin ne change pas d'un pixel — la classe porte la police, la       │
 * │ taille et l'interligne du prototype. Seul le rôle change, et c'est le    │
 * │ rôle qui était faux : ce texte est une promesse, pas la section d'un     │
 * │ document.                                                                │
 * │                                                                          │
 * │ Le panneau n'est donc PLUS `aria-hidden` non plus : il portait jusqu'ici │
 * │ une phrase d'ambiance, il porte maintenant trois engagements. Les        │
 * │ masquer reviendrait à ne les tenir que pour ceux qui voient.             │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export function PanneauPromesse({ langue }: { langue: LangueInterface }): ReactNode {
  return (
    <aside className={styles.illustration}>
      <Marque langue={langue} petite ton="sombre" className={styles.marqueAuth} />

      {/*
       * ┌────────────────────────────────────────────────────────────────────┐
       * │ LE SUR-TITRE N'EXISTE QUE SUR TÉLÉPHONE, ET IL Y REMPLACE LA       │
       * │ MARQUE.                                                             │
       * │                                                                     │
       * │ Le prototype mobile ne dessine pas le même écran que celui de       │
       * │ bureau : le panneau y devient une CARTE sombre posée au-dessus du   │
       * │ formulaire, sans logo et sans les trois preuves, et la promesse y   │
       * │ est annoncée par ce sur-titre en petites capitales.                 │
       * │                                                                     │
       * │ Il est rendu TOUJOURS, et masqué par la feuille au-delà de 760 px : │
       * │ le faire dépendre de la largeur en JavaScript demanderait de        │
       * │ connaître la fenêtre avant le premier rendu, ce que le serveur ne   │
       * │ sait pas — la page arriverait avec le mauvais état, puis           │
       * │ sauterait.                                                          │
       * └────────────────────────────────────────────────────────────────────┘
       */}
      <p className={styles.promesseSurTitre}>{traduire(langue, 'auth.promesseSurTitre')}</p>

      <p className={styles.promesseTitre}>{traduire(langue, 'auth.promesseTitre')}</p>
      <p className={styles.promesseTexte}>{traduire(langue, 'auth.promesseTexte')}</p>

      <ul className={styles.preuves}>
        {PREUVES.map((cle) => (
          <li key={cle} className={styles.preuve}>
            {/* Décoratif : la phrase dit tout, et une coche annoncée « image »
                avant chaque ligne allongerait l'écoute sans rien ajouter. */}
            <svg
              className={styles.preuveCoche}
              width="17"
              height="17"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
              aria-hidden="true"
              focusable="false"
            >
              <path d="m5 13 4.5 4.5L19 7" />
            </svg>
            {traduire(langue, cle)}
          </li>
        ))}
      </ul>
    </aside>
  );
}

/* ══ La bascule connexion / inscription ═══════════════════════════════════ */

/**
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ DEUX LIENS, ET NON DEUX BOUTONS QUI ÉCHANGENT UN ÉTAT.                  │
 * │                                                                          │
 * │ Le prototype bascule un `authMode` en mémoire. Ici les deux modes sont   │
 * │ deux ROUTES : `/connexion` et `/inscription`. Ce n'est pas une           │
 * │ complication, c'est ce qui existait déjà — et c'est ce qui fait qu'un    │
 * │ lien vers l'inscription partagé par courriel arrive sur l'inscription,   │
 * │ que le bouton « retour » revient à la connexion, et que l'écran          │
 * │ fonctionne sans JavaScript.                                              │
 * │                                                                          │
 * │ Le dessin, lui, est bien celui d'un contrôle segmenté : une piste de     │
 * │ fond doux, la pastille active sur la carte avec son ombre. C'est ce que  │
 * │ `05-components.md` appelle « segmented tabs » — un dessin, pas un        │
 * │ mécanisme.                                                               │
 * │                                                                          │
 * │ `aria-current="page"` porte l'état : il est exact (c'est bien la page    │
 * │ courante) là où `aria-selected` mentirait, cet attribut n'ayant de sens  │
 * │ que dans un vrai `role="tablist"`.                                       │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export function BasculeAuth({
  langue,
  mode,
}: {
  langue: LangueInterface;
  mode: 'connexion' | 'inscription';
}): ReactNode {
  // La bascule est un ajout d'Organic : la V1 et la V2 gardent leurs liens de
  // bas de formulaire, qui disent la même chose en toutes lettres.
  if (!estV3()) return null;

  const entrees = [
    { cle: 'connexion', chemin: 'connexion', libelle: 'auth.connexionTitre' },
    { cle: 'inscription', chemin: 'inscription', libelle: 'auth.creerUnCompte' },
  ] as const;

  return (
    <nav className={styles.bascule} aria-label={traduire(langue, 'auth.ongletsLibelle')}>
      {entrees.map((entree) => {
        const courant = entree.cle === mode;
        return (
          <a
            key={entree.cle}
            className={courant ? `${styles.onglet} ${styles.ongletActif}` : styles.onglet}
            href={`/${langue}/${entree.chemin}`}
            aria-current={courant ? 'page' : undefined}
          >
            {traduire(langue, entree.libelle)}
          </a>
        );
      })}
    </nav>
  );
}

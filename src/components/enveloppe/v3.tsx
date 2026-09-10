import type { ReactNode } from 'react';

import { traduire, type LangueInterface } from '@/i18n';

import { SuiviDefilement } from './defilement';
import { CommutateurTheme } from './theme';
import { SelecteurLangueV2 } from './v2';
import styles from './v3.module.css';

/**
 * LES TROIS PIÈCES DE CHROME QUE LA V2 N'AVAIT PAS.
 *
 * La barre utilitaire, la barre d'onglets, et le commutateur de thème qu'elles
 * portent. Tout le reste — en-tête, navigation, pied — est la structure de la
 * V2, redéfinie par les jetons et par un bloc de la feuille `v2.module.css`.
 */

/* ══ La barre utilitaire ══════════════════════════════════════════════════ */

/**
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ ELLE EST AU-DESSUS DE L'EN-TÊTE, ET ELLE NE COLLE PAS.                  │
 * │                                                                          │
 * │ C'est ce qui la distingue de l'en-tête : elle porte ce qu'on règle UNE   │
 * │ fois — le thème, la langue — et non ce dont on se sert en permanence.    │
 * │ La rendre collante volerait 38 px de hauteur utile à chaque écran, pour  │
 * │ deux réglages qu'on touche une fois par visite.                          │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export function BarreUtilitaireV3({
  langue,
  chemin,
  requete = '',
}: {
  langue: LangueInterface;
  chemin: string;
  requete?: string;
}): ReactNode {
  return (
    <div className={styles.barreUtilitaire}>
      {/*
       * Le suivi du défilement est monté ICI, dans la seule pièce que TOUT
       * écran de la V3 porte. Le poser sur l'en-tête l'aurait perdu partout
       * où `src/design/enveloppe.ts` décide de ne pas en montrer.
       */}
      <SuiviDefilement />

      <div className={styles.barreUtilitaireInterieur}>
        <p className={styles.promesse}>
          {/*
           * La pastille de six pixels du prototype. Purement décorative : la
           * phrase qui suit dit tout, et une puce annoncée « image » ne
           * ferait qu'allonger l'écoute.
           */}
          <span className={styles.point} aria-hidden="true" />
          {traduire(langue, 'navigation.promesse')}
        </p>

        <div className={styles.barreUtilitaireActions}>
          <CommutateurTheme langue={langue} />
          <SelecteurLangueV2 langue={langue} chemin={chemin} requete={requete} abrege />
        </div>
      </div>
    </div>
  );
}

/* ══ La barre d'onglets ═══════════════════════════════════════════════════ */

/**
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ UN ONGLET RESTE ALLUMÉ SUR LES ÉCRANS QUI DÉCOULENT DE LUI.             │
 * │                                                                          │
 * │ « Contes » reste actif sur la fiche d'un conte, « Panier » sur le        │
 * │ paiement et la confirmation, « Compte » sur la connexion. Sans cela,     │
 * │ l'onglet s'éteint dès le premier pas et le visiteur perd le fil de       │
 * │ l'endroit où il se trouve — précisément dans un tunnel d'achat, où       │
 * │ c'est le plus coûteux.                                                   │
 * │                                                                          │
 * │ La comparaison porte sur le chemin SANS la langue : `/fr/contes` et      │
 * │ `/en/contes` sont le même onglet.                                        │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
const ONGLETS = [
  { cle: 'accueil', vers: '', prefixes: [] as string[] },
  { cle: 'contes', vers: '/contes', prefixes: ['/contes', '/catalogue'] },
  { cle: 'livrets', vers: '/livrets', prefixes: ['/livrets'] },
  { cle: 'panier', vers: '/panier', prefixes: ['/panier', '/paiement'] },
  { cle: 'compte', vers: '/compte', prefixes: ['/compte', '/connexion', '/inscription'] },
] as const;

function sansLangue(chemin: string): string {
  const segments = chemin.split('/');
  // ['', 'fr', 'contes', …] → '/contes/…' ; l'accueil rend ''.
  return `/${segments.slice(2).join('/')}`.replace(/\/$/, '');
}

export function BarreOngletsV3({
  langue,
  chemin,
  panier,
}: {
  langue: LangueInterface;
  chemin: string;
  panier: { nombre: number };
}): ReactNode {
  const courant = sansLangue(chemin);

  return (
    <nav className={styles.barreOnglets} aria-label={traduire(langue, 'navigation.onglets.libelle')}>
      <div className={styles.barreOngletsInterieur}>
        {ONGLETS.map(({ cle, vers, prefixes }) => {
          const actif =
            vers === ''
              ? courant === ''
              : prefixes.some((p) => courant === p || courant.startsWith(`${p}/`));

          const compte = cle === 'panier' && panier.nombre > 0;

          return (
            <a
              key={cle}
              className={styles.onglet}
              href={`/${langue}${vers}`}
              aria-current={actif ? 'page' : undefined}
            >
              <span
                aria-hidden="true"
                className={`${styles.ongletIcone} ${compte ? styles.ongletPastille : ''}`}
              >
                {ICONES[cle]}
                {compte ? (
                  <span className={styles.ongletNombre}>{String(panier.nombre)}</span>
                ) : null}
              </span>
              {traduire(langue, `navigation.onglets.${cle}`)}
            </a>
          );
        })}
      </div>
    </nav>
  );
}

/**
 * La réserve de place sous le contenu.
 *
 * Rendue comme un élément plutôt qu'en `padding` sur `<main>` : le rembourrage
 * serait hérité par des écrans qui n'ont pas de barre, et une règle qui
 * l'annulerait au cas par cas finirait par en oublier un.
 */
export function ReserveOngletsV3(): ReactNode {
  return <div className={styles.reserveOnglets} aria-hidden="true" />;
}

/*
 * Cinq chemins Lucide, au trait 2,75 que fixe `01-design-tokens.md`. En ligne
 * plutôt qu'en dépendance : ce sont les seules icônes du chrome mobile, et
 * charger une bibliothèque pour cinq tracés coûterait plus que les tracés.
 */
const TRAIT = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2.75,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const;

const ICONES: Record<(typeof ONGLETS)[number]['cle'], ReactNode> = {
  accueil: (
    <svg viewBox="0 0 24 24" width="21" height="21" {...TRAIT}>
      <path d="M3 10.2 12 3l9 7.2V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1Z" />
    </svg>
  ),
  contes: (
    <svg viewBox="0 0 24 24" width="21" height="21" {...TRAIT}>
      <path d="M4 4.5A1.5 1.5 0 0 1 5.5 3H19v18H5.5A1.5 1.5 0 0 1 4 19.5Z" />
      <path d="M4 17h15" />
    </svg>
  ),
  livrets: (
    <svg viewBox="0 0 24 24" width="21" height="21" {...TRAIT}>
      <path d="M5 3h11l3 3v15H5Z" />
      <path d="M9 8h6M9 12h6M9 16h3" />
    </svg>
  ),
  panier: (
    <svg viewBox="0 0 24 24" width="21" height="21" {...TRAIT}>
      <path d="M6 7h12l-1 12H7Z" />
      <path d="M9 7a3 3 0 0 1 6 0" />
    </svg>
  ),
  compte: (
    <svg viewBox="0 0 24 24" width="21" height="21" {...TRAIT}>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 20a7 7 0 0 1 14 0" />
    </svg>
  ),
};

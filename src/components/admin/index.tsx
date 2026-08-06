import type { ReactNode } from 'react';

import { traduire, type LangueInterface } from '@/i18n';
import styles from './admin.module.css';

/**
 * GABARIT DE L'ADMINISTRATION.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ CE RAIL N'EST PAS UNE PROTECTION, ET NE DOIT PAS ÊTRE PRIS POUR TELLE.  │
 * │                                                                          │
 * │ Chaque route d'administration relit le rôle EN BASE à chaque requête,    │
 * │ et chaque fonction SQL est `security definer` avec son propre contrôle.  │
 * │ Cacher ces liens à un lecteur ordinaire évite seulement de lui proposer  │
 * │ une porte qui se refermera — cela ne ferme aucune porte.                 │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ AUCUNE FRAUNCES ICI — c'est la seule règle typographique que la charte  │
 * │ pose pour le back-office, et elle est juste : une police à caractère se  │
 * │ lit mal sur trente lignes de tableau.                                    │
 * └──────────────────────────────────────────────────────────────────────────┘
 */

/** Les sections de l'administration, et leur chemin. */
const SECTIONS = [
  { cle: 'admin.tableauDeBord', chemin: '' },
  { cle: 'admin.contes', chemin: '/contes' },
  { cle: 'admin.commandes', chemin: '/commandes' },
  { cle: 'admin.abonnements', chemin: '/abonnements' },
  { cle: 'admin.utilisateurs', chemin: '/utilisateurs' },
  { cle: 'admin.promos', chemin: '/promos' },
] as const;

export type SectionAdmin = (typeof SECTIONS)[number]['chemin'];

export function GabaritAdmin({
  langue,
  section,
  titre,
  sousTitre,
  actions,
  children,
}: {
  langue: LangueInterface;
  section: SectionAdmin;
  titre: string;
  sousTitre?: string;
  /** Boutons d'écran, à droite du titre. */
  actions?: ReactNode;
  children: ReactNode;
}): ReactNode {
  return (
    <div className={styles.gabarit}>
      <nav className={styles.rail} aria-label={traduire(langue, 'admin.titre')}>
        <a className={styles.marque} href={`/${langue}/admin`}>
          {/* Décoratif : le nom qui suit porte déjà l'information. */}
          <span className={styles.logo} aria-hidden="true" />
          {traduire(langue, 'marque.nom')}
        </a>
        <p className={styles.mention}>{traduire(langue, 'admin.titre')}</p>

        <ul className={styles.liens}>
          {SECTIONS.map((entree) => {
            const actif = entree.chemin === section;
            return (
              <li key={entree.chemin}>
                <a
                  className={actif ? `${styles.lien} ${styles.lienActif}` : styles.lien}
                  href={`/${langue}/admin${entree.chemin}`}
                  aria-current={actif ? 'page' : undefined}
                >
                  {traduire(langue, entree.cle)}
                </a>
              </li>
            );
          })}
        </ul>

        <a className={styles.retourSite} href={`/${langue}`}>
          <span aria-hidden="true">←</span>
          {traduire(langue, 'admin.retourSite')}
        </a>
      </nav>

      <main className={styles.contenu}>
        <div className={styles.entete}>
          <div>
            <h1 className={styles.titre}>{titre}</h1>
            {sousTitre ? <p className={styles.sousTitre}>{sousTitre}</p> : null}
          </div>
          {actions}
        </div>

        {children}
      </main>
    </div>
  );
}

/**
 * Un compteur du tableau de bord.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ ZÉRO EST UNE BONNE NOUVELLE, ET LA COULEUR LE DIT.                      │
 * │                                                                          │
 * │ Ces compteurs comptent des ennuis. Les afficher toujours en rouge        │
 * │ apprendrait à les ignorer en une semaine ; ne les colorer que lorsqu'ils │
 * │ sont non nuls fait que le rouge veut encore dire quelque chose.          │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export function Compteur({
  intitule,
  valeur,
  note,
}: {
  intitule: string;
  valeur: number;
  note: string;
}): ReactNode {
  const calme = valeur === 0;

  return (
    <li className={styles.chiffre}>
      <span className={styles.chiffreIntitule}>{intitule}</span>
      <span
        className={`${styles.chiffreValeur} ${calme ? styles.chiffreCalme : styles.chiffreAlerte}`}
      >
        {valeur}
      </span>
      <span className={styles.chiffreNote}>{note}</span>
    </li>
  );
}

/**
 * Une carte de chiffre comptable — un montant, et ce qui le compose.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ UNE CARTE PAR DEVISE, ET JAMAIS UNE CARTE « TOTAL ».                    │
 * │                                                                          │
 * │ Additionner des euros et des francs CFA sans taux de change ne produit  │
 * │ pas un chiffre approximatif : il n'en produit aucun (D4 point 4). La     │
 * │ consolidation s'arrête donc à la devise, et elle est faite en SQL — un   │
 * │ `group by devise` rend impossible la somme que ce composant aurait pu    │
 * │ écrire par mégarde.                                                     │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Les montants arrivent DÉJÀ FORMATÉS. Le franc CFA n'a pas de sous-unité, et
 * `formatAmount` est seul à savoir combien de décimales porte une devise.
 */
export function CarteMontant({
  devise,
  principal,
  intitule,
  details,
}: {
  devise: string;
  /** Le montant net, déjà mis en forme par le serveur. */
  principal: string;
  intitule: string;
  /** Brut, remboursé, nombre de transactions — déjà mis en forme eux aussi. */
  details: { terme: string; valeur: string }[];
}): ReactNode {
  return (
    <li className={styles.carteMontant}>
      <span className={styles.carteMontantDevise}>{devise}</span>
      <span className={styles.carteMontantIntitule}>{intitule}</span>
      <span className={styles.carteMontantValeur}>{principal}</span>

      <dl className={styles.carteMontantDetails}>
        {details.map((detail) => (
          <div key={detail.terme} className={styles.carteMontantDetail}>
            <dt>{detail.terme}</dt>
            <dd>{detail.valeur}</dd>
          </div>
        ))}
      </dl>
    </li>
  );
}

/** Une barre du graphique : ce qu'elle nomme, ce qu'elle vaut, ce qu'on lit. */
export interface BarreGraphique {
  libelle: string;
  /** Valeur comparée aux autres barres. Jamais un montant de devise différente. */
  valeur: number;
  /** Ce qui s'écrit au bout de la barre — déjà mis en forme. */
  affichage: string;
}

const HAUTEUR_BARRE = 26;
const LARGEUR_VUE = 320;
const LARGEUR_LIBELLE = 118;
const LARGEUR_VALEUR = 54;

/**
 * Graphique en barres, en SVG rendu par le SERVEUR.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ PAS DE BIBLIOTHÈQUE DE GRAPHIQUES, ET CE N'EST PAS UNE ÉCONOMIE DE       │
 * │ PARESSE.                                                                 │
 * │                                                                          │
 * │ Une barre est un rectangle dont la largeur est une proportion. Recharts  │
 * │ apporterait des infobulles et des animations au prix d'un paquet de      │
 * │ JavaScript client dans un back-office qui n'en a aujourd'hui aucun — et  │
 * │ §5.1 décrit un public sur connexion lente, dont l'éditeur fait partie.   │
 * │                                                                          │
 * │ La valeur exacte est écrite au bout de chaque barre : l'infobulle qu'une │
 * │ bibliothèque aurait apportée n'aurait rien dit de plus.                  │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LE GRAPHIQUE EST UNE IMAGE, ET SON TEXTE DE REMPLACEMENT EST LA SÉRIE.  │
 * │                                                                          │
 * │ `role="img"` avec un `<title>` et une `<desc>` qui énumère les valeurs : │
 * │ un lecteur d'écran entend les nombres plutôt que de parcourir vingt      │
 * │ éléments de dessin. C'est la forme recommandée pour un graphique simple, │
 * │ et elle évite d'avoir à doubler chaque série d'un tableau caché.         │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export function GraphiqueBarres({
  titre,
  barres,
  accent = false,
}: {
  titre: string;
  barres: readonly BarreGraphique[];
  /** En ocre plutôt qu'en vert — pour distinguer deux séries voisines. */
  accent?: boolean;
}): ReactNode {
  if (barres.length === 0) return null;

  // Le maximum sert d'échelle. `1` au minimum : une série entièrement nulle
  // diviserait par zéro et rendrait des largeurs `NaN`, c'est-à-dire un
  // graphique vide sans que rien ne le signale.
  const maximum = Math.max(1, ...barres.map((barre) => barre.valeur));
  const largeurPiste = LARGEUR_VUE - LARGEUR_LIBELLE - LARGEUR_VALEUR;
  const hauteur = barres.length * HAUTEUR_BARRE;

  return (
    <svg
      className={styles.graphique}
      viewBox={`0 0 ${String(LARGEUR_VUE)} ${String(hauteur)}`}
      role="img"
      aria-labelledby={`g-${titre}-t g-${titre}-d`}
      preserveAspectRatio="xMinYMin meet"
    >
      <title id={`g-${titre}-t`}>{titre}</title>
      <desc id={`g-${titre}-d`}>
        {barres.map((barre) => `${barre.libelle} : ${barre.affichage}`).join(' · ')}
      </desc>

      {barres.map((barre, index) => {
        const y = index * HAUTEUR_BARRE;
        const largeur = Math.max(2, (barre.valeur / maximum) * largeurPiste);

        return (
          <g key={barre.libelle}>
            <text
              className={styles.graphiqueLibelle}
              x={LARGEUR_LIBELLE - 8}
              y={y + HAUTEUR_BARRE / 2}
              textAnchor="end"
              dominantBaseline="middle"
            >
              {barre.libelle}
            </text>

            <rect
              className={accent ? styles.graphiqueBarreAccent : styles.graphiqueBarre}
              x={LARGEUR_LIBELLE}
              y={y + 6}
              width={largeur}
              height={HAUTEUR_BARRE - 12}
              rx={3}
            />

            <text
              className={styles.graphiqueValeur}
              x={LARGEUR_LIBELLE + largeur + 6}
              y={y + HAUTEUR_BARRE / 2}
              dominantBaseline="middle"
            >
              {barre.affichage}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export { styles as stylesAdmin };
export { BoutonSoumission } from './BoutonSoumission';


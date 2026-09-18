import type { ReactNode } from 'react';

import { traduire, type CleTraduction, type LangueInterface } from '@/i18n';
import { nomUtilisateurEffectif, type Appelant } from '@/lib/auth/session';
import { deconnecter } from '@/app/[langue]/admin/actions';
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
 * │ LA POLICE D'AFFICHAGE REVIENT, MAIS SEULEMENT SUR LES TITRES.           │
 * │                                                                          │
 * │ Ce fichier portait « aucune Fraunces ici », et l'argument tenait pour le │
 * │ CORPS : une police à caractère se lit mal sur trente lignes de tableau.  │
 * │ Il ne tenait pas pour les titres, et le prototype d'administration du    │
 * │ 17 septembre 2026 le montre — `h1` et nom de marque dans la police       │
 * │ d'affichage, tout le reste dans celle d'interface. Un back-office qui    │
 * │ n'emploie jamais la voix de la marque cesse de ressembler au produit.    │
 * └──────────────────────────────────────────────────────────────────────────┘
 */

/**
 * Les sections de l'administration, rangées en quatre groupes.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LE GROUPEMENT REMPLACE L'ORDRE, ET FAIT SON TRAVAIL MIEUX QUE LUI.      │
 * │                                                                          │
 * │ La liste était plate et ordonnée par FRÉQUENCE : les écrans quotidiens   │
 * │ en tête, les écrans de réglage en bas. L'intention était juste, mais     │
 * │ rien ne la rendait lisible — onze entrées de même graisse, à un pixel    │
 * │ d'écart, et « Codes promo » voisinait « Association Dave » sans qu'on    │
 * │ sache pourquoi.                                                          │
 * │                                                                          │
 * │ Les quatre groupes du prototype disent la parenté à la place de l'ordre. │
 * │ Aucune entrée n'est ajoutée ni retirée : c'est une PARTITION des onze,   │
 * │ et le premier groupe n'a délibérément pas de titre — « Tableau de bord » │
 * │ est seul de son espèce, et lui coiffer un intertitre en inventerait une. │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * « Contes » PORTE LES DEUX SUPPORTS, « Livrets » N'EN PORTE QU'UN — et
 * c'est la forme du catalogue public, reprise telle quelle : `/catalogue`
 * montre tout, `/contes` et `/livrets` sont des rayons.
 */
const GROUPES = [
  {
    titre: null,
    entrees: [{ cle: 'admin.tableauDeBord', chemin: '' }],
  },
  {
    titre: 'admin.groupeCatalogue',
    entrees: [
      { cle: 'admin.contes', chemin: '/contes' },
      { cle: 'admin.livrets', chemin: '/livrets' },
    ],
  },
  {
    titre: 'admin.groupeVentes',
    entrees: [
      { cle: 'admin.commandes', chemin: '/commandes' },
      { cle: 'admin.abonnements', chemin: '/abonnements' },
      { cle: 'admin.offres', chemin: '/offres' },
      { cle: 'admin.promos', chemin: '/promos' },
    ],
  },
  {
    titre: 'admin.groupeCommunaute',
    entrees: [
      { cle: 'admin.utilisateurs', chemin: '/utilisateurs' },
      { cle: 'admin.avis', chemin: '/avis' },
      { cle: 'admin.temoignages', chemin: '/temoignages' },
      { cle: 'admin.association', chemin: '/association' },
    ],
  },
] as const;

export type SectionAdmin = (typeof GROUPES)[number]['entrees'][number]['chemin'];

/**
 * Les initiales du disque d'identité.
 *
 * Deux lettres au plus, prises sur les deux premiers MOTS : « Royce Brayan »
 * donne RB, « admin » donne A. Jamais les deux premières lettres d'un seul
 * mot — « Ro » ne se lit pas comme des initiales, il se lit comme un mot
 * coupé.
 */
function initiales(nom: string): string {
  return nom
    .split(/\s+/)
    .filter((mot) => mot.length > 0)
    .slice(0, 2)
    .map((mot) => mot[0]?.toUpperCase() ?? '')
    .join('');
}

export function GabaritAdmin({
  langue,
  section,
  administrateur,
  titre,
  sousTitre,
  actions,
  enteteActions,
  aere = false,
  enteteIntegree = false,
  children,
}: {
  langue: LangueInterface;
  section: SectionAdmin;
  /** Qui est connecté — la garde vient de le lire, il n'est pas relu ici. */
  administrateur: Appelant;
  titre: string;
  sousTitre?: string;
  /**
   * Ce que porte la BARRE SUPÉRIEURE : l'action principale de l'écran, et
   * l'indicateur de suivi là où il a un sens. Collante, donc atteignable sur
   * un tableau de dix-huit lignes sans remonter.
   */
  actions?: ReactNode;
  /** Ce qui se pose à DROITE DU TITRE — le sélecteur de période, et lui seul. */
  enteteActions?: ReactNode;
  /** Le tableau de bord empile des panneaux étrangers : il respire plus. */
  aere?: boolean;
  /**
   * L'écran porte son propre titre, dans son contenu.
   *
   * La fiche d'un titre met son `h1` DANS sa carte d'identité, à côté de la
   * couverture — c'est ce qui en fait une identité et non un en-tête. Le
   * gabarit garde alors `titre` pour le fil d'Ariane et ne rend pas son
   * bandeau : deux `h1` sur une page, c'est un document sans titre pour un
   * lecteur d'écran, qui n'a plus de quoi trancher.
   */
  enteteIntegree?: boolean;
  children: ReactNode;
}): ReactNode {
  const nom = nomUtilisateurEffectif(administrateur.nom_complet, administrateur.id);

  return (
    <div className={styles.gabarit}>
      <nav className={styles.rail} aria-label={traduire(langue, 'admin.titre')}>
        <a className={styles.marque} href={`/${langue}/admin`}>
          {/* Décoratif : le nom qui suit porte déjà l'information. */}
          <span className={styles.logo} aria-hidden="true" />
          <span className={styles.marqueTexte}>
            <span className={styles.marqueNom}>{traduire(langue, 'marque.nom')}</span>
            <span className={styles.mention}>{traduire(langue, 'admin.titre')}</span>
          </span>
        </a>

        <div className={styles.groupes}>
          {GROUPES.map((groupe, rang) => (
            <div className={styles.groupe} key={groupe.titre ?? `groupe-${String(rang)}`}>
              {groupe.titre ? (
                <p className={styles.groupeTitre}>
                  {traduire(langue, groupe.titre as CleTraduction)}
                </p>
              ) : null}

              <ul className={styles.liens}>
                {groupe.entrees.map((entree) => {
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
            </div>
          ))}
        </div>

        <div className={styles.pied}>
          {/* Décoratif : le nom est écrit juste à côté, en toutes lettres. */}
          <span className={styles.pastille} aria-hidden="true">
            {initiales(nom)}
          </span>
          <span className={styles.piedIdentite}>
            <span className={styles.piedNom}>{nom}</span>
            <span className={styles.piedRole}>
              {traduire(langue, 'admin.roleAdministrateur')}
            </span>
          </span>

          {/*
            Un FORMULAIRE, jamais un lien : une déconnexion change l'état du
            serveur, et un `<a>` se déclenche au pré-chargement du navigateur.
          */}
          <form action={deconnecter}>
            <input type="hidden" name="langue" value={langue} />
            <button type="submit" className={styles.sortir}>
              {traduire(langue, 'admin.sortir')}
            </button>
          </form>
        </div>
      </nav>

      <main className={styles.contenu}>
        <div className={styles.barreSuperieure}>
          {/*
            Le fil se DÉDUIT du titre de l'écran : l'écrire une seconde fois
            en prop laisserait les deux diverger, et c'est le fil qui aurait
            l'air d'avoir raison.
          */}
          <div className={styles.filAriane}>
            {traduire(langue, 'admin.titre')} · {titre}
          </div>
          {actions ? <div className={styles.barreActions}>{actions}</div> : null}
        </div>

        <div className={styles.page}>
          <div className={aere ? `${styles.colonne} ${styles.colonneAeree}` : styles.colonne}>
            {enteteIntegree ? null : (
              <div className={styles.entete}>
                <div>
                  <h1 className={styles.titre}>{titre}</h1>
                  {sousTitre ? <p className={styles.sousTitre}>{sousTitre}</p> : null}
                </div>
                {enteteActions}
              </div>
            )}

            {children}
          </div>
        </div>
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
        /*
         * ┌────────────────────────────────────────────────────────────────┐
         * │ UNE VALEUR NULLE NE DESSINE RIEN, ET C'EST LA PISTE QUI LE DIT.│
         * │                                                                │
         * │ Le minimum de 2 px servait à ce qu'une valeur non nulle mais    │
         * │ minuscule reste visible. Appliqué à ZÉRO, il produisait un      │
         * │ moignon de deux pixels contre le libellé — « English ▌ 0 » —    │
         * │ qui se lit comme un défaut d'affichage plutôt que comme une     │
         * │ absence. C'est ce que montrait le tableau de bord sur une base  │
         * │ neuve, où toutes les séries valent zéro.                        │
         * │                                                                │
         * │ Zéro ne dessine donc aucune barre. Pour que la ligne ne paraisse│
         * │ pas vide pour autant, une PISTE court derrière chaque barre :   │
         * │ elle donne l'échelle, et rend le zéro lisible comme « rien sur  │
         * │ tout ça » au lieu de « rien du tout ».                          │
         * └────────────────────────────────────────────────────────────────┘
         */
        const largeur =
          barre.valeur === 0 ? 0 : Math.max(2, (barre.valeur / maximum) * largeurPiste);

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
              className={styles.graphiquePiste}
              x={LARGEUR_LIBELLE}
              y={y + 6}
              width={largeurPiste}
              height={HAUTEUR_BARRE - 12}
              rx={3}
            />

            {largeur > 0 ? (
              <rect
                className={accent ? styles.graphiqueBarreAccent : styles.graphiqueBarre}
                x={LARGEUR_LIBELLE}
                y={y + 6}
                width={largeur}
                height={HAUTEUR_BARRE - 12}
                rx={3}
              />
            ) : null}

            {/*
             * La valeur s'écrit AU BOUT DE LA PISTE, pas au bout de la barre.
             *
             * Suivre la barre plaçait les chiffres en escalier, ce qui est la
             * façon la plus sûre de rendre deux nombres incomparables — et,
             * depuis que la piste est dessinée, les faisait écrire par-dessus
             * elle. Alignés, ils se lisent en colonne comme dans un tableau.
             */}
            <text
              className={styles.graphiqueValeur}
              x={LARGEUR_LIBELLE + largeurPiste + 6}
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
export { Rafraichissement } from './rafraichissement';


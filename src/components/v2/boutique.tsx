import type { ReactNode } from "react";

import Link from "next/link";
import { traduire, type LangueInterface } from "@/i18n";
import type { EntreeCatalogue } from "@/domain/catalog/types";
import type { ReponseFacettes } from "@/domain/api/contract";
import { TRIS } from "@/domain/catalog/schemas";
import type { FiltrePose, FiltresCatalogue, Lien } from "@/components/catalogue";
import { CatalogueVide, ChampRecherche } from "@/components/catalogue";

import { Pagination } from "@/components/base";
import { estV3 } from "@/design/version";
import { CarteConteV2 } from "./carte-conte";
import { Revele } from "./revele";
import styles from "./boutique.module.css";

/**
 * BOUTIQUE — DIRECTION V2.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ TOUT L'ÉTAT DE CETTE PAGE VIT DANS L'URL — COMME EN V1.                 │
 * │                                                                          │
 * │ Filtres, tri et pagination sont des LIENS, jamais des boutons qui        │
 * │ muteraient un état en mémoire. Trois conséquences, et les trois sont     │
 * │ exigées : une recherche filtrée est partageable, elle survit au          │
 * │ rechargement, et les moteurs atteignent les pages suivantes (§5.4).      │
 * │                                                                          │
 * │ C'est aussi ce qui rend la page utilisable SANS JAVASCRIPT — la          │
 * │ condition réelle d'une partie du public (§5.1). La V2 ajoute du          │
 * │ mouvement ; elle n'ajoute aucune dépendance.                             │
 * └──────────────────────────────────────────────────────────────────────────┘
 */

/**
 * Le fragment qui OUVRE la feuille de filtres, et celui qui la referme.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ POURQUOI UN FRAGMENT D'URL PLUTÔT QU'UN `<details>` OU DU JAVASCRIPT.   │
 * │                                                                          │
 * │ La feuille modale doit être FERMÉE au téléphone et OUVERTE en colonne    │
 * │ d'ordinateur. `<details open>` ne sait pas faire les deux : `open` est   │
 * │ du balisage, et le serveur ne connaît pas la largeur de l'écran.         │
 * │                                                                          │
 * │ `:target` le sait, lui, parce qu'il est porté par le CSS — donc par les  │
 * │ media queries. Hors du téléphone, aucune des règles de `:target` ne      │
 * │ s'applique et la colonne reste ce qu'elle était.                         │
 * │                                                                          │
 * │ Conséquence voulue : les pastilles de la feuille repointent sur          │
 * │ `#filtres`, si bien qu'on peut en cocher plusieurs de suite sans que la  │
 * │ feuille se referme entre deux — c'est ce que « Voir N contes » suppose.  │
 * │                                                                          │
 * │ Et l'ancre est un élément `display: none` PLACÉ À CÔTÉ de la feuille,    │
 * │ pas la feuille elle-même : un navigateur ne défile pas vers ce qu'il ne  │
 * │ dessine pas. Sans cela, chaque clic de filtre sur ORDINATEUR aurait fait │
 * │ sauter la page jusqu'à la colonne de gauche.                             │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
const ANCRE_FILTRES = "#filtres";

/** Où l'on retombe en refermant : sur la marchandise, pas en haut de page. */
const ANCRE_RESULTATS = "#resultats";

/**
 * ╔═══════════════════════════════════════════════════════════════════════════╗
 * ║ LA BASCULE GRILLE / LISTE.                                                ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ CE N'EST PAS UNE PRÉFÉRENCE D'AFFICHAGE, C'EST UNE FAÇON DE CHERCHER.   │
 * │                                                                          │
 * │ La grille compare des COUVERTURES : on y choisit à l'œil, et c'est ce    │
 * │ qu'un parent fait quand il ne sait pas encore ce qu'il veut. La liste,   │
 * │ elle, aligne des titres, des âges et des prix sur une même colonne — on  │
 * │ y compare des FAITS, ce qui est l'autre moitié du travail.               │
 * │                                                                          │
 * │ D'où le choix de la porter dans l'URL comme tout le reste de cet écran : │
 * │ un enseignant qui envoie « la liste des livrets pour la MS » envoie la   │
 * │ liste, pas une grille que son collègue devra rebasculer.                 │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ UNE SEULE CARTE, DEUX MISES EN PAGE — AUCUN SECOND COMPOSANT.           │
 * │                                                                          │
 * │ La rangée de liste n'est pas une autre carte : c'est la MÊME, remise en  │
 * │ page par une grille CSS depuis le conteneur. Écrire une seconde carte    │
 * │ aurait dupliqué la règle des trois lignes d'accès, le bouton d'ajout     │
 * │ conditionnel et le prix formaté par le serveur — trois endroits où une   │
 * │ copie finit toujours par diverger, et où la divergence coûte cher.       │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export const VUES = ["grille", "liste"] as const;

export type VueCatalogue = (typeof VUES)[number];

/** Le nom du paramètre d'URL. La grille est le défaut, donc jamais écrite. */
export const PARAM_VUE = "vue";

/**
 * Lit la vue depuis les paramètres bruts.
 *
 * Toute valeur inconnue retombe sur la grille, sans erreur : c'est un réglage
 * d'affichage, et opposer une page d'erreur à `?vue=cartes` serait absurde.
 */
export function vueDepuisRequete(brut: Record<string, string>): VueCatalogue {
  return brut[PARAM_VUE] === "liste" ? "liste" : "grille";
}

/** Deux tracés, au trait du dossier. Deux formes, pas deux mots. */
const ICONES_VUE: Record<VueCatalogue, ReactNode> = {
  grille: (
    <svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true" focusable="false">
      <g fill="currentColor">
        <rect x="3" y="3" width="8" height="8" rx="2" />
        <rect x="13" y="3" width="8" height="8" rx="2" />
        <rect x="3" y="13" width="8" height="8" rx="2" />
        <rect x="13" y="13" width="8" height="8" rx="2" />
      </g>
    </svg>
  ),
  liste: (
    <svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true" focusable="false">
      <g fill="currentColor">
        <rect x="3" y="4" width="18" height="4" rx="2" />
        <rect x="3" y="10" width="18" height="4" rx="2" />
        <rect x="3" y="16" width="18" height="4" rx="2" />
      </g>
    </svg>
  ),
};

export function BoutiqueV2({
  langue,
  page,
  facettes,
  filtres,
  poses,
  lien,
  base,
  compte,
  videTitre,
  libelleCompte,
  compteSupplementaire,
  apresGrille,
  avantFiltres,
  titre,
  texte,
  vue,
  actionAjout,
}: {
  langue: LangueInterface;
  page: {
    entrees: EntreeCatalogue[];
    page: number;
    pages: number;
    total: number;
  };
  facettes: ReponseFacettes;
  filtres: FiltresCatalogue;
  /** Les filtres réellement posés, tels que la route les a déjà dénombrés. */
  poses: FiltrePose[];
  lien: Lien;
  base: string;
  /** La phrase de compte, déjà accordée par la route. */
  compte: string;
  /** Le titre de l'etat vide, propre au rayon. Deja traduit. */
  videTitre?: string;
  /** Le libelle de la premiere carte de compte. Deja traduit. */
  libelleCompte?: string;
  /**
   * Une TROISIEME carte de banniere, deja traduite. Voir l'encadre au rendu.
   *
   * Elle ne compte rien : c'est du texte que le rayon connait et que la
   * boutique n'a pas a deviner.
   */
  compteSupplementaire?: { valeur: string; libelle: string };
  /**
   * Un bloc rendu AVANT la barre de filtres, sous la banniere.
   *
   * Le rayon des livrets y met en avant son kit offert. C'est l'ordre de la
   * maquette : le panneau se lit d'abord, la barre colle ensuite — l'inverse
   * ferait passer un panneau de 330 px de haut SOUS une barre collante, qui
   * le recouvrirait des la premiere molette.
   */
  avantFiltres?: ReactNode;
  /**
   * Un bloc rendu APRES la grille et la pagination.
   *
   * Le rayon des livrets y pose son appel « sur mesure ». C'est une prop et
   * non une condition ecrite ici : la boutique n'a pas a savoir quel rayon
   * elle sert, sans quoi elle finirait par porter un `if` par ecran.
   */
  apresGrille?: ReactNode;
  /**
   * Le titre et le texte de la bannière, DÉJÀ TRADUITS par l'écran.
   *
   * Absents, ce sont ceux de la boutique entière. C'est ce qui permet aux
   * rayons — `/contes`, `/livrets` — de réutiliser cette page telle quelle :
   * sans eux, chacun aurait fini par se dessiner sa propre bannière, et les
   * trois écrans auraient divergé sur la seule partie qu'on voit d'abord.
   */
  titre?: string;
  texte?: string;
  /**
   * La vue demandée, ou `undefined` pour n'offrir AUCUN choix.
   *
   * ┌────────────────────────────────────────────────────────────────────────┐
   * │ C'EST L'ÉCRAN QUI DÉCIDE S'IL Y A UNE BASCULE, PAS CE COMPOSANT.      │
   * │                                                                        │
   * │ La liste est une pièce d'Organic ; la V2 n'a jamais été dessinée       │
   * │ autour d'elle, et sa rangée d'outils est déjà pleine. Ce composant     │
   * │ n'a pourtant pas à demander quelle direction est servie : `CLAUDE.md`  │
   * │ l'interdit — « aucun composant ne connaît le thème ».                  │
   * │                                                                        │
   * │ La question est donc posée UNE fois, dans la couche des routes, à      │
   * │ côté de `structureRefondue()` qui y décide déjà de la mise en page.    │
   * │ Ici, il ne reste qu'une donnée : une vue, ou rien.                     │
   * └────────────────────────────────────────────────────────────────────────┘
   */
  vue?: VueCatalogue;
  /** Fabrique l'action d'ajout au panier d'un titre donné. */
  actionAjout?: (
    livreId: string,
  ) => (donnees: FormData) => void | Promise<void>;
}): ReactNode {
  const themesPoses = new Set(filtres.themes ?? []);

  /*
   * ╔═══════════════════════════════════════════════════════════════════════╗
   * ║ LE RAYON DES LIVRETS NE SE FILTRE PAS COMME LE CATALOGUE.             ║
   * ╚═══════════════════════════════════════════════════════════════════════╝
   *
   * ┌────────────────────────────────────────────────────────────────────────┐
   * │ CE N'EST PAS UNE SIMPLIFICATION DE CONFORT.                           │
   * │                                                                        │
   * │ La maquette donne au catalogue thèmes, accès, tri et bascule de vue ;  │
   * │ elle donne au rayon des livrets UNE recherche, des pastilles de NIVEAU │
   * │ et le compte. Rien d'autre, et c'est la bonne réponse.                 │
   * │                                                                        │
   * │ C'est le raisonnement qui a fait sortir la région du catalogue à la    │
   * │ 0071, pris dans l'autre sens : une facette qui ne s'applique qu'à une  │
   * │ partie du fonds fait DISPARAÎTRE le reste dès qu'on clique dessus.     │
   * │ Le niveau est le symétrique exact de la région — il ne veut rien dire  │
   * │ sur un conte, et il est LA question qu'on se pose devant un livret :   │
   * │ « est-ce pour ma classe ? ». Il n'a donc sa place que sur ce rayon-là, │
   * │ et il y a toute sa place.                                              │
   * │                                                                        │
   * │ Quant au tri et à la bascule : quatre livrets ne se trient pas. Les    │
   * │ offrir ferait trois contrôles pour une liste qui tient sur une rangée. │
   * └────────────────────────────────────────────────────────────────────────┘
   *
   * La bascule se lit sur le SUPPORT du rayon, jamais sur le chemin : c'est
   * `filtres.type`, que la route impose et qui ne voyage pas dans l'URL.
   */
  const rayonDeLivrets = estV3() && filtres.type === 'livret_pedagogique';

  const niveauPose = filtres.niveau;

  /**
   * Le même lien, mais qui laisse la feuille OUVERTE.
   *
   * Sur ordinateur le fragment ne dessine rien et ne fait rien ; au téléphone
   * il est la seule chose qui distingue « je pose un second filtre » de « j'ai
   * fini ». Les liens de tri et de pagination, eux, ferment volontairement :
   * ils portent sur le résultat, pas sur la recherche.
   */
  const lienFeuille: Lien = (modification) =>
    `${lien(modification)}${ANCRE_FILTRES}`;

  const libelleValider =
    page.total === 0
      ? traduire(langue, "v2.filtresVoirAucun")
      : page.total === 1
        ? traduire(langue, "v2.filtresVoirUn")
        : traduire(langue, "v2.filtresVoir").replace(
            "{n}",
            String(page.total),
          );

  const libelleDeclencheur =
    poses.length === 0
      ? traduire(langue, "catalogue.filtres")
      : poses.length === 1
        ? traduire(langue, "v2.filtresPose")
        : traduire(langue, "v2.filtresPoses").replace(
            "{n}",
            String(poses.length),
          );

  const libellesTri = {
    nouveautes: "catalogue.triNouveautes",
    popularite: "catalogue.triPopularite",
    alphabetique: "catalogue.triAlphabetique",
    prix: "catalogue.triPrix",
    pertinence: "catalogue.triPertinence",
  } as const;

  /*
   * ┌────────────────────────────────────────────────────────────────────────┐
   * │ LE TRI ET LA BASCULE SONT EXTRAITS — ILS CHANGENT DE PLACE, PAS DE     │
   * │ NATURE.                                                                │
   * │                                                                        │
   * │ Sous la V2 ils vivent au-dessus de la grille, avec le compte. La        │
   * │ maquette d'Organic les met dans la BARRE DE FILTRES, à droite de la     │
   * │ recherche et des thèmes — une seule rangée pour tout ce qui restreint   │
   * │ ou réordonne la liste.                                                  │
   * │                                                                        │
   * │ Le balisage est écrit une fois et rendu à l'un des deux endroits. Le    │
   * │ recopier aurait donné deux navigations à garder d'accord, dont une      │
   * │ seule est visible à la fois — c'est-à-dire une divergence qu'aucun      │
   * │ test de rendu ne verrait.                                               │
   * └────────────────────────────────────────────────────────────────────────┘
   */
  const triEtVue = (
    <>
    {/*
     * Le tri se replie comme les groupes de filtres : cinq libelles ecrits
     * en toutes lettres tenaient la moitie de la barre. `<details>` est le
     * motif du depot pour un menu qui doit fonctionner sans JavaScript — il
     * s'ouvre au clic ET au clavier, et il annonce son etat.
     *
     * Le resume porte le tri COURANT, pas le mot « Trier » : c'est
     * l'information qu'on cherche en le regardant.
     */}
    <details className={styles.tri} open={!estV3()}>
      <summary className={styles.triTitre}>
        {estV3()
          ? traduire(langue, libellesTri[filtres.tri as keyof typeof libellesTri])
          : traduire(langue, "catalogue.tri")}
      </summary>
      <nav
        className={styles.triListe}
        aria-label={traduire(langue, "catalogue.tri")}
      >
      {TRIS.map((valeur) => (
        <Link
          key={valeur}
          scroll={false}
          href={lien({ tri: valeur, page: undefined })}
          className={
            valeur === filtres.tri
              ? `${styles.triLien} ${styles.triActif}`
              : styles.triLien
          }
          aria-current={valeur === filtres.tri ? "true" : undefined}
        >
          {traduire(langue, libellesTri[valeur])}
        </Link>
      ))}
      </nav>
    </details>

    {/*
     * La bascule — deux LIENS, comme le tri juste à côté.
     *
     * Un bouton aurait demandé du JavaScript pour un réglage qui
     * doit survivre au partage et au rechargement ; et sans
     * JavaScript, il n'aurait rien fait du tout.
     *
     * `aria-current="true"` et non `"page"` : ce n'est pas une
     * autre page, c'est la même vue autrement. Le libellé reste
     * écrit en toutes lettres — une icône seule ne se lit pas, et
     * deux rectangles gris ne disent pas lequel est actif.
     */}
    {vue ? (
      <nav
        className={styles.vues}
        aria-label={traduire(langue, "catalogue.vue")}
      >
        {VUES.map((valeur) => {
          const actif = valeur === vue;
          return (
            <Link
              key={valeur}
              scroll={false}
              className={
                actif
                  ? `${styles.vueLien} ${styles.vueActive}`
                  : styles.vueLien
              }
              href={lien({
                [PARAM_VUE]: valeur === "grille" ? undefined : valeur,
              })}
              aria-current={actif ? "true" : undefined}
            >
              {ICONES_VUE[valeur]}
              {/*
               * Le libellé est enveloppé pour pouvoir sortir de la SCÈNE
               * sous Organic, où la bascule est un disque de 36 px. Il ne
               * sort jamais du document : c'est lui qui nomme le lien.
               */}
              <span className={styles.vueLibelle}>
                {traduire(
                  langue,
                  valeur === "grille"
                    ? "catalogue.vueGrille"
                    : "catalogue.vueListe",
                )}
              </span>
            </Link>
          );
        })}
      </nav>
    ) : null}
    </>
  );

  return (
    <>
      <div
        className={styles.banniere}
        data-banniere
        data-support={filtres.type ?? undefined}
      >
        {/*
         * ┌──────────────────────────────────────────────────────────────────┐
         * │ LE FIL D'ARIANE — « Accueil / Contes ».                          │
         * │                                                                  │
         * │ `<nav>` étiqueté, et le segment courant marqué `aria-current`    │
         * │ plutôt que rendu comme un lien mort : la maquette y met un       │
         * │ `<span>` coloré, ce qui se voit mais ne s'entend pas.            │
         * │                                                                  │
         * │ Il est un ENFANT DIRECT de la bannière, et occupe la première    │
         * │ rangée de sa grille sur toute la largeur. La maquette le pose    │
         * │ ainsi sur le rayon des livrets et dans la colonne de gauche sur  │
         * │ le catalogue — deux écritures pour un même rendu : le fil est    │
         * │ aligné à gauche, donc sa boîte peut faire une colonne ou deux    │
         * │ sans qu'un pixel bouge. Une seule structure vaut mieux que deux  │
         * │ qui se ressemblent.                                              │
         * └──────────────────────────────────────────────────────────────────┘
         */}
        {estV3() ? (
          <nav
            className={styles.filAriane}
            aria-label={traduire(langue, "v2.filAriane")}
          >
            <a href={`/${langue}`}>{traduire(langue, "navigation.onglets.accueil")}</a>
            <span aria-hidden="true">/</span>
            <span className={styles.filArianeCourant} aria-current="page">
              {titre ?? traduire(langue, "v2.boutiqueTitre")}
            </span>
          </nav>
        ) : null}

        <div className={styles.banniereInterieur}>
          {estV3() ? null : (
            <span className={styles.oeil}>
              {traduire(langue, "v2.boutiqueOeil")}
            </span>
          )}

          <h1 className={styles.banniereTitre}>
            {titre ?? traduire(langue, "v2.boutiqueTitre")}
          </h1>
          <p className={styles.banniereTexte}>
            {texte ?? traduire(langue, "v2.boutiqueTexte")}
          </p>
        </div>

        {/*
         * ┌──────────────────────────────────────────────────────────────────┐
         * │ LES DEUX CARTES DE COMPTE — DES FACETTES, PAS DES CHIFFRES.     │
         * │                                                                  │
         * │ La maquette affiche « 10 contes illustrés » et « 7 thèmes ».     │
         * │ Les deux nombres viennent ici des facettes du catalogue, comme   │
         * │ partout : `facettes.total` compte ce qui est réellement publié,  │
         * │ et `themes.length` ce qui est réellement renseigné. Écrire l'un  │
         * │ des deux en dur ferait de cette bannière la seule page du site à │
         * │ mentir sur la taille du fonds.                                   │
         * └──────────────────────────────────────────────────────────────────┘
         */}
        {estV3() ? (
          <ul className={styles.banniereComptes}>
            <li className={styles.compteCarte}>
              <span className={styles.compteValeur}>{page.total}</span>
              <span className={styles.compteLibelle}>
                {libelleCompte ?? traduire(langue, "v2.compteTitres")}
              </span>
            </li>
            <li className={styles.compteCarte}>
              <span className={styles.compteValeur}>{facettes.themes.length}</span>
              <span className={styles.compteLibelle}>
                {traduire(langue, "v2.compteThemes")}
              </span>
            </li>
            {/*
             * ┌──────────────────────────────────────────────────────────────┐
             * │ LA TROISIÈME CARTE N'EST PAS UN COMPTE — ET C'EST POURQUOI   │
             * │ ELLE EST FOURNIE, PAS CALCULÉE.                              │
             * │                                                              │
             * │ La maquette en pose trois sur le rayon des livrets, dont la  │
             * │ dernière dit « A4 · prêt à imprimer ». Ce n'est pas un       │
             * │ effectif : c'est une propriété du support, vraie quel que    │
             * │ soit le contenu du catalogue.                                │
             * │                                                              │
             * │ La faire remonter du rayon plutôt que l'écrire ici garde la  │
             * │ règle de cet écran : les deux premières cartes viennent des  │
             * │ facettes et ne mentent jamais sur la taille du fonds ; la    │
             * │ troisième est du texte, et elle se voit comme telle.         │
             * └──────────────────────────────────────────────────────────────┘
             */}
            {compteSupplementaire ? (
              <li className={styles.compteCarte}>
                <span className={styles.compteValeur}>
                  {compteSupplementaire.valeur}
                </span>
                <span className={styles.compteLibelle}>
                  {compteSupplementaire.libelle}
                </span>
              </li>
            ) : null}
          </ul>
        ) : null}
      </div>

      <div className={styles.page}>
        {/*
         * Sous Organic, la recherche entre DANS la barre de filtres : la
         * maquette n'a qu'une rangée, où le champ est la première pastille.
         */}
        {estV3() ? null : (
          <ChampRecherche langue={langue} action={base} filtres={filtres} />
        )}

        {avantFiltres}

        <div className={styles.colonnes}>

          {/* ── Filtres : colonne sur ordinateur, feuille au téléphone ─── */}
          <div className={styles.colonneFiltres}>
            {/*
             * Le déclencheur, visible seulement en écran étroit.
             *
             * C'est un LIEN, pas un bouton : il ne fait qu'amener le fragment
             * `#filtres` dans l'URL, et cela suffit à ouvrir la feuille sans
             * une ligne de JavaScript.
             */}
            <a
              className={styles.declencheur}
              href={ANCRE_FILTRES}
              aria-label={libelleDeclencheur}
            >
              {traduire(langue, "catalogue.filtres")}
              {poses.length > 0 ? (
                <span className={styles.declencheurCompte} aria-hidden="true">
                  {poses.length}
                </span>
              ) : null}
            </a>

            {/* L'ancre : jamais dessinée, seulement visée. Voir l'encadré. */}
            <span
              id="filtres"
              className={styles.ancre}
              aria-hidden="true"
            />

            <div className={styles.feuille}>
              {/*
               * Le voile referme au doigt, comme on l'attend d'une feuille
               * modale. Il est décoratif pour le lecteur d'écran, qui dispose
               * du bouton « Voir N contes » en bas de la feuille.
               */}
              <a
                className={styles.voile}
                href={ANCRE_RESULTATS}
                tabIndex={-1}
                aria-hidden="true"
              />

              <div className={styles.panneau}>
                <div className={styles.panneauEntete}>
                  <h2 className={styles.panneauTitre}>
                    {traduire(langue, "catalogue.filtres")}
                  </h2>
                  {/* Rien à effacer tant que rien n'est posé. */}
                  {poses.length > 0 ? (
                    <a
                      className={styles.effacer}
                      href={`${base}${ANCRE_FILTRES}`}
                    >
                      {traduire(langue, "v2.filtresEffacer")}
                    </a>
                  ) : null}
                </div>

                {estV3() ? (
                  <ChampRecherche langue={langue} action={base} filtres={filtres} />
                ) : null}

                {/*
                  ┌──────────────────────────────────────────────────────────┐
                  │ LES PASTILLES DE NIVEAU — LE RAYON DES LIVRETS, ET LUI    │
                  │ SEUL.                                                     │
                  │                                                           │
                  │ Elles remplacent les menus de thèmes et d'accès, elles    │
                  │ ne s'y ajoutent pas : voir l'encadré du haut de ce        │
                  │ fichier. Ce sont des LIENS, comme tout le reste de cet    │
                  │ écran — partageables, rechargeables, atteignables sans    │
                  │ JavaScript.                                               │
                  │                                                           │
                  │ « Tous les niveaux » n'est pas une valeur : c'est le      │
                  │ lien qui RETIRE le filtre. Il est marqué courant quand    │
                  │ rien n'est posé, faute de quoi la rangée n'aurait aucune  │
                  │ pastille active et rien ne dirait où l'on se trouve.      │
                  │                                                           │
                  │ Les niveaux viennent de la FACETTE, jamais d'une liste    │
                  │ écrite ici : `books.niveau` est de la saisie libre, et    │
                  │ les systèmes scolaires diffèrent d'un pays à l'autre. Une │
                  │ liste fermée aurait à être rouverte à chaque pays.        │
                  └──────────────────────────────────────────────────────────┘
                */}
                {rayonDeLivrets ? (
                  facettes.niveaux.length > 0 ? (
                    <nav
                      className={styles.niveaux}
                      aria-label={traduire(langue, "catalogue.niveaux")}
                    >
                      <a
                        className={
                          niveauPose === undefined
                            ? `${styles.pastilleNiveau} ${styles.pastilleNiveauActive}`
                            : styles.pastilleNiveau
                        }
                        href={lienFeuille({ niveau: undefined, page: undefined })}
                        aria-current={niveauPose === undefined ? "true" : undefined}
                      >
                        {traduire(langue, "catalogue.niveauTous")}
                      </a>
                      {facettes.niveaux.map((facette) => {
                        const actif = niveauPose === facette.valeur;
                        return (
                          <a
                            key={facette.valeur}
                            className={
                              actif
                                ? `${styles.pastilleNiveau} ${styles.pastilleNiveauActive}`
                                : styles.pastilleNiveau
                            }
                            /* Cliquer un niveau actif le RETIRE — un seul se
                               pose à la fois, et c'est la seule façon de
                               revenir en arrière sans chercher une croix. */
                            href={lienFeuille({
                              niveau: actif ? undefined : facette.valeur,
                              page: undefined,
                            })}
                            aria-current={actif ? "true" : undefined}
                          >
                            {facette.valeur}
                            <span className={styles.compteFacette}>
                              ({facette.nombre})
                            </span>
                          </a>
                        );
                      })}
                    </nav>
                  ) : null
                ) : (
                <nav
                  className={styles.filtres}
                  aria-label={traduire(langue, "catalogue.filtres")}
                >
                  {/*
                    LE GROUPE « RÉGION » A DISPARU — migration 0071.

                    Il ne rangeait que les contes : cliquer « Sahel » faisait
                    disparaître d'un coup tous les livrets pédagogiques, sans
                    rien annoncer. Les THÈMES, juste en dessous, valent pour
                    les deux supports.
                  */}
                  {facettes.themes.length > 0 ? (
                    <details className={styles.groupe} open={!estV3()}>
                      <summary className={styles.groupeTitre}>
                        {traduire(langue, "catalogue.themes")}
                      </summary>
                      <div className={styles.pastilles}>
                        {facettes.themes.map((facette) => {
                          const actif = themesPoses.has(facette.valeur);
                          // Les thèmes se CUMULENT : on cherche « ruse ET
                          // animaux », pas l'un puis l'autre. Cliquer un filtre
                          // actif le RETIRE — la seule façon de revenir en
                          // arrière sans avoir à chercher une croix.
                          const apres = actif
                            ? [...themesPoses].filter(
                                (theme) => theme !== facette.valeur,
                              )
                            : [...themesPoses, facette.valeur];

                          return (
                            <a
                              key={facette.valeur}
                              className={
                                actif
                                  ? `${styles.pastille} ${styles.pastilleActive}`
                                  : styles.pastille
                              }
                              href={lienFeuille({
                                themes:
                                  apres.length > 0
                                    ? apres.join(",")
                                    : undefined,
                                page: undefined,
                              })}
                              aria-current={actif ? "true" : undefined}
                            >
                              {facette.valeur}{" "}
                              {/*
                               * Le compte sort de la SCENE sous Organic : la
                               * maquette ecrit « Nature », pas « nature (2) ».
                               * Il double la largeur de chaque pastille pour
                               * dire ce que la grille montre une ligne plus
                               * bas. Il reste annonce aux lecteurs d'ecran,
                               * pour qui la grille n'est pas un coup d'oeil.
                               */}
                              <span className={styles.compteFacette}>
                                ({facette.nombre})
                              </span>
                            </a>
                          );
                        })}
                      </div>
                    </details>
                  ) : null}

                  <details className={styles.groupe} open={!estV3()}>
                    <summary className={styles.groupeTitre}>
                      {traduire(langue, "catalogue.acces")}
                    </summary>
                    <div className={styles.pastilles}>
                      {(["abonnement", "achat", "gratuit"] as const).map(
                        (type) => {
                          const actif = filtres.acces === type;
                          const cle =
                            type === "abonnement"
                              ? "catalogue.accesAbonnement"
                              : type === "achat"
                                ? "catalogue.accesAchat"
                                : "catalogue.accesGratuit";
                          return (
                            <a
                              key={type}
                              className={
                                actif
                                  ? `${styles.pastille} ${styles.pastilleActive}`
                                  : styles.pastille
                              }
                              href={lienFeuille({
                                acces: actif ? undefined : type,
                                page: undefined,
                              })}
                              aria-current={actif ? "true" : undefined}
                            >
                              {traduire(langue, cle)}
                            </a>
                          );
                        },
                      )}
                    </div>
                  </details>
                </nav>
                )}

                {/*
                 * La confirmation, en bas de feuille.
                 *
                 * Elle ne « valide » rien : les filtres sont déjà appliqués à
                 * chaque pastille cliquée. Elle referme, et le compte qu'elle
                 * porte est justement ce qui donne envie de refermer.
                 */}
                <a className={styles.valider} href={ANCRE_RESULTATS}>
                  {libelleValider}
                </a>

                {estV3() && !rayonDeLivrets ? triEtVue : null}
              </div>
            </div>
          </div>

          {/* ── Grille, en colonne de droite ───────────────────────────── */}
          {/*
           * `id="resultats"` est la cible de retour de la feuille : refermer
           * ramène sur la marchandise, pas en haut de page.
           */}
          <div className={styles.colonneGrille} id="resultats">
            {/* ── Compte et tri ─────────────────────────────────────────── */}
            <div className={styles.outils}>
              {/*
               * ┌────────────────────────────────────────────────────────┐
               * │ LE COMPTE EST UNE RÉGION VIVANTE.                      │
               * │                                                        │
               * │ Filtrer et chercher remplacent la grille SANS changer  │
               * │ de page : pour qui ne voit pas l'écran, rien ne se     │
               * │ passe — le focus reste dans le champ, et la liste se   │
               * │ renouvelle en silence.                                 │
               * │                                                        │
               * │ « 3 contes sur 47 correspondent à vos filtres » est    │
               * │ exactement ce qu'il faut annoncer, et cette phrase     │
               * │ existait déjà. Elle avait seulement besoin d'être      │
               * │ écoutée. `polite` : elle attend une pause, elle ne     │
               * │ coupe pas la frappe.                                   │
               * └────────────────────────────────────────────────────────┘
               */}
              <p className={styles.compte} aria-live="polite" aria-atomic="true">
                {compte}
              </p>

              {estV3() ? null : triEtVue}
            </div>

            {/* ── Grille ────────────────────────────────────────────────────── */}
            {page.entrees.length === 0 ? (
              <CatalogueVide
                langue={langue}
                lienSansFiltres={base}
                {...(videTitre === undefined ? {} : { titre: videTitre })}
              />
            ) : (
              <>
                {/*
                 * `data-support` dit à la grille ce qu'elle range.
                 *
                 * Les livrets sont des cartes COUCHÉES, larges de 330 px au
                 * minimum dans la maquette, contre 226 pour les couvertures
                 * debout des contes. Une seule mesure pour les deux donnerait
                 * soit des livrets écrasés, soit des contes gigantesques.
                 *
                 * C'est un attribut et non une seconde classe : une classe
                 * déclarée uniquement sous `:global(...)` n'est pas exportée
                 * par le module CSS et vaudrait `undefined` —
                 * `classes-css.test.ts` défend ce piège, qui a déjà coûté cinq
                 * défauts sur cet écran.
                 *
                 * Sur `/catalogue`, où les deux supports se mêlent, `type` est
                 * absent : la grille reprend la mesure des contes, et les
                 * cartes de livrets s'y logent en gardant leur forme.
                 */}
                <ul
                  className={styles.grille}
                  data-vue={vue ?? "grille"}
                  data-support={filtres.type ?? undefined}
                >
                  {page.entrees.map((entree, rang) => (
                    <li key={entree.id}>
                      <Revele rang={rang}>
                        <CarteConteV2
                          langue={langue}
                          entree={entree}
                          disposition={vue ?? "grille"}
                          recherche={filtres.q}
                          actionAjout={actionAjout?.(entree.id)}
                        />
                      </Revele>
                    </li>
                  ))}
                </ul>

                <Pagination
                  langue={langue}
                  page={page.page}
                  pages={page.pages}
                  total={page.total}
                  lien={(numero) => lien({ page: numero })}
                />
              </>
            )}

            {/*
             * Le bloc du rayon, APRES la grille et sa pagination.
             *
             * Il est rendu meme quand la grille est vide : un rayon sans
             * livret publie a encore quelque chose a proposer, et c'est
             * precisement ce jour-la que l'appel « sur mesure » compte.
             */}
            {apresGrille}
          </div>
        </div>
      </div>
    </>
  );
}

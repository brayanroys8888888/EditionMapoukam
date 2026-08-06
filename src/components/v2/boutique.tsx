import type { ReactNode } from "react";

import { traduire, type LangueInterface } from "@/i18n";
import type { EntreeCatalogue, RegionConte } from "@/domain/catalog/types";
import type { ReponseFacettes } from "@/domain/api/contract";
import { TRIS } from "@/domain/catalog/schemas";
import type { FiltrePose, FiltresCatalogue, Lien } from "@/components/catalogue";
import { CatalogueVide, ChampRecherche } from "@/components/catalogue";

import { Pagination } from "@/components/base";
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

export function BoutiqueV2({
  langue,
  page,
  facettes,
  filtres,
  poses,
  lien,
  base,
  compte,
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
  /** Fabrique l'action d'ajout au panier d'un titre donné. */
  actionAjout?: (
    livreId: string,
  ) => (donnees: FormData) => void | Promise<void>;
}): ReactNode {
  const themesPoses = new Set(filtres.themes ?? []);

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

  return (
    <>
      <div className={styles.banniere} data-banniere>
        <div className={styles.banniereInterieur}>
          <span className={styles.oeil}>
            {traduire(langue, "v2.boutiqueOeil")}
          </span>
          <h1 className={styles.banniereTitre}>
            {traduire(langue, "v2.boutiqueTitre")}
          </h1>
          <p className={styles.banniereTexte}>
            {traduire(langue, "v2.boutiqueTexte")}
          </p>
        </div>
      </div>

      <div className={styles.page}>
        <ChampRecherche langue={langue} action={base} filtres={filtres} />
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

                <nav
                  className={styles.filtres}
                  aria-label={traduire(langue, "catalogue.filtres")}
                >
                  {facettes.regions.length > 0 ? (
                    <section className={styles.groupe}>
                      <h3 className={styles.groupeTitre}>
                        {traduire(langue, "catalogue.region")}
                      </h3>
                      <div className={styles.pastilles}>
                        {facettes.regions.map((facette) => {
                          const actif = filtres.region === facette.valeur;
                          return (
                            <a
                              key={facette.valeur}
                              className={
                                actif
                                  ? `${styles.pastille} ${styles.pastilleActive}`
                                  : styles.pastille
                              }
                              // Cliquer un filtre actif le RETIRE : c'est la
                              // seule façon de revenir en arrière sans avoir à
                              // chercher une croix.
                              href={lienFeuille({
                                region: actif ? undefined : facette.valeur,
                                page: undefined,
                              })}
                              aria-current={actif ? "true" : undefined}
                            >
                              {traduire(
                                langue,
                                `regions.${facette.valeur as RegionConte}`,
                              )}{" "}
                              ({facette.nombre})
                            </a>
                          );
                        })}
                      </div>
                    </section>
                  ) : null}

                  {facettes.themes.length > 0 ? (
                    <section className={styles.groupe}>
                      <h3 className={styles.groupeTitre}>
                        {traduire(langue, "catalogue.themes")}
                      </h3>
                      <div className={styles.pastilles}>
                        {facettes.themes.map((facette) => {
                          const actif = themesPoses.has(facette.valeur);
                          // Les thèmes se CUMULENT, contrairement à la région :
                          // on cherche « ruse ET animaux », pas l'un puis
                          // l'autre.
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
                              {facette.valeur} ({facette.nombre})
                            </a>
                          );
                        })}
                      </div>
                    </section>
                  ) : null}

                  <section className={styles.groupe}>
                    <h3 className={styles.groupeTitre}>
                      {traduire(langue, "catalogue.acces")}
                    </h3>
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
                  </section>
                </nav>

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
              <p className={styles.compte}>{compte}</p>

              <nav
                className={styles.tri}
                aria-label={traduire(langue, "catalogue.tri")}
              >
                <span className={styles.triTitre}>
                  {traduire(langue, "catalogue.tri")}
                </span>
                {TRIS.map((valeur) => (
                  <a
                    key={valeur}
                    href={lien({ tri: valeur, page: undefined })}
                    className={
                      valeur === filtres.tri
                        ? `${styles.triLien} ${styles.triActif}`
                        : styles.triLien
                    }
                    aria-current={valeur === filtres.tri ? "true" : undefined}
                  >
                    {traduire(langue, libellesTri[valeur])}
                  </a>
                ))}
              </nav>
            </div>

            {/* ── Grille ────────────────────────────────────────────────────── */}
            {page.entrees.length === 0 ? (
              <CatalogueVide langue={langue} lienSansFiltres={base} />
            ) : (
              <>
                <ul className={styles.grille}>
                  {page.entrees.map((entree, rang) => (
                    <li key={entree.id}>
                      <Revele rang={rang}>
                        <CarteConteV2
                          langue={langue}
                          entree={entree}
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
          </div>
        </div>
      </div>
    </>
  );
}

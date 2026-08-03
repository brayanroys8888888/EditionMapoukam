import type { ReactNode } from 'react';

import { messageErreur, traduire, type LangueInterface } from '@/i18n';
import type { EntreeCatalogue, RegionConte } from '@/domain/catalog/types';
import type { ReponseFacettes } from '@/domain/api/contract';
import { TRIS } from '@/domain/catalog/schemas';
import { Pastille } from '@/components/base';
import { Vide } from '@/components/etats';
import { Couverture } from './couverture';
import styles from './catalogue.module.css';

/**
 * CATALOGUE — §4.1 F2.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ TOUT L'ÉTAT DE CETTE PAGE VIT DANS L'URL.                               │
 * │                                                                          │
 * │ Filtres, tri, recherche et pagination sont des LIENS, jamais des         │
 * │ boutons qui muteraient un état en mémoire. Trois conséquences, et les    │
 * │ trois sont exigées : une recherche filtrée est partageable, elle survit  │
 * │ au rechargement, et les moteurs atteignent les pages suivantes (§5.4).   │
 * │                                                                          │
 * │ C'est aussi ce qui rend la page utilisable SANS JAVASCRIPT — la          │
 * │ condition réelle d'une partie du public (§5.1).                          │
 * └──────────────────────────────────────────────────────────────────────────┘
 */

/** Les filtres tels qu'ils vivent dans l'URL. */
export interface FiltresCatalogue {
  q?: string;
  region?: RegionConte;
  themes?: string[];
  origine?: string;
  age_min?: number;
  age_max?: number;
  acces?: 'abonnement' | 'achat' | 'gratuit';
  tri: string;
  page: number;
}

/**
 * Construit l'URL d'une variante des filtres courants.
 *
 * Fournie par la page, qui seule connaît son chemin. Les composants ne
 * fabriquent jamais d'URL : ils demandent celle d'une modification.
 */
export type Lien = (modification: Record<string, string | number | undefined>) => string;

// ═══════════════════════════════════════════════════════════════════════════
// LA LIGNE D'ACCÈS — LE CŒUR DE CET ÉCRAN
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Ce qu'une carte annonce sur l'accès, en UNE ligne.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ DEUX DIMENSIONS SE CROISENT ICI, ET NE DOIVENT JAMAIS ÊTRE CONFONDUES.  │
 * │                                                                          │
 * │   * `acces.reason` décrit L'UTILISATEUR — ce qu'il détient déjà ;        │
 * │   * `gratuit`, `inclus_abonnement` et `prix` décrivent LE TITRE — ce     │
 * │     qu'il offre à qui ne le détient pas.                                 │
 * │                                                                          │
 * │ La maquette ne prévoyait que deux lignes : un prix, ou « Avec            │
 * │ l'abonnement ». Aucune des deux ne convient à quelqu'un qui détient      │
 * │ déjà le titre, et TOUTES DEUX L'INVITENT À OBTENIR CE QU'IL A DÉJÀ.     │
 * │ D'où la troisième, « Dans votre bibliothèque », qui PREND LE PAS.       │
 * │                                                                          │
 * │ Elle est décidée sur `reason`, jamais sur l'absence de prix : un titre   │
 * │ acheté conserve son prix au catalogue, et un titre sans prix dans la     │
 * │ zone de l'acheteur n'est pas pour autant possédé.                        │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export type LigneAcces =
  | { sorte: 'possede' }
  | { sorte: 'gratuit' }
  | { sorte: 'abonnement' }
  | { sorte: 'prix'; affichage: string }
  | { sorte: 'horsZone'; code: string }
  | { sorte: 'aucune' };

export function ligneAcces(entree: EntreeCatalogue): LigneAcces {
  // 1. CE QUE L'UTILISATEUR DÉTIENT. Prime sur toute offre, sans exception.
  if (entree.acces.reason === 'purchase' || entree.acces.reason === 'granted') {
    return { sorte: 'possede' };
  }

  // 2. CE QUE LE TITRE OFFRE, du plus généreux au plus contraint.
  if (entree.gratuit) return { sorte: 'gratuit' };
  if (entree.inclus_abonnement) return { sorte: 'abonnement' };
  if (entree.prix) return { sorte: 'prix', affichage: entree.prix.affichage };

  // Vendu à l'unité, mais sans prix dans la zone demandée : le titre reste
  // listé — il peut être lisible autrement — et seul l'achat est empêché.
  if (entree.achat_hors_zone) return { sorte: 'horsZone', code: entree.achat_hors_zone.code };

  return { sorte: 'aucune' };
}

function LibelleAcces({
  langue,
  ligne,
}: {
  langue: LangueInterface;
  ligne: LigneAcces;
}): ReactNode {
  switch (ligne.sorte) {
    case 'possede':
      return <p className={styles.accesPossede}>{traduire(langue, 'acces.purchase')}</p>;
    case 'gratuit':
      return <p className={styles.accesGratuit}>{traduire(langue, 'acces.free')}</p>;
    case 'abonnement':
      return <p className={styles.accesAbonnement}>{traduire(langue, 'acces.inclusAbonnement')}</p>;
    case 'prix':
      // `prix.affichage` est rendu formaté par le serveur, seule autorité sur
      // le nombre de décimales : le franc CFA n'a pas de sous-unité, et une
      // division par cent écrite ici multiplierait par cent l'erreur.
      return <p className={styles.accesPrix}>{ligne.affichage}</p>;
    case 'horsZone':
      // Le CODE, jamais le `message` de l'API : celui-ci n'est rédigé qu'en
      // français, et l'afficher tel quel rendrait l'anglais impossible.
      return <p className={styles.accesHorsZone}>{messageErreur(langue, ligne.code)}</p>;
    case 'aucune':
      return null;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// CARTE
// ═══════════════════════════════════════════════════════════════════════════

/** Rapport largeur/hauteur des couvertures, réservé avant le chargement. */
const COUVERTURE_LARGEUR = 320;
const COUVERTURE_HAUTEUR = 480;

export function CarteLivre({
  langue,
  entree,
}: {
  langue: LangueInterface;
  entree: EntreeCatalogue;
}): ReactNode {
  const ligne = ligneAcces(entree);

  const age =
    entree.age_min === null
      ? null
      : entree.age_max === null
        ? traduire(langue, 'catalogue.trancheAge').replace('{min}', String(entree.age_min))
        : traduire(langue, 'catalogue.trancheAgeBornee')
            .replace('{min}', String(entree.age_min))
            .replace('{max}', String(entree.age_max));

  return (
    <article className={styles.carte}>
      <a className={styles.carteLien} href={`/${langue}/contes/${entree.slug}`}>
        {entree.couverture ? (
          // ┌──────────────────────────────────────────────────────────────┐
          // │ LA VIGNETTE, JAMAIS LA TAILLE « FICHE ».                     │
          // │                                                              │
          // │ 320 px contre 800 px : sur une grille de vingt titres,       │
          // │ l'écart se compte en mégaoctets, et §5.1 qualifie ce         │
          // │ gaspillage de critique pour le public visé.                  │
          // │                                                              │
          // │ `Couverture` retombe sur le substitut si le fichier manque —  │
          // │ un jeton en base ne prouve pas qu'un objet existe.           │
          // └──────────────────────────────────────────────────────────────┘
          <Couverture
            langue={langue}
            url={entree.couverture.vignette}
            // `largeur` et `hauteur` réservent la place AVANT le chargement :
            // sans elles, l'arrivée des images décale la grille, et sur
            // connexion lente c'est ce décalage qui fait cliquer à côté.
            largeur={COUVERTURE_LARGEUR}
            hauteur={COUVERTURE_HAUTEUR}
            tailles="(max-width: 640px) 45vw, 200px"
          />
        ) : (
          <span className={styles.couvertureAbsente}>
            {traduire(langue, 'catalogue.sansCouverture')}
          </span>
        )}

        <h2 className={styles.titre}>{entree.titre}</h2>
      </a>

      <p className={styles.auteur}>
        {traduire(langue, 'catalogue.parAuteur').replace('{auteur}', entree.auteur)}
      </p>

      {entree.region ? (
        <Pastille region={entree.region}>{traduire(langue, `regions.${entree.region}`)}</Pastille>
      ) : null}

      {age ? <p className={styles.age}>{age}</p> : null}

      <LibelleAcces langue={langue} ligne={ligne} />
    </article>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// GRILLE
// ═══════════════════════════════════════════════════════════════════════════

export function GrilleCatalogue({
  langue,
  entrees,
}: {
  langue: LangueInterface;
  entrees: readonly EntreeCatalogue[];
}): ReactNode {
  return (
    <ul className={styles.grille}>
      {entrees.map((entree) => (
        <li key={entree.id}>
          <CarteLivre langue={langue} entree={entree} />
        </li>
      ))}
    </ul>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// FILTRES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Pastille de filtre — un LIEN, jamais un bouton.
 *
 * `Pastille` de la couche de base est un bouton bascule, adapté à un état en
 * mémoire. Ici, poser un filtre change l'URL : c'est une navigation, et un
 * lecteur d'écran doit l'annoncer comme telle. `aria-current` porte l'état
 * actif, que la couleur seule ne dirait qu'aux voyants.
 */
export function PastilleFiltre({
  href,
  actif,
  region,
  children,
}: {
  href: string;
  actif: boolean;
  region?: RegionConte;
  children: ReactNode;
}): ReactNode {
  return (
    <a
      href={href}
      className={[styles.pastilleFiltre, actif ? styles.pastilleActive : null]
        .filter(Boolean)
        .join(' ')}
      aria-current={actif ? 'true' : undefined}
      data-region={region}
    >
      {children}
    </a>
  );
}

function GroupeFiltre({
  titre,
  children,
}: {
  titre: string;
  children: ReactNode;
}): ReactNode {
  return (
    <section className={styles.groupe}>
      <h3 className={styles.groupeTitre}>{titre}</h3>
      <div className={styles.groupePastilles}>{children}</div>
    </section>
  );
}

/**
 * Barre de filtres, alimentée par les FACETTES du catalogue.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ AUCUNE VALEUR N'EST ÉCRITE EN DUR ICI.                                  │
 * │                                                                          │
 * │ Les régions, thèmes et origines viennent de `catalog_facets`, avec leur  │
 * │ effectif. Une liste figée dans l'interface se désynchroniserait du       │
 * │ catalogue au premier titre ingéré — et proposerait un filtre qui ne rend │
 * │ rien, ou en cacherait un qui existe.                                     │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export function BarreFiltres({
  langue,
  facettes,
  filtres,
  lien,
}: {
  langue: LangueInterface;
  facettes: ReponseFacettes;
  filtres: FiltresCatalogue;
  lien: Lien;
}): ReactNode {
  const themesPoses = new Set(filtres.themes ?? []);

  return (
    <nav className={styles.filtres} aria-label={traduire(langue, 'catalogue.filtres')}>
      {facettes.regions.length > 0 ? (
        <GroupeFiltre titre={traduire(langue, 'catalogue.region')}>
          {facettes.regions.map((facette) => {
            const actif = filtres.region === facette.valeur;
            return (
              <PastilleFiltre
                key={facette.valeur}
                // Cliquer un filtre actif le RETIRE : c'est la seule façon de
                // revenir en arrière sans chercher une croix minuscule.
                href={lien({ region: actif ? undefined : facette.valeur, page: undefined })}
                actif={actif}
                region={facette.valeur as RegionConte}
              >
                {traduire(langue, `regions.${facette.valeur as RegionConte}`)} ({facette.nombre})
              </PastilleFiltre>
            );
          })}
        </GroupeFiltre>
      ) : null}

      {facettes.themes.length > 0 ? (
        <GroupeFiltre titre={traduire(langue, 'catalogue.themes')}>
          {facettes.themes.map((facette) => {
            const actif = themesPoses.has(facette.valeur);
            // Les thèmes se CUMULENT, contrairement à la région : on cherche
            // « ruse ET animaux », pas l'un puis l'autre. La pastille active
            // se retire de la liste, les autres s'y ajoutent.
            const apres = actif
              ? [...themesPoses].filter((theme) => theme !== facette.valeur)
              : [...themesPoses, facette.valeur];

            return (
              <PastilleFiltre
                key={facette.valeur}
                href={lien({
                  themes: apres.length > 0 ? apres.join(',') : undefined,
                  page: undefined,
                })}
                actif={actif}
              >
                {facette.valeur} ({facette.nombre})
              </PastilleFiltre>
            );
          })}
        </GroupeFiltre>
      ) : null}

      <GroupeFiltre titre={traduire(langue, 'catalogue.acces')}>
        {(['abonnement', 'achat', 'gratuit'] as const).map((type) => {
          const actif = filtres.acces === type;
          const cle =
            type === 'abonnement'
              ? 'catalogue.accesAbonnement'
              : type === 'achat'
                ? 'catalogue.accesAchat'
                : 'catalogue.accesGratuit';
          return (
            <PastilleFiltre
              key={type}
              href={lien({ acces: actif ? undefined : type, page: undefined })}
              actif={actif}
            >
              {traduire(langue, cle)}
            </PastilleFiltre>
          );
        })}
      </GroupeFiltre>
    </nav>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// TRI ET RECHERCHE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Tri — des liens, pour la même raison que la pagination.
 *
 * Un `<select>` qui se soumettrait au changement ne fonctionnerait pas sans
 * JavaScript, et un `<select>` accompagné d'un bouton « appliquer » demande un
 * geste de plus pour un choix parmi cinq.
 */
export function SelecteurTri({
  langue,
  tri,
  lien,
}: {
  langue: LangueInterface;
  tri: string;
  lien: Lien;
}): ReactNode {
  const libelles = {
    nouveautes: 'catalogue.triNouveautes',
    popularite: 'catalogue.triPopularite',
    alphabetique: 'catalogue.triAlphabetique',
    prix: 'catalogue.triPrix',
    pertinence: 'catalogue.triPertinence',
  } as const;

  return (
    <nav className={styles.tri} aria-label={traduire(langue, 'catalogue.tri')}>
      {TRIS.map((valeur) => (
        <a
          key={valeur}
          href={lien({ tri: valeur, page: undefined })}
          className={[styles.triLien, valeur === tri ? styles.triActif : null]
            .filter(Boolean)
            .join(' ')}
          aria-current={valeur === tri ? 'true' : undefined}
        >
          {traduire(langue, libelles[valeur])}
        </a>
      ))}
    </nav>
  );
}

/**
 * Recherche — un formulaire `GET`, qui écrit dans l'URL.
 *
 * Les autres filtres sont reportés en champs cachés : sans eux, chercher
 * effacerait la région et les thèmes déjà posés, ce qui est le défaut le plus
 * courant des catalogues filtrables.
 */
export function ChampRecherche({
  langue,
  action,
  filtres,
}: {
  langue: LangueInterface;
  action: string;
  filtres: FiltresCatalogue;
}): ReactNode {
  const caches: [string, string][] = [];
  if (filtres.region) caches.push(['region', filtres.region]);
  if (filtres.acces) caches.push(['acces', filtres.acces]);
  if (filtres.origine) caches.push(['origine', filtres.origine]);
  if (filtres.age_min !== undefined) caches.push(['age_min', String(filtres.age_min)]);
  if (filtres.age_max !== undefined) caches.push(['age_max', String(filtres.age_max)]);
  // Une seule entrée, séparée par des virgules — la forme que le schéma du
  // catalogue attend. Des champs répétés produiraient `themes=a&themes=b`, que
  // la validation lirait comme la seule dernière valeur.
  if ((filtres.themes ?? []).length > 0) caches.push(['themes', (filtres.themes ?? []).join(',')]);

  return (
    <form method="get" action={action} className={styles.recherche} role="search">
      {caches.map(([nom, valeur], index) => (
        <input key={`${nom}-${String(index)}`} type="hidden" name={nom} value={valeur} />
      ))}

      <label htmlFor="catalogue-q" className={styles.rechercheLibelle}>
        {traduire(langue, 'catalogue.recherche')}
      </label>
      <input
        id="catalogue-q"
        name="q"
        type="search"
        defaultValue={filtres.q ?? ''}
        placeholder={traduire(langue, 'catalogue.rechercheAide')}
        className={styles.rechercheSaisie}
      />
      <button type="submit" className={styles.rechercheBouton}>
        {traduire(langue, 'catalogue.rechercheAction')}
      </button>
    </form>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// ÉTAT VIDE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Aucun résultat.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ UN ÉTAT VIDE SANS ISSUE EST UN CUL-DE-SAC.                              │
 * │                                                                          │
 * │ « Aucun conte ne correspond » laisse le lecteur devant un écran mort,    │
 * │ alors qu'il vient probablement de croiser deux filtres incompatibles.    │
 * │ L'issue — retirer tous les filtres — est donc offerte, pas suggérée.     │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export function CatalogueVide({
  langue,
  lienSansFiltres,
}: {
  langue: LangueInterface;
  lienSansFiltres: string;
}): ReactNode {
  return (
    <Vide
      langue={langue}
      titre={traduire(langue, 'catalogue.videTitre')}
      detail={traduire(langue, 'catalogue.videCorps')}
      action={
        <a className={styles.videAction} href={lienSansFiltres}>
          {traduire(langue, 'catalogue.videAction')}
        </a>
      }
    />
  );
}

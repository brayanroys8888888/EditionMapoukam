import type { CSSProperties, ReactNode } from 'react';

import { traduire, type CleTraduction, type LangueInterface } from '@/i18n';
import type { TypeDocument } from '@/domain/catalog/types';
import { listerLivres } from '@/lib/admin/service';
import type { Appelant } from '@/lib/auth/session';
/*
 * La MÊME fabrique d'URL et le MÊME composant que le catalogue public.
 * `urlsCouverture` est seul à connaître la convention `covers/<jeton>/…`
 * (migration 0049), et `Couverture` sait qu'un jeton en base ne prouve pas
 * que le fichier existe : il bascule sur le motif si le chargement échoue.
 */
import { urlsCouverture } from '@/lib/storage/covers';
import { Couverture, SubstitutCouverture } from '@/components/catalogue/couverture';
import { Erreur } from '@/components/etats';
import { GabaritAdmin, stylesAdmin as styles, type SectionAdmin } from '@/components/admin';

/**
 * LA LISTE DU CATALOGUE, VUE DE L'ADMINISTRATION — UNE SEULE IMPLÉMENTATION.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ POURQUOI CE FICHIER EXISTE, ALORS QU'IL NE S'AGIT « QUE » D'UN ONGLET.   │
 * │                                                                          │
 * │ L'écran des livrets et celui du catalogue montrent les mêmes colonnes,   │
 * │ les mêmes manques, les mêmes filtres et le même tableau. Recopiés, ils   │
 * │ auraient divergé au premier champ ajouté — et c'est toujours la copie    │
 * │ oubliée qui reste en production, parce que personne ne la relit.         │
 * │                                                                          │
 * │ Ce qui les distingue tient en quatre choses : le support imposé, le      │
 * │ chemin de base, l'onglet actif et un jeu de libellés. Tout le reste est  │
 * │ ici.                                                                     │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ CE QUI MANQUE À UN BROUILLON EST DIT ICI, PAS DÉCOUVERT À LA PUBLICATION.│
 * │                                                                          │
 * │ `admin_lister_livres` rend `manques`, calculé par                        │
 * │ `manques_pour_publication` — LA MÊME fonction que le déclencheur qui     │
 * │ refuse la publication. L'écran affiche donc exactement ce que la base    │
 * │ refusera.                                                                │
 * │                                                                          │
 * │ Une liste de contrôle réécrite dans l'interface aurait divergé au        │
 * │ premier champ ajouté, et l'éditeur aurait vu « publiable » sur un titre  │
 * │ que la base rejette.                                                     │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Ce composant n'est PAS un `page.tsx` : la garde d'administration reste sur
 * les écrans qui l'appellent, où le test `admin-architecture` va la chercher.
 */

/** Une ligne rendue par `admin_lister_livres`. */
interface LigneLivre {
  id: string;
  slug: string;
  auteur: string;
  statut: 'publie' | 'brouillon' | 'archive';
  type_document: TypeDocument;
  gratuit: boolean;
  inclus_abonnement: boolean;
  disponible_achat: boolean;
  publie_le: string | null;
  prix: Record<string, { montant: number; devise: string }>;
  manques: string[];
  publiable: boolean;
  /** Le jeton du jeu de couvertures, rendu depuis la migration 0087. */
  couverture_jeton: string | null;
}

const STATUTS = ['publie', 'brouillon', 'archive'] as const;

/**
 * Les supports, dans l’ordre de l’énumération `document_type`.
 *
 * Leurs libellés vivent sous `documents.*`, comme sur la fiche d’édition et
 * dans le catalogue public : un jeu de mots propre à l’administration aurait
 * fait deux vérités pour le même support, et c’est la seconde qui aurait
 * cessé d’être relue.
 */
const TYPES = ['conte', 'livret_pedagogique'] as const satisfies readonly TypeDocument[];

/** Les quatre libellés qui changent d’un écran à l’autre. */
export interface ClesListeLivres {
  titre: CleTraduction;
  sousTitre: CleTraduction;
  /** Le tableau vide — « Aucun conte » n’a pas de sens sur l’onglet des livrets. */
  vide: CleTraduction;
  /** Le message de retour après une suppression réussie. */
  supprime: CleTraduction;
  /** L'intitulé de la première colonne — « Conte » ou « Livret ». */
  colonneTitre: CleTraduction;
  /** Le décompte de résultats, au singulier puis au pluriel. */
  decompteUn: CleTraduction;
  decompte: CleTraduction;
}

interface ProprietesListeLivres {
  langue: LangueInterface;
  /** Qui est connecté — traversé jusqu'au pied du rail, jamais relu ici. */
  administrateur: Appelant;
  /** Les paramètres d’URL, déjà attendus par l’écran appelant. */
  requete: Record<string, string | string[] | undefined>;
  /** L’onglet à marquer actif dans le rail. */
  section: SectionAdmin;
  /** Le chemin de cet écran, sur lequel se construisent tous ses liens. */
  base: string;
  /**
   * Le support imposé par l’écran, ou `null` si l’éditeur peut le filtrer.
   *
   * Imposé, il n’est PAS un filtre : la barre de supports disparaît, la
   * colonne « Support » aussi — elle répéterait le titre de l’écran sur
   * chaque ligne — et `?type=` dans l’URL est sans effet.
   */
  typeImpose: TypeDocument | null;
  cles: ClesListeLivres;
  /** L'action principale, dans la barre supérieure. */
  actions: ReactNode;
  /** Ce qui se pose à droite du titre — un lien de traverse, au plus. */
  enteteActions?: ReactNode;
}

function premier(valeur: string | string[] | undefined): string | undefined {
  return Array.isArray(valeur) ? valeur[0] : valeur;
}

export async function ListeLivres({
  langue,
  administrateur,
  requete,
  section,
  base,
  typeImpose,
  cles,
  actions,
  enteteActions,
}: ProprietesListeLivres): Promise<ReactNode> {
  const demande = premier(requete['statut']);
  // Un statut inconnu dans l'URL ne fait pas tomber l'écran : il est ignoré.
  const statut = STATUTS.includes(demande as (typeof STATUTS)[number]) ? demande : undefined;

  const typeDemande = premier(requete['type']);
  // Même indulgence que pour le statut : un support inconnu est ignoré, il ne
  // vide pas la liste et ne fait pas tomber l’écran. Quand l’écran impose son
  // support, la demande de l’URL n’est même pas regardée.
  const typeChoisi =
    typeImpose === null && TYPES.includes(typeDemande as (typeof TYPES)[number])
      ? typeDemande
      : undefined;

  const q = premier(requete['q'])?.trim();

  const resultat = await listerLivres({
    // Le statut n'est PAS filtré en base : les comptes des segments se lisent
    // sur l'ensemble. Voir le bloc « LES COMPTES DES SEGMENTS » plus bas.
    statut: null,
    type: typeImpose ?? null,
    page: 1,
    taille: 100,
  }).catch(() => null);
  if (!resultat?.ok) return <Erreur langue={langue} code="erreur_interne" />;

  const tousLivres = resultat.donnees as unknown as LigneLivre[];
  const terme = q ? q.toLowerCase() : null;

  /**
   * Un lien qui change UN filtre et conserve les autres.
   *
   * Deux fonctions distinctes auraient chacune oublié l’autre filtre :
   * choisir « livrets » aurait effacé « brouillon », et l’éditeur aurait cru
   * que ses livrets étaient tous publiés.
   */
  const lien = (modification: { statut?: string; type?: string }) => {
    const params = new URLSearchParams();
    const statutCible = 'statut' in modification ? modification.statut : statut;
    const typeCible = 'type' in modification ? modification.type : typeChoisi;
    if (statutCible) params.set('statut', statutCible);
    // Un support imposé ne s'écrit jamais dans l'URL : il est dans l'adresse.
    if (typeImpose === null && typeCible) params.set('type', typeCible);
    if (q) params.set('q', q);
    const qs = params.toString();
    return qs ? `${base}?${qs}` : base;
  };

  /*
   * ┌────────────────────────────────────────────────────────────────────────┐
   * │ LA FICHE EST LA MÊME, SON ADRESSE SUIT LE SUPPORT DU TITRE.           │
   * │                                                                        │
   * │ Un seul écran d'édition pour les deux supports — mêmes champs, mêmes   │
   * │ prix, mêmes versions linguistiques —, et il adapte ses libellés au     │
   * │ `type_document` du titre ouvert.                                       │
   * │                                                                        │
   * │ Son ADRESSE, elle, suit désormais le support : `/admin/livrets/<id>`   │
   * │ pour un livret, `/admin/contes/<id>` pour un conte. L'adresse commune  │
   * │ n'était pas indolore — elle se lit comme une erreur de rangement, et   │
   * │ elle a été signalée comme telle le 7 septembre 2026.                   │
   * │                                                                        │
   * │ Elle se décide LIGNE PAR LIGNE, sur la donnée, et non sur l'onglet où  │
   * │ l'on se trouve : la liste générale mêle les deux supports, et un       │
   * │ livret y aurait sinon gardé l'adresse des contes.                      │
   * └────────────────────────────────────────────────────────────────────────┘
   */
  const ficheDe = (type: TypeDocument): string =>
    `/${langue}/admin/${type === 'livret_pedagogique' ? 'livrets' : 'contes'}`;

  /*
   * ┌────────────────────────────────────────────────────────────────────────┐
   * │ LES COMPTES DES SEGMENTS SE LISENT SUR L'ENSEMBLE, CHACUN DE SON CÔTÉ. │
   * │                                                                        │
   * │ « Brouillon 5 » est ce qui rend les brouillons trouvables : sans le     │
   * │ compte, il faut cliquer sur chaque segment pour savoir s'il porte       │
   * │ quelque chose. Les deux groupes comptent INDÉPENDAMMENT — le compte     │
   * │ d'un statut ignore le support choisi, et l'inverse — parce qu'un        │
   * │ segment répond à « combien si je clique ici », pas à « combien en plus  │
   * │ de ce qui est déjà coché ».                                            │
   * │                                                                        │
   * │ D'où une seule interrogation, SANS statut, filtrée ensuite ici. Le      │
   * │ support imposé, lui, reste filtré EN BASE : c'est la portée de l'écran, │
   * │ pas un filtre, et `total_lignes` doit le refléter.                     │
   * │                                                                        │
   * │ Limite assumée, et elle préexiste : au-delà de la page de cent titres,  │
   * │ la liste ET les comptes sont tronqués. C'était déjà le cas de la        │
   * │ recherche, qui filtre elle aussi sur la page reçue.                    │
   * └────────────────────────────────────────────────────────────────────────┘
   */
  const parStatut = (valeur: string | undefined): LigneLivre[] =>
    valeur ? tousLivres.filter((l) => l.statut === valeur) : tousLivres;

  const parType = (valeur: string | undefined): LigneLivre[] =>
    valeur ? tousLivres.filter((l) => l.type_document === valeur) : tousLivres;

  const correspond = (l: LigneLivre): boolean => {
    if (statut && l.statut !== statut) return false;
    if (typeChoisi && l.type_document !== typeChoisi) return false;
    if (!terme) return true;
    return (
      l.slug.toLowerCase().includes(terme) ||
      l.auteur.toLowerCase().includes(terme) ||
      l.id.toLowerCase().includes(terme)
    );
  };

  const livres = tousLivres.filter(correspond);

  const decompte = `${String(livres.length)} ${traduire(
    langue,
    livres.length === 1 ? cles.decompteUn : cles.decompte,
  )}`;

  /*
   * Les colonnes du prototype, à l'unité près. Le support n'a PAS sa colonne :
   * il est passé sur la seconde ligne de la cellule principale, avec les
   * manques — une colonne entière pour deux valeurs possibles coûtait plus de
   * largeur qu'elle n'en informait.
   */
  /*
   * La VIGNETTE ouvre la rangée depuis la 0087 — 36 px, une piste FIXE.
   *
   * Elle vient en tête parce qu'on reconnaît un titre à sa couverture avant
   * d'avoir lu son slug. Sa largeur ne suit pas la fenêtre : une piste `fr`
   * agrandirait une vignette de 36 px sur grand écran, et une vignette
   * agrandie n'est plus une vignette, c'est une image floue.
   */
  const colonnes =
    typeImpose === null
      ? '36px minmax(0,2.2fr) minmax(0,1fr) 96px minmax(0,1.1fr) minmax(0,1.3fr) 20px'
      : '36px minmax(0,2.4fr) minmax(0,1fr) 96px minmax(0,1fr) minmax(0,1fr) 20px';
  const largeurMin = typeImpose === null ? '748px' : '708px';

  return (
    <GabaritAdmin
      langue={langue}
      administrateur={administrateur}
      section={section}
      titre={traduire(langue, cles.titre)}
      sousTitre={traduire(langue, cles.sousTitre)}
      actions={actions}
      enteteActions={enteteActions}
    >
      {/*
        La suppression ramène ICI, et non sur l'écran du titre supprimé : le
        relire répondrait « introuvable », c'est-à-dire un 404 après une
        opération réussie.
      */}
      {requete['supprime'] ? (
        <p className={styles.succes}>{traduire(langue, cles.supprime)}</p>
      ) : null}

      {/* ── Recherche et filtres, dans une seule carte ───────────────────── */}
      <div className={`${styles.carte} ${styles.filtresCarte}`}>
        <form method="get" action={base} className={styles.filtresLigne} role="search">
          {statut ? <input type="hidden" name="statut" value={statut} /> : null}
          {typeChoisi ? <input type="hidden" name="type" value={typeChoisi} /> : null}

          <div className={styles.rechercheChamp}>
            <button
              type="submit"
              className={styles.rechercheEnvoi}
              aria-label={traduire(langue, 'catalogue.rechercheAction')}
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.75"
                aria-hidden="true"
              >
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
            </button>
            <input
              type="search"
              name="q"
              defaultValue={q ?? ''}
              placeholder={traduire(langue, 'admin.recherchePlaceholder')}
              className={styles.rechercheSaisieOrganic}
              aria-label={traduire(langue, 'catalogue.recherche')}
            />
          </div>

          <p className={styles.decompte}>{decompte}</p>
        </form>

        <div className={styles.filtresBarres}>
          {/* ── Statut ──────────────────────────────────────────────────── */}
          <nav className={styles.seg} aria-label={traduire(langue, 'admin.colStatut')}>
            <a
              className={statut ? styles.segOpt : `${styles.segOpt} ${styles.segActif}`}
              href={lien({ statut: undefined })}
              aria-current={statut ? undefined : 'true'}
            >
              {traduire(langue, 'admin.tousLesStatuts')}
              <span className={styles.segCompte}>{parStatut(undefined).length}</span>
            </a>

            {STATUTS.map((valeur) => {
              const actif = statut === valeur;
              return (
                <a
                  key={valeur}
                  className={actif ? `${styles.segOpt} ${styles.segActif}` : styles.segOpt}
                  href={lien({ statut: valeur })}
                  aria-current={actif ? 'true' : undefined}
                >
                  {traduire(langue, `admin.statut_${valeur}` as CleTraduction)}
                  <span className={styles.segCompte}>{parStatut(valeur).length}</span>
                </a>
              );
            })}
          </nav>

          {/*
            ┌──────────────────────────────────────────────────────────────┐
            │ SANS CE FILTRE, L'ACCÈS MODULAIRE DES LIVRETS EST            │
            │ INATTEIGNABLE.                                               │
            │                                                              │
            │ Les trois leviers se posent titre par titre, sur la fiche    │
            │ d'édition, et cette liste est le seul chemin vers cette       │
            │ fiche. Sur deux cents titres mêlés, régler l'accès des        │
            │ livrets demandait de les ouvrir un par un pour voir de quel   │
            │ support il s'agit.                                           │
            │                                                              │
            │ L'onglet des livrets n'en a pas besoin : son support est dans │
            │ son adresse. Un filtre qui ne peut prendre qu'une valeur      │
            │ n'est pas un filtre, c'est une décoration qui se clique sans  │
            │ rien changer.                                                │
            └──────────────────────────────────────────────────────────────┘
          */}
          {typeImpose === null ? (
            <nav className={styles.seg} aria-label={traduire(langue, 'admin.colSupport')}>
              <a
                className={typeChoisi ? styles.segOpt : `${styles.segOpt} ${styles.segActif}`}
                href={lien({ type: undefined })}
                aria-current={typeChoisi ? undefined : 'true'}
              >
                {traduire(langue, 'admin.tousLesSupports')}
                <span className={styles.segCompte}>{parType(undefined).length}</span>
              </a>

              {TYPES.map((valeur) => {
                const actif = typeChoisi === valeur;
                return (
                  <a
                    key={valeur}
                    className={actif ? `${styles.segOpt} ${styles.segActif}` : styles.segOpt}
                    href={lien({ type: valeur })}
                    aria-current={actif ? 'true' : undefined}
                  >
                    {traduire(langue, `documents.${valeur}` as CleTraduction)}
                    <span className={styles.segCompte}>{parType(valeur).length}</span>
                  </a>
                );
              })}
            </nav>
          ) : null}
        </div>
      </div>

      {/* ── Le tableau ───────────────────────────────────────────────────── */}
      <div className={`${styles.carte} ${styles.grilleCadre}`}>
        {livres.length === 0 ? (
          <p className={styles.grilleVide}>{traduire(langue, cles.vide)}</p>
        ) : (
          <table
            className={styles.grille}
            role="table"
            style={
              {
                '--grille-colonnes': colonnes,
                '--grille-min': largeurMin,
              } as CSSProperties
            }
          >
            <thead role="rowgroup">
              <tr className={styles.grilleEntete} role="row">
                {/* La colonne de vignette : sans intitulé visible, comme celle
                    du chevron, mais annoncée aux lecteurs d'écran. */}
                <th scope="col" role="columnheader">
                  <span className="sr-only">{traduire(langue, 'admin.ficheCouverture')}</span>
                </th>
                <th scope="col" role="columnheader">
                  {traduire(langue, cles.colonneTitre)}
                </th>
                <th scope="col" role="columnheader">
                  {traduire(langue, 'admin.colAuteur')}
                </th>
                <th scope="col" role="columnheader">
                  {traduire(langue, 'admin.colStatut')}
                </th>
                <th scope="col" role="columnheader">
                  {traduire(langue, 'admin.colAcces')}
                </th>
                <th scope="col" role="columnheader" className={styles.grilleColPrix}>
                  {traduire(langue, 'admin.colPrix')}
                </th>
                {/* La colonne du chevron : sans intitulé, mais elle existe. */}
                <th scope="col" role="columnheader">
                  <span className="sr-only">{traduire(langue, 'admin.colOuvrir')}</span>
                </th>
              </tr>
            </thead>

            <tbody role="rowgroup">
              {livres.map((livre) => {
                const acces = [
                  livre.gratuit ? traduire(langue, 'admin.accesGratuit') : null,
                  livre.inclus_abonnement ? traduire(langue, 'admin.accesAbonnement') : null,
                  livre.disponible_achat ? traduire(langue, 'admin.accesAchat') : null,
                ].filter(Boolean);

                /*
                 * Les prix sont affichés PAR ZONE, et jamais convertis : chaque
                 * zone a sa grille, et une conversion faite ici inventerait un
                 * montant que personne ne facturera. Le formatage reste brut —
                 * c'est un écran d'administration, pas une vitrine.
                 */
                const prix = Object.entries(livre.prix ?? {});

                const couverture = urlsCouverture(livre.couverture_jeton);

                return (
                  <tr key={livre.id} className={styles.grilleRangee} role="row">
                    <td role="cell" className={styles.grilleVignette}>
                      {/*
                        `alt` VIDE, délibérément : le slug est dans la cellule
                        suivante, et décrire l'image redirait le titre — deux
                        fois la même phrase pour un lecteur d'écran.

                        La teinte du substitut est la neutre `inconnue` :
                        `admin_lister_livres` ne rend pas `themes`, et inventer
                        une couleur d'après le slug donnerait à cet écran une
                        palette que le catalogue public ne partage pas.
                      */}
                      {couverture ? (
                        <Couverture
                          langue={langue}
                          url={couverture.vignette}
                          largeur={36}
                          hauteur={50}
                          tailles="36px"
                          teinte={null}
                          alt=""
                          classeImage={styles.grilleVignetteImage}
                        />
                      ) : (
                        <SubstitutCouverture langue={langue} teinte={null} />
                      )}
                    </td>
                    <td role="cell">
                      {/*
                        Le slug est le lien d'édition. Une colonne « Modifier »
                        de plus aurait ajouté une cible à viser sur une ligne
                        qui en a déjà : le nom du titre EST ce sur quoi on
                        clique pour l'ouvrir, partout ailleurs dans le produit.
                      */}
                      <a
                        className={styles.grilleTitre}
                        href={`${ficheDe(livre.type_document)}/${livre.id}`}
                      >
                        {livre.slug}
                      </a>

                      {/*
                        La seconde ligne — le support, puis les manques.

                        Le support n'y figure que sur l'écran du catalogue
                        entier : sur l'onglet des livrets, il répéterait le
                        titre de l'écran sur chacune des lignes.

                        Les manques ne s'affichent QUE s'il y en a. Une mention
                        « publiable » sur chaque titre publié serait du bruit.
                      */}
                      {typeImpose === null || livre.manques.length > 0 ? (
                        <div className={styles.grilleSousLigne}>
                          {typeImpose === null ? (
                            <span>
                              {traduire(langue, `documents.${livre.type_document}` as CleTraduction)}
                            </span>
                          ) : null}
                          {livre.manques.map((manque) => (
                            <span key={manque} className={styles.manque}>
                              {manque}
                            </span>
                          ))}
                        </div>
                      ) : null}
                    </td>

                    <td role="cell" className={styles.grilleAuteur}>
                      {livre.auteur}
                    </td>

                    <td role="cell">
                      <span
                        className={`${styles.etat} ${
                          livre.statut === 'publie'
                            ? styles.etatPublie
                            : livre.manques.length > 0
                              ? styles.etatAlerte
                              : styles.etatBrouillon
                        }`}
                      >
                        {traduire(langue, `admin.statut_${livre.statut}` as CleTraduction)}
                      </span>
                    </td>

                    {/*
                      Les trois leviers sont INDÉPENDANTS : un titre peut être
                      offert, inclus dans l'abonnement, vendu à l'unité, ou
                      plusieurs à la fois. La cellule les ÉNUMÈRE donc, elle ne
                      choisit pas un « mode » parmi trois — ce serait fabriquer
                      une exclusivité que ni la base ni le moteur de droits
                      n'imposent.
                    */}
                    <td role="cell" className={styles.grilleAcces}>
                      {acces.length > 0 ? acces.join(' · ') : traduire(langue, 'admin.nonPublie')}
                    </td>

                    <td role="cell" className={styles.grillePrix}>
                      {prix.length === 0 ? (
                        <span className={styles.grilleSansPrix}>
                          {traduire(langue, 'admin.aucunPrix')}
                        </span>
                      ) : (
                        prix.map(([zone, valeur]) => (
                          <div key={zone} className={styles.grillePrixLigne}>
                            {zone} {valeur.montant} {valeur.devise}
                          </div>
                        ))
                      )}
                    </td>

                    <td role="cell">
                      {/* Décoratif : le titre, à gauche, porte déjà le lien. */}
                      <svg
                        className={styles.grilleChevron}
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.75"
                        strokeLinecap="round"
                        aria-hidden="true"
                      >
                        <polyline points="9 18 15 12 9 6" />
                      </svg>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <p className={styles.note}>{traduire(langue, 'admin.chargeParLaBase')}</p>
    </GabaritAdmin>
  );
}

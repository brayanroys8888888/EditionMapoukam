import type { ReactNode } from 'react';

import { traduire, type CleTraduction, type LangueInterface } from '@/i18n';
import type { TypeDocument } from '@/domain/catalog/types';
import { listerLivres } from '@/lib/admin/service';
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
}

interface ProprietesListeLivres {
  langue: LangueInterface;
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
  /** Les boutons de dépôt, propres à chaque écran. */
  actions: ReactNode;
}

function premier(valeur: string | string[] | undefined): string | undefined {
  return Array.isArray(valeur) ? valeur[0] : valeur;
}

export async function ListeLivres({
  langue,
  requete,
  section,
  base,
  typeImpose,
  cles,
  actions,
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
  const type = typeImpose ?? typeChoisi;

  const q = premier(requete['q'])?.trim();

  const resultat = await listerLivres({
    statut: statut ?? null,
    type: type ?? null,
    page: 1,
    taille: 100,
  }).catch(() => null);
  if (!resultat?.ok) return <Erreur langue={langue} code="erreur_interne" />;

  const tousLivres = resultat.donnees as unknown as LigneLivre[];
  const terme = q ? q.toLowerCase() : null;
  const livres = terme
    ? tousLivres.filter(
        (l) =>
          l.slug.toLowerCase().includes(terme) ||
          l.auteur.toLowerCase().includes(terme) ||
          l.id.toLowerCase().includes(terme),
      )
    : tousLivres;

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

  return (
    <GabaritAdmin
      langue={langue}
      section={section}
      titre={traduire(langue, cles.titre)}
      sousTitre={traduire(langue, cles.sousTitre)}
      actions={actions}
    >
      {/*
        La suppression ramène ICI, et non sur l'écran du titre supprimé : le
        relire répondrait « introuvable », c'est-à-dire un 404 après une
        opération réussie.
      */}
      {requete['supprime'] ? (
        <p className={styles.succes}>{traduire(langue, cles.supprime)}</p>
      ) : null}

      {/* ── Barre de recherche admin ────────────────────────────────────── */}
      <form method="get" action={base} className={styles.recherche} role="search">
        {statut ? <input type="hidden" name="statut" value={statut} /> : null}
        {typeChoisi ? <input type="hidden" name="type" value={typeChoisi} /> : null}
        <input
          type="search"
          name="q"
          defaultValue={q ?? ''}
          placeholder={traduire(langue, 'admin.recherchePlaceholder')}
          className={styles.rechercheSaisie}
          aria-label={traduire(langue, 'catalogue.recherche')}
        />
        <button type="submit" className={styles.boutonSecondaire}>
          {traduire(langue, 'catalogue.rechercheAction')}
        </button>
        {q ? (
          <a className={styles.boutonDiscret} href={lien({ statut: undefined, type: undefined })}>
            {traduire(langue, 'catalogue.retirerTousFiltres')}
          </a>
        ) : null}
      </form>

      {/* ── Filtres de statut ────────────────────────────────────────────── */}
      <nav className={styles.filtres} aria-label={traduire(langue, 'admin.colStatut')}>
        <a
          className={statut ? styles.filtre : `${styles.filtre} ${styles.filtreActif}`}
          href={lien({ statut: undefined })}
          aria-current={statut ? undefined : 'true'}
        >
          {traduire(langue, 'admin.tousLesStatuts')}
        </a>

        {STATUTS.map((valeur) => {
          const actif = statut === valeur;
          return (
            <a
              key={valeur}
              className={actif ? `${styles.filtre} ${styles.filtreActif}` : styles.filtre}
              href={lien({ statut: valeur })}
              aria-current={actif ? 'true' : undefined}
            >
              {traduire(langue, `admin.statut_${valeur}` as CleTraduction)}
            </a>
          );
        })}
      </nav>

      {/*
        ┌────────────────────────────────────────────────────────────────────┐
        │ SANS CE FILTRE, L’ACCÈS MODULAIRE DES LIVRETS EST INATTEIGNABLE.   │
        │                                                                    │
        │ Les trois leviers se posent titre par titre, sur la fiche          │
        │ d’édition, et cette liste est le seul chemin vers cette fiche. Sur │
        │ deux cents titres mêlés, régler l’accès des livrets demandait de   │
        │ les ouvrir un par un pour voir de quel support il s’agit.          │
        │                                                                    │
        │ L’onglet des livrets n’en a pas besoin : son support est dans son  │
        │ adresse. Un filtre qui ne peut prendre qu’une valeur n’est pas un  │
        │ filtre, c’est une décoration qui se clique sans rien changer.      │
        └────────────────────────────────────────────────────────────────────┘
      */}
      {typeImpose === null ? (
        <nav className={styles.filtres} aria-label={traduire(langue, 'admin.colSupport')}>
          <a
            className={typeChoisi ? styles.filtre : `${styles.filtre} ${styles.filtreActif}`}
            href={lien({ type: undefined })}
            aria-current={typeChoisi ? undefined : 'true'}
          >
            {traduire(langue, 'admin.tousLesSupports')}
          </a>

          {TYPES.map((valeur) => {
            const actif = typeChoisi === valeur;
            return (
              <a
                key={valeur}
                className={actif ? `${styles.filtre} ${styles.filtreActif}` : styles.filtre}
                href={lien({ type: valeur })}
                aria-current={actif ? 'true' : undefined}
              >
                {traduire(langue, `documents.${valeur}` as CleTraduction)}
              </a>
            );
          })}
        </nav>
      ) : null}

      <div className={styles.cadre}>
        {livres.length === 0 ? (
          <p className={styles.vide}>{traduire(langue, cles.vide)}</p>
        ) : (
          <table className={styles.tableau}>
            <thead>
              <tr>
                <th scope="col">{traduire(langue, 'admin.colSlug')}</th>
                <th scope="col">{traduire(langue, 'admin.colAuteur')}</th>
                <th scope="col">{traduire(langue, 'admin.colStatut')}</th>
                {typeImpose === null ? (
                  <th scope="col">{traduire(langue, 'admin.colSupport')}</th>
                ) : null}
                <th scope="col">{traduire(langue, 'admin.colAcces')}</th>
                <th scope="col" className={styles.numerique}>
                  {traduire(langue, 'admin.colPrix')}
                </th>
              </tr>
            </thead>

            <tbody>
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

                return (
                  <tr key={livre.id}>
                    <td className={styles.cellulePrincipale}>
                      {/*
                        Le slug est le lien d'édition. Une colonne « Modifier »
                        de plus aurait ajouté une cible à viser sur une ligne
                        qui en a déjà : le nom du titre EST ce sur quoi on
                        clique pour l'ouvrir, partout ailleurs dans le produit.
                      */}
                      <a href={`${ficheDe(livre.type_document)}/${livre.id}`}>{livre.slug}</a>

                      {/*
                        Les manques ne s'affichent QUE s'il y en a. Une ligne
                        « publiable » sur chaque titre publié serait du bruit.
                      */}
                      {livre.manques.length > 0 ? (
                        <ul className={styles.manques}>
                          {livre.manques.map((manque) => (
                            <li key={manque} className={styles.manque}>
                              {manque}
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </td>

                    <td>{livre.auteur}</td>

                    <td>
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

                    {typeImpose === null ? (
                      <td>
                        {traduire(langue, `documents.${livre.type_document}` as CleTraduction)}
                      </td>
                    ) : null}

                    {/*
                      Les trois leviers sont INDÉPENDANTS : un titre peut être
                      offert, inclus dans l’abonnement, vendu à l’unité, ou
                      plusieurs à la fois. La cellule les ÉNUMÈRE donc, elle ne
                      choisit pas un « mode » parmi trois — ce serait fabriquer
                      une exclusivité que ni la base ni le moteur de droits
                      n’imposent.
                    */}
                    <td>
                      {acces.length > 0 ? acces.join(' · ') : traduire(langue, 'admin.nonPublie')}
                    </td>

                    <td className={styles.numerique}>
                      {prix.length === 0
                        ? traduire(langue, 'admin.aucunPrix')
                        : prix
                            .map(
                              ([zone, valeur]) =>
                                `${zone} ${String(valeur.montant)} ${valeur.devise}`,
                            )
                            .join(' · ')}
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

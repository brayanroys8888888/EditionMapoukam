import type { ReactNode } from 'react';
import { headers } from 'next/headers';

import { traduire, type CleTraduction, type LangueInterface } from '@/i18n';
import { catalogQuerySchema, trancheAgeCoherente } from '@/domain/catalog/schemas';
import type { EntreeCatalogue, TypeDocument } from '@/domain/catalog/types';
import { lireFacettes, listerCatalogue } from '@/lib/catalog/repository';
import { identifierAppelantAvecCookies } from '@/lib/auth/session';
import { Pagination } from '@/components/base';
import { Erreur } from '@/components/etats';
import {
  BarreFiltres,
  CatalogueVide,
  ChampRecherche,
  FiltresActifs,
  GrilleCatalogue,
  SelecteurTri,
  type FiltrePose,
  type FiltresCatalogue,
} from '@/components/catalogue';
import { lienVariante, type ModificationLien } from '@/components/catalogue/variantes';
import { teinteDuTheme } from '@/components/motif';
import { BoutiqueV2, vueDepuisRequete } from '@/components/v2/boutique';
import { estV3, structureRefondue } from '@/design/version';
import { ajouterAuPanier } from './panier/actions';
import styles from '@/components/catalogue/catalogue.module.css';

/**
 * UN RAYON — le catalogue vu par UN SEUL type de support.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ DEUX ÉCRANS, UNE IMPLÉMENTATION.                                         │
 * │                                                                          │
 * │ `/contes` et `/livrets` sont le même écran à un argument près. Écrits    │
 * │ séparément, ils auraient fini par avoir chacun leur notion de « publié », │
 * │ leur calcul de compte, leur pagination — et c'est toujours la copie qui  │
 * │ a l'air d'avoir raison. Le fichier existait déjà en double avant cette   │
 * │ séparation (`/catalogue` et `/livrets`) ; en ajouter un troisième aurait │
 * │ figé la divergence.                                                      │
 * │                                                                          │
 * │ Ce module vit sous `src/app/` et non sous `src/components/` : il appelle │
 * │ `listerCatalogue`, et le dépôt réserve cet appel à la couche des routes. │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LE FILTRE EST POSÉ EN SQL, PAS SUR LE RÉSULTAT.                          │
 * │                                                                          │
 * │ Trier la page reçue aurait laissé `total` compter tout le catalogue :    │
 * │ « 3 sur 47 » sur un rayon qui en contient trois, une pagination qui      │
 * │ promet des pages vides, et un « aucun résultat » qui n'arrive jamais.    │
 * │ Le filtre descend jusqu'à `catalog_list`, où se décide déjà ce qui sort  │
 * │ du catalogue.                                                            │
 * └──────────────────────────────────────────────────────────────────────────┘
 */

/** Les libellés propres à un rayon. Tout le reste est commun. */
export interface ClesRayon {
  /** Titre de l'écran, et titre de la bannière en V2. */
  titre: CleTraduction;
  /** Sous-titre : une phrase, la même en métadonnée et sous la bannière. */
  intro: CleTraduction;
  /** « {total} contes disponibles » — accordé au pluriel. */
  compteTous: CleTraduction;
  /** « 1 conte disponible ». */
  compteUn: CleTraduction;
  /**
   * Le titre de l'etat vide, et le libelle de la carte de compte.
   *
   * ┌────────────────────────────────────────────────────────────────────────┐
   * │ UN RAYON PARLE DE CE QU'IL RANGE.                                      │
   * │                                                                        │
   * │ L'ecran des livrets affichait « Aucun CONTE ne correspond » et « 0      │
   * │ titres illustres » : les deux phrases viennent du catalogue des contes, │
   * │ et elles sont fausses ici. Le vocabulaire d'un rayon lui appartient —   │
   * │ c'est deja ce que `compteTous` et `compteUn` etablissent.               │
   * └────────────────────────────────────────────────────────────────────────┘
   */
  videTitre: CleTraduction;
  compteCarte: CleTraduction;
}

/**
 * Aplati les paramètres de recherche.
 *
 * `searchParams` rend un tableau quand un paramètre est répété, ce que le
 * schéma n'attend pas.
 */
export function aplatirRequete(requete: Record<string, string | string[] | undefined>): Record<string, string> {
  const brut: Record<string, string> = {};
  for (const [cle, valeur] of Object.entries(requete)) {
    const seule = Array.isArray(valeur) ? valeur[0] : valeur;
    if (seule !== undefined && seule !== '') brut[cle] = seule;
  }
  return brut;
}

export async function Rayon({
  langue,
  requete,
  type,
  base,
  cles,
  apresGrille,
  misEnAvant,
  compteSupplementaire,
}: {
  langue: LangueInterface;
  /** Les paramètres de l'URL, déjà aplatis par la page. */
  requete: Record<string, string>;
  /** Le support de ce rayon. IMPOSÉ : il n'est pas un filtre, c'est l'écran. */
  type: TypeDocument;
  /** Chemin de l'écran, préfixe de langue compris — `/fr/contes`. */
  base: string;
  cles: ClesRayon;
  /** Un bloc propre au rayon, rendu apres la grille. Voir `BoutiqueV2`. */
  apresGrille?: ReactNode;
  /**
   * Le panneau de mise en avant, dessiné À PARTIR d'un titre du rayon.
   *
   * ┌────────────────────────────────────────────────────────────────────────┐
   * │ C'EST LE RAYON QUI CHOISIT LE TITRE, PAS L'ÉCRAN.                     │
   * │                                                                        │
   * │ La maquette met en avant le kit offert du rayon des livrets. L'écran   │
   * │ ne peut pas le désigner : il n'a pas la liste, c'est ici qu'elle est   │
   * │ lue. Il fournit donc la FORME, et reçoit le titre en argument.         │
   * │                                                                        │
   * │ Deux gardes, et les deux comptent :                                    │
   * │                                                                        │
   * │ — rien n'est mis en avant dès qu'un filtre est posé. Un panneau qui    │
   * │   survit au filtrage montrerait un titre que la recherche vient        │
   * │   d'écarter, juste au-dessus d'une grille qui ne le contient pas ;     │
   * │ — rien au-delà de la première page, pour la même raison.               │
   * └────────────────────────────────────────────────────────────────────────┘
   */
  misEnAvant?: (entree: EntreeCatalogue) => ReactNode;
  /** Une troisieme carte de banniere. Voir `BoutiqueV2`. */
  compteSupplementaire?: { valeur: string; libelle: string };
}): Promise<ReactNode> {
  /*
   * `type` ne voyage pas dans les liens de cet écran : il est dans le chemin.
   * L'y laisser permettrait `/fr/contes?type=livret_pedagogique`, c'est-à-dire
   * un rayon qui montre exactement ce qu'il annonce ne pas montrer.
   */
  const brut = { ...requete };
  delete brut['type'];

  const analyse = catalogQuerySchema.safeParse({ langue, ...brut, type });

  // Une URL malformée n'est pas une panne : on retombe sur le rayon par défaut
  // plutôt que d'opposer une erreur à qui a simplement suivi un vieux lien.
  const query = analyse.success ? analyse.data : catalogQuerySchema.parse({ langue, type });

  const parametres = trancheAgeCoherente(query)
    ? query
    : { ...query, age_min: undefined, age_max: undefined };

  const appelant = await identifierAppelantAvecCookies(
    new Request('http://interne/', { headers: await headers() }),
  );

  let page;
  let facettes;
  try {
    [page, facettes] = await Promise.all([
      listerCatalogue(appelant?.id ?? null, parametres),
      lireFacettes(parametres.langue),
    ]);
  } catch {
    // Aucun détail technique n'atteint l'écran : `Erreur` traduit un code.
    return <Erreur langue={langue} code="erreur_interne" />;
  }

  // URL d'une variante des filtres courants — la même implémentation que le
  // catalogue : voir `lienVariante`. Même raison qu'au-dessus : le type ne se
  // dépose jamais dans l'URL d'ici.
  const lien = (modification: ModificationLien): string =>
    lienVariante(base, brut, modification, ['type']);

  const filtres: FiltresCatalogue = {
    q: parametres.q,
    type,
    niveau: parametres.niveau,
    themes: parametres.themes,
    origine: parametres.origine,
    age_min: parametres.age_min,
    age_max: parametres.age_max,
    acces: parametres.acces,
    tri: parametres.tri,
    page: parametres.page,
  };

  // Le type n'apparaît PAS parmi les filtres retirables : il n'est pas un
  // filtre que le lecteur a posé, c'est l'écran où il se trouve.
  const poses: FiltrePose[] = [];

  for (const theme of filtres.themes ?? []) {
    const restants = (filtres.themes ?? []).filter((autre) => autre !== theme);
    poses.push({
      cle: `theme:${theme}`,
      libelle: theme,
      // La pastille garde la couleur qu'avait celle de la région : la teinte
      // vient maintenant du thème lui-même, par la même fonction que les
      // couvertures, pour qu'un thème ait UNE couleur sur tout le site.
      teinte: teinteDuTheme(theme),
      retrait: lien({
        themes: restants.length > 0 ? restants.join(',') : undefined,
        page: undefined,
      }),
    });
  }

  /*
   * Le NIVEAU est retirable comme les autres — migration 0083.
   *
   * Il est posé avant l'accès pour une raison de lecture : sur le rayon des
   * livrets, c'est le seul filtre que la barre offre, et c'est donc lui qu'on
   * cherche d'abord dans la liste des filtres actifs.
   */
  if (filtres.niveau) {
    poses.push({
      cle: 'niveau',
      libelle: filtres.niveau,
      retrait: lien({ niveau: undefined, page: undefined }),
    });
  }

  if (filtres.acces) {
    const cle =
      filtres.acces === 'abonnement'
        ? 'catalogue.accesAbonnement'
        : filtres.acces === 'achat'
          ? 'catalogue.accesAchat'
          : 'catalogue.accesGratuit';
    poses.push({
      cle: `acces:${filtres.acces}`,
      libelle: traduire(langue, cle),
      retrait: lien({ acces: undefined, page: undefined }),
    });
  }

  if (filtres.q) {
    poses.push({
      cle: 'q',
      libelle: filtres.q,
      retrait: lien({ q: undefined, page: undefined }),
    });
  }

  /**
   * Le compte se lit ICI sur le rayon, pas sur le catalogue entier.
   *
   * `facettes.total` compte tous les titres publiés, les deux supports mêlés.
   * Écrire « 3 sur 47 » sur l'écran des livrets laisserait croire que
   * quarante-quatre livrets sont cachés par un filtre. Le total de référence
   * est donc celui de la facette du type — la seule qui parle de ce rayon.
   */
  const totalRayon = facettes.types.find((facette) => facette.valeur === type)?.nombre ?? page.total;

  const compte = ((): string => {
    if (poses.length === 0) {
      return page.total === 1
        ? traduire(langue, cles.compteUn)
        : traduire(langue, cles.compteTous).replace('{total}', String(page.total));
    }

    const cle =
      page.total === 0
        ? 'catalogue.compteFiltreAucun'
        : page.total === 1
          ? 'catalogue.compteFiltreUn'
          : 'catalogue.compteFiltre';

    return traduire(langue, cle)
      .replace('{montres}', String(page.total))
      .replace('{total}', String(totalRayon));
  })();

  /*
   * ┌────────────────────────────────────────────────────────────────────────┐
   * │ LE TITRE MIS EN AVANT : LE PLUS FOURNI DES OFFERTS.                    │
   * │                                                                        │
   * │ Deux critères, et l'ordre entre eux compte.                            │
   * │                                                                        │
   * │ OFFERT d'abord : c'est la seule propriété qui justifie d'occuper le    │
   * │ haut de l'écran, puisque le panneau invite à ouvrir le kit             │
   * │ sur-le-champ — ce qu'aucun titre payant ne permettrait.                │
   * │                                                                        │
   * │ LE PLUS DE PAGES ensuite. « Le premier offert » suffisait tant qu'il   │
   * │ n'y en avait qu'un ; à quatre, il désignait la dernière feuille        │
   * │ déposée — une page de coloriage — pendant que le vrai cahier de        │
   * │ quatre planches attendait dans la grille. Le nombre de pages est ce    │
   * │ qu'on a de plus proche de « le plus fourni », et il est LU, jamais     │
   * │ deviné : aucune colonne ne dit « mets celui-ci en avant », et en       │
   * │ inventer une serait poser une règle éditoriale que personne n'a        │
   * │ demandée.                                                              │
   * │                                                                        │
   * │ À égalité, l'ordre du rayon tranche — c'est-à-dire la nouveauté.       │
   * └────────────────────────────────────────────────────────────────────────┘
   */
  const aMettreEnAvant =
    misEnAvant !== undefined && poses.length === 0 && page.page === 1
      ? page.entrees
          .filter((entree) => entree.gratuit)
          .reduce<EntreeCatalogue | undefined>(
            (meilleur, entree) =>
              meilleur === undefined || (entree.nb_pages ?? 0) > (meilleur.nb_pages ?? 0)
                ? entree
                : meilleur,
            undefined,
          )
      : undefined;

  if (structureRefondue()) {
    return (
      <BoutiqueV2
        langue={langue}
        page={page}
        facettes={facettes}
        filtres={filtres}
        poses={poses}
        lien={lien}
        base={base}
        compte={compte}
        videTitre={traduire(langue, cles.videTitre)}
        {...(apresGrille === undefined ? {} : { apresGrille })}
        {...(estV3() && aMettreEnAvant !== undefined && misEnAvant !== undefined
          ? { avantFiltres: misEnAvant(aMettreEnAvant) }
          : {})}
        {...(estV3() && compteSupplementaire !== undefined
          ? { compteSupplementaire }
          : {})}
        libelleCompte={traduire(langue, cles.compteCarte)}
        {...(estV3() ? { vue: vueDepuisRequete(brut) } : {})}
        titre={traduire(langue, cles.titre)}
        texte={traduire(langue, cles.intro)}
        actionAjout={(livreId) => ajouterAuPanier.bind(null, langue, livreId, langue)}
      />
    );
  }

  return (
    <div className={styles.page}>
      <h1 className={styles.pageTitre}>{traduire(langue, cles.titre)}</h1>
      <p className={styles.compte}>{compte}</p>

      <ChampRecherche langue={langue} action={base} filtres={filtres} />

      {/*
        `typeModifiable={false}` : la pastille de support disparaît de la barre
        de filtres. La laisser aurait offert, depuis le rayon des contes, un
        bouton qui emmène aux livrets sans le dire — et qui ramènerait un écran
        dont le titre annonce l'inverse de ce qu'il montre.
      */}
      <BarreFiltres
        langue={langue}
        facettes={facettes}
        filtres={filtres}
        lien={lien}
        typeModifiable={false}
      />

      <div className={styles.barreActifs}>
        <FiltresActifs langue={langue} poses={poses} lienSansFiltres={base} />
        <SelecteurTri langue={langue} tri={parametres.tri} lien={lien} />
      </div>

      {page.entrees.length === 0 ? (
        <CatalogueVide
          langue={langue}
          lienSansFiltres={base}
          titre={traduire(langue, cles.videTitre)}
        />
      ) : (
        <>
          <GrilleCatalogue
            langue={langue}
            entrees={page.entrees}
            dense
            recherche={filtres.q}
          />

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
  );
}

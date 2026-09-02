import type { Metadata } from 'next';
import { headers } from 'next/headers';

import { langueValide, traduire } from '@/i18n';
import { catalogQuerySchema, trancheAgeCoherente } from '@/domain/catalog/schemas';
import { lireFacettes, listerCatalogue } from '@/lib/catalog/repository';
import { identifierAppelant } from '@/lib/auth/session';
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
import styles from '@/components/catalogue/catalogue.module.css';

/**
 * LIVRETS PÉDAGOGIQUES — le catalogue, vu par un seul type de support.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ CE N'EST PAS UN SECOND CATALOGUE. C'EST LE MÊME, AVEC UN FILTRE POSÉ.  │
 * │                                                                          │
 * │ Mêmes modules — `listerCatalogue`, `lireFacettes` —, même schéma de       │
 * │ validation, mêmes composants de grille, mêmes droits. Le seul écart       │
 * │ tient en une ligne : `type` est IMPOSÉ, et ne peut pas être retiré.       │
 * │                                                                          │
 * │ Un écran qui aurait sa propre requête aurait fini par avoir sa propre     │
 * │ notion de « publié », son propre calcul de prix, sa propre pagination —   │
 * │ et c'est toujours la copie qui a l'air d'avoir raison.                    │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LE FILTRE EST POSÉ EN SQL, PAS SUR LE RÉSULTAT.                         │
 * │                                                                          │
 * │ Trier la page reçue aurait laissé `total` compter les contes : « 3 sur   │
 * │ 47 » sur un rayon qui en contient trois, une pagination qui promet des   │
 * │ pages vides, et un « aucun résultat » qui n'arrive jamais. Le filtre     │
 * │ descend jusqu'à `catalog_list`, où se décide déjà ce qui sort du         │
 * │ catalogue.                                                               │
 * └──────────────────────────────────────────────────────────────────────────┘
 */

interface Parametres {
  params: Promise<{ langue: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function premier(valeur: string | string[] | undefined): string | undefined {
  return Array.isArray(valeur) ? valeur[0] : valeur;
}

export async function generateMetadata({ params }: Parametres): Promise<Metadata> {
  const langue = langueValide((await params).langue);
  return {
    title: traduire(langue, 'livrets.titre'),
    description: traduire(langue, 'livrets.intro'),
  };
}

export default async function PageLivrets({ params, searchParams }: Parametres) {
  const langue = langueValide((await params).langue);
  const requete = await searchParams;

  const brut: Record<string, string> = {};
  for (const [cle, valeur] of Object.entries(requete)) {
    const seule = premier(valeur);
    if (seule !== undefined && seule !== '') brut[cle] = seule;
  }
  // `type` ne voyage pas dans les liens de cet écran : il est dans le chemin.
  // L'y laisser permettrait `?type=conte` sur `/livrets`, c'est-à-dire un
  // rayon qui montre exactement ce qu'il annonce ne pas montrer.
  delete brut['type'];

  const analyse = catalogQuerySchema.safeParse({ langue, ...brut, type: 'livret_pedagogique' });

  const query = analyse.success
    ? analyse.data
    : catalogQuerySchema.parse({ langue, type: 'livret_pedagogique' });

  const parametres = trancheAgeCoherente(query)
    ? query
    : { ...query, age_min: undefined, age_max: undefined };

  const appelant = await identifierAppelant(
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
    return <Erreur langue={langue} code="erreur_interne" />;
  }

  const base = `/${langue}/livrets`;

  const lien = (modification: Record<string, string | number | undefined>): string => {
    const suivants = new URLSearchParams(brut);
    for (const [cle, valeur] of Object.entries(modification)) {
      if (valeur === undefined) suivants.delete(cle);
      else suivants.set(cle, String(valeur));
    }
    // Même raison qu'au-dessus : le type ne se dépose jamais dans l'URL d'ici.
    suivants.delete('type');
    const chaine = suivants.toString();
    return chaine.length > 0 ? `${base}?${chaine}` : base;
  };

  const filtres: FiltresCatalogue = {
    q: parametres.q,
    region: parametres.region,
    type: 'livret_pedagogique',
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

  if (filtres.region) {
    poses.push({
      cle: `region:${filtres.region}`,
      libelle: traduire(langue, `regions.${filtres.region}`),
      region: filtres.region,
      retrait: lien({ region: undefined, page: undefined }),
    });
  }

  for (const theme of filtres.themes ?? []) {
    const restants = (filtres.themes ?? []).filter((autre) => autre !== theme);
    poses.push({
      cle: `theme:${theme}`,
      libelle: theme,
      retrait: lien({
        themes: restants.length > 0 ? restants.join(',') : undefined,
        page: undefined,
      }),
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
   * `facettes.total` compte tous les titres publiés, contes inclus. Écrire
   * « 3 sur 47 » sur l'écran des livrets laisserait croire que quarante-quatre
   * livrets sont cachés par un filtre. Le total de référence est donc celui de
   * la facette du type — la seule qui parle de ce rayon.
   */
  const totalRayon =
    facettes.types.find((facette) => facette.valeur === 'livret_pedagogique')?.nombre ?? page.total;

  const compte = ((): string => {
    if (poses.length === 0) {
      return page.total === 1
        ? traduire(langue, 'livrets.compteUn')
        : traduire(langue, 'livrets.compteTous').replace('{total}', String(page.total));
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

  return (
    <div className={styles.page}>
      <h1 className={styles.pageTitre}>{traduire(langue, 'livrets.titre')}</h1>
      <p className={styles.compte}>{compte}</p>

      <ChampRecherche langue={langue} action={base} filtres={filtres} />

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
        <CatalogueVide langue={langue} lienSansFiltres={base} />
      ) : (
        <>
          <GrilleCatalogue langue={langue} entrees={page.entrees} dense />

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

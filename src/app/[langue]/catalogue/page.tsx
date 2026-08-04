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
 * Catalogue — §4.1 F2.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ RENDU CÔTÉ SERVEUR, ET APPELANT LES MÊMES MODULES QUE LES ROUTES.       │
 * │                                                                          │
 * │ Cette page n'interroge pas `/api/catalog` par HTTP : elle appelle        │
 * │ `listerCatalogue` et `lireFacettes`, exactement comme les routes le      │
 * │ font. Un aller-retour réseau de plus coûterait cher sur la connexion     │
 * │ lente du public visé, et surtout : passer par HTTP n'aurait garanti      │
 * │ aucune cohérence supplémentaire, puisque c'est le MÊME module au bout.   │
 * │                                                                          │
 * │ La validation, elle non plus, n'est pas réécrite : `catalogQuerySchema`  │
 * │ est celui de l'API. Une page qui accepterait un paramètre que la route   │
 * │ refuse — ou l'inverse — serait une seconde définition du catalogue.      │
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
    title: traduire(langue, 'catalogue.titre'),
    description: traduire(langue, 'marque.baseline'),
  };
}

export default async function PageCatalogue({ params, searchParams }: Parametres) {
  const langue = langueValide((await params).langue);
  const requete = await searchParams;

  // Les valeurs brutes de l'URL, aplaties : `searchParams` rend un tableau
  // quand un paramètre est répété, ce que le schéma n'attend pas.
  const brut: Record<string, string> = {};
  for (const [cle, valeur] of Object.entries(requete)) {
    const seule = premier(valeur);
    if (seule !== undefined && seule !== '') brut[cle] = seule;
  }

  // La langue d'INTERFACE fixe par défaut la langue du CONTENU listé, sans la
  // lier définitivement : `?langue=` reste possible, et les deux réglages
  // demeurent distincts (voir l'encadré de `src/i18n/index.ts`).
  const analyse = catalogQuerySchema.safeParse({ langue, ...brut });

  // Une URL malformée n'est pas une panne : on retombe sur le catalogue par
  // défaut plutôt que d'opposer une erreur à qui a simplement suivi un vieux
  // lien. Le catalogue est la vitrine — elle doit s'afficher.
  const query = analyse.success
    ? analyse.data
    : catalogQuerySchema.parse({ langue });

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
    // Aucun détail technique n'atteint l'écran : `Erreur` traduit un code.
    return <Erreur langue={langue} code="erreur_interne" />;
  }

  const base = `/${langue}/catalogue`;

  /**
   * URL d'une variante des filtres courants.
   *
   * Elle repart des paramètres BRUTS de l'URL, et non des valeurs analysées :
   * les seconds portent des défauts — `tri=nouveautes`, `page=1` — qu'il serait
   * inutile d'écrire dans chaque lien, et qui allongeraient toutes les adresses
   * partagées.
   */
  const lien = (modification: Record<string, string | number | undefined>): string => {
    const suivants = new URLSearchParams(brut);
    for (const [cle, valeur] of Object.entries(modification)) {
      if (valeur === undefined) suivants.delete(cle);
      else suivants.set(cle, String(valeur));
    }
    const chaine = suivants.toString();
    return chaine.length > 0 ? `${base}?${chaine}` : base;
  };

  const filtres: FiltresCatalogue = {
    q: parametres.q,
    region: parametres.region,
    themes: parametres.themes,
    origine: parametres.origine,
    age_min: parametres.age_min,
    age_max: parametres.age_max,
    acces: parametres.acces,
    tri: parametres.tri,
    page: parametres.page,
  };

  // ┌────────────────────────────────────────────────────────────────────────┐
  // │ LES FILTRES POSÉS, ET LE LIEN QUI RETIRE CHACUN.                      │
  // │                                                                        │
  // │ Construits depuis les paramètres BRUTS : ce sont eux que le lecteur a  │
  // │ écrits, et retirer « région » ne doit pas au passage réécrire un tri   │
  // │ par défaut dans l'URL.                                                 │
  // │                                                                        │
  // │ Les thèmes se retirent UN PAR UN, pas tous ensemble : un lecteur qui a │
  // │ croisé « ruse » et « animaux » veut le plus souvent en lâcher un seul. │
  // └────────────────────────────────────────────────────────────────────────┘
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
   * La ligne de compte, accordée en nombre et sensible aux filtres.
   *
   * ┌──────────────────────────────────────────────────────────────────────┐
   * │ `facettes.total` EST LE CATALOGUE ENTIER, `page.total` CE QUI RESTE. │
   * │                                                                      │
   * │ Les confondre donnerait « 3 contes sur 3 correspondent à vos         │
   * │ filtres » — une phrase vraie et parfaitement inutile, qui cache       │
   * │ justement ce que le lecteur veut savoir : combien il s'en prive.      │
   * └──────────────────────────────────────────────────────────────────────┘
   */
  const compte = ((): string => {
    if (poses.length === 0) {
      return page.total === 1
        ? traduire(langue, 'catalogue.compteTousUn')
        : traduire(langue, 'catalogue.compteTous').replace('{total}', String(page.total));
    }

    const cle =
      page.total === 0
        ? 'catalogue.compteFiltreAucun'
        : page.total === 1
          ? 'catalogue.compteFiltreUn'
          : 'catalogue.compteFiltre';

    return traduire(langue, cle)
      .replace('{montres}', String(page.total))
      .replace('{total}', String(facettes.total));
  })();

  return (
    <div className={styles.page}>
      <h1 className={styles.pageTitre}>{traduire(langue, 'catalogue.titre')}</h1>
      <p className={styles.compte}>{compte}</p>

      <ChampRecherche langue={langue} action={base} filtres={filtres} />

      <BarreFiltres langue={langue} facettes={facettes} filtres={filtres} lien={lien} />

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

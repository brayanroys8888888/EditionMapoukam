import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { servirPage } from '@/lib/content/page-service';
import { enregistrerProgression, reinitialiserRegroupement } from '@/lib/reading/progress';

import { closePool, query, queryOne } from '../helpers/db';
import { createTestUser, deleteTestUser, type TestUser } from '../helpers/users';

/**
 * INVENTAIRE DES DOUBLES IMPLÉMENTATIONS — le test qui compare les verdicts.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ TROIS FOIS, UNE RÈGLE ÉCRITE EN SQL ET EN TYPESCRIPT A RENDU DES         │
 * │ VERDICTS OPPOSÉS. TROIS FOIS, C'EST UN TEST QUI L'A RATTRAPÉE PAR        │
 * │ ACCIDENT — jamais par construction.                                      │
 * │                                                                          │
 * │ Ce fichier est la construction. Pour chaque règle recensée dans          │
 * │ docs/PLAN.md §5 quinquies, il vérifie soit qu'une seule implémentation    │
 * │ existe, soit que les deux décident PAREIL sur les mêmes entrées.         │
 * │                                                                          │
 * │ Le principe : ne pas relire deux implémentations pour se convaincre       │
 * │ qu'elles s'accordent, mais les INTERROGER toutes les deux et comparer.   │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
let lecteur: TestUser;

interface Version {
  bookId: string;
  slug: string;
  /** Contrainte `check (langue in ('fr','en'))` en base — migration 0006. */
  langue: 'fr' | 'en';
  pagesReelles: number;
  nbPagesAnnonce: number;
}

let versions: Version[] = [];

beforeAll(async () => {
  lecteur = await createTestUser();

  versions = await query<Version>(
    `select t.book_id as "bookId", b.slug, t.langue,
            count(bp.id)::int as "pagesReelles",
            t.nb_pages as "nbPagesAnnonce"
       from public.book_translations t
       join public.books b on b.id = t.book_id
       left join public.book_pages bp on bp.translation_id = t.id
      where t.statut = 'publie'
      group by t.book_id, b.slug, t.langue, t.nb_pages
      order by b.slug, t.langue`,
  );

  // Le lecteur possède TOUS les titres : ces tests portent sur les bornes de
  // pagination, pas sur les droits. Un refus d'accès les ferait passer sans
  // rien comparer.
  const commande = await queryOne<{ id: string }>(
    `insert into public.orders (user_id, montant_total, devise, zone, statut, paye_le)
     values ($1, 499, 'EUR', 'international', 'paye', public.app_now()) returning id`,
    [lecteur.id],
  );
  for (const bookId of new Set(versions.map((v) => v.bookId))) {
    await query(
      `insert into public.entitlements (user_id, book_id, type, source_id, peut_telecharger)
       values ($1, $2, 'achat', $3, true)
       on conflict do nothing`,
      [lecteur.id, bookId, commande!.id],
    );
  }
});

afterAll(async () => {
  await deleteTestUser(lecteur);
  await closePool();
});

describe('le corpus de test est assez fourni pour comparer', () => {
  it('porte plusieurs versions publiées', () => {
    // Sans cette garantie, les boucles ci-dessous tourneraient à vide et
    // passeraient au vert sans avoir comparé quoi que ce soit — le défaut même
    // que cette passe d'audit cherche à éliminer.
    expect(versions.length).toBeGreaterThanOrEqual(5);
  });
});

describe('LONGUEUR D’UNE VERSION — trois modules, une seule autorité', () => {
  /**
   * `servirPage`, `reprise_lecture` et `enregistrerProgression` répondent tous
   * à « combien de pages a cette version ? ». Les deux premiers lisaient
   * `book_pages`, le troisième `book_translations.nb_pages`.
   */
  it('la fonction SQL s’accorde avec le décompte réel, sur CHAQUE version', async () => {
    const divergences: string[] = [];

    for (const version of versions) {
      const compte = await queryOne<{ nb: number }>(
        `select public.pages_publiees($1, $2)::int as nb`,
        [version.bookId, version.langue],
      );
      if (compte?.nb !== version.pagesReelles) {
        divergences.push(
          `${version.slug}/${version.langue} : fonction ${String(compte?.nb)} ` +
            `≠ décompte ${String(version.pagesReelles)}`,
        );
      }
    }

    expect(divergences).toEqual([]);
  });

  it('ÉCRIRE et SERVIR s’arrêtent à la MÊME page, sur chaque version', async () => {
    // ┌──────────────────────────────────────────────────────────────────────┐
    // │ LA DIVERGENCE QUI ÉTAIT ACTIVE.                                      │
    // │                                                                      │
    // │ Sur un titre annonçant 12 pages dont 6 étaient rendues, le service   │
    // │ de progression acceptait d'enregistrer la page 10 — que `servirPage` │
    // │ refusait d'ouvrir, et que la reprise ramenait ensuite à 6 en         │
    // │ invoquant une « pagination divergente entre langues » dont il        │
    // │ n'était pas question. Le lecteur était rembobiné en silence, sur un  │
    // │ faux motif.                                                          │
    // │                                                                      │
    // │ On interroge donc les DEUX modules juste au-delà de la dernière page │
    // │ et on exige le même verdict.                                         │
    // └──────────────────────────────────────────────────────────────────────┘
    const divergences: string[] = [];

    for (const version of versions) {
      const auDela = version.pagesReelles + 1;

      const service = await servirPage(lecteur.id, {
        bookId: version.bookId,
        langue: version.langue,
        numero: auDela,
      });

      reinitialiserRegroupement();
      const ecriture = await enregistrerProgression(
        lecteur.id,
        version.bookId,
        version.langue,
        auDela,
      );

      if (service.ok || ecriture.ok) {
        divergences.push(
          `${version.slug}/${version.langue} page ${String(auDela)} : ` +
            `servirPage ${service.ok ? 'ACCEPTE' : 'refuse'}, ` +
            `enregistrerProgression ${ecriture.ok ? 'ACCEPTE' : 'refuse'}`,
        );
      }
    }

    expect(divergences).toEqual([]);
  });

  it('ACCEPTENT tous les deux la DERNIÈRE page — sinon ce test ne prouverait rien', async () => {
    // Sans ce contrôle, deux modules qui refuseraient TOUT passeraient le test
    // précédent en s'accordant sur un refus général.
    const divergences: string[] = [];

    for (const version of versions) {
      const service = await servirPage(lecteur.id, {
        bookId: version.bookId,
        langue: version.langue,
        numero: version.pagesReelles,
      });

      reinitialiserRegroupement();
      const ecriture = await enregistrerProgression(
        lecteur.id,
        version.bookId,
        version.langue,
        version.pagesReelles,
      );

      if (!service.ok || !ecriture.ok) {
        divergences.push(
          `${version.slug}/${version.langue} page ${String(version.pagesReelles)} : ` +
            `servirPage ${service.ok ? 'accepte' : 'REFUSE'}, ` +
            `enregistrerProgression ${ecriture.ok ? 'accepte' : 'REFUSE'}`,
        );
      }
    }

    expect(divergences).toEqual([]);
  });

  it('s’accordent ENCORE quand `nb_pages` MENT sur la longueur réelle', async () => {
    // ┌──────────────────────────────────────────────────────────────────────┐
    // │ LE TEST QUI DISCRIMINE RÉELLEMENT.                                   │
    // │                                                                      │
    // │ Les deux tests précédents comparent les verdicts sur un jeu de       │
    // │ données COHÉRENT, où `nb_pages` égale le nombre de pages rendues.    │
    // │ Ils s'accordent donc quelle que soit la source consultée — et le     │
    // │ code défectueux les passerait tous les deux. Ils prouvent l'accord,  │
    // │ pas la SOURCE de l'accord.                                           │
    // │                                                                      │
    // │ Ici, on fait MENTIR `nb_pages` — 999 pages annoncées, la longueur    │
    // │ réelle inchangée — et l'on exige que les deux modules refusent quand │
    // │ même au-delà des pages rendues. C'est ce test, et lui seul, qui      │
    // │ échouerait sur l'implémentation d'avant la migration 0033.           │
    // │                                                                      │
    // │ La production ne produit pas cet écart : les deux valeurs sortent du │
    // │ même passage d'ingestion. Mais une réingestion interrompue, ou une   │
    // │ correction manuelle, l'introduirait — et il ne doit alors PAS ouvrir │
    // │ des pages inexistantes.                                             │
    // └──────────────────────────────────────────────────────────────────────┘
    const version = versions[0];
    expect(version).toBeDefined();

    const avant = await queryOne<{ nb_pages: number }>(
      `select nb_pages from public.book_translations
        where book_id = $1 and langue = $2`,
      [version!.bookId, version!.langue],
    );

    await query(
      `update public.book_translations set nb_pages = 999
        where book_id = $1 and langue = $2`,
      [version!.bookId, version!.langue],
    );

    try {
      const auDela = version!.pagesReelles + 1;

      const service = await servirPage(lecteur.id, {
        bookId: version!.bookId,
        langue: version!.langue,
        numero: auDela,
      });

      reinitialiserRegroupement();
      const ecriture = await enregistrerProgression(
        lecteur.id,
        version!.bookId,
        version!.langue,
        auDela,
      );

      // `book_pages` fait autorité : la métadonnée mensongère ne doit ouvrir
      // aucune page que l'on ne sait pas servir.
      expect(service.ok).toBe(false);
      expect(ecriture.ok).toBe(false);
    } finally {
      // Restauré quoi qu'il arrive : les autres fichiers d'intégration lisent
      // le même jeu de données.
      await query(
        `update public.book_translations set nb_pages = $3
          where book_id = $1 and langue = $2`,
        [version!.bookId, version!.langue, avant!.nb_pages],
      );
    }
  });
});

describe('FENÊTRE DE VENTE DE 3 MOIS — deux appelantes, une seule règle', () => {
  /**
   * `access_for_books` décide si un abonné peut ouvrir le titre ; `catalog_list`
   * décide si le titre s'affiche sous le filtre « accessible par abonnement ».
   * La règle §3.2 est la même — elle était écrite deux fois.
   */
  it('les deux appelantes invoquent la fonction commune, jamais leur propre calcul', async () => {
    const sources = await query<{ nom: string; corps: string }>(
      `select p.proname as nom, pg_get_functiondef(p.oid) as corps
         from pg_proc p
         join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public'
          and p.proname in ('access_for_books', 'catalog_list')`,
    );

    expect(sources.length).toBe(2);

    const coupables = sources
      .filter(
        (s) =>
          !s.corps.includes('fenetre_de_vente_ecoulee') ||
          // Le calcul en clair : ce qui traduisait la règle avant qu'elle ait
          // un nom. Sa réapparition signalerait une duplication qui repousse.
          /publie_le\s*\+\s*make_interval/.test(s.corps),
      )
      .map((s) => s.nom);

    expect(coupables).toEqual([]);
  });

  it('rendent le MÊME verdict sur un titre à la frontière de sa fenêtre', async () => {
    // ┌──────────────────────────────────────────────────────────────────────┐
    // │ La comparaison qui compte : à la seconde près, un titre est dans sa  │
    // │ fenêtre ou il n'y est plus. Un `<=` corrigé en `<` d'un seul côté    │
    // │ afficherait au catalogue un titre que l'accès refuse ensuite — un    │
    // │ abonné à qui l'on montre une porte fermée.                           │
    // └──────────────────────────────────────────────────────────────────────┘
    const fenetre = await queryOne<{ jours: number }>(
      `select fenetre_nouveaute_jours as jours from public.business_settings where id = 1`,
    );
    const jours = fenetre!.jours;

    const cas = await query<{ ecoulee: boolean; instant: string; decalage: string }>(
      `with reference as (select public.app_now() as publie_le)
       select public.fenetre_de_vente_ecoulee(r.publie_le, $1, d.instant) as ecoulee,
              d.instant::text, d.decalage
         from reference r
         cross join (values
           (public.app_now() + make_interval(days => $1) - interval '1 second', 'juste avant'),
           (public.app_now() + make_interval(days => $1),                       'pile'),
           (public.app_now() + make_interval(days => $1) + interval '1 second', 'juste apres')
         ) as d(instant, decalage)
        order by d.instant`,
      [jours],
    );

    // `<=` : le titre entre dans l'abonnement À l'instant où la fenêtre est
    // atteinte, pas une seconde plus tard.
    expect(cas.map((c) => [c.decalage, c.ecoulee])).toEqual([
      ['juste avant', false],
      ['pile', true],
      ['juste apres', true],
    ]);
  });

  it('traite un titre jamais publié comme une fenêtre NON écoulée', async () => {
    // `publie_le` nul ne doit pas rendre `null` : l'un des appelants le
    // traiterait comme faux, l'autre verrait son `and` entier s'annuler.
    const resultat = await queryOne<{ ecoulee: boolean | null }>(
      `select public.fenetre_de_vente_ecoulee(null, 90, public.app_now()) as ecoulee`,
    );

    expect(resultat?.ecoulee).toBe(false);
  });
});

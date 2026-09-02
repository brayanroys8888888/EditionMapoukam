import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

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

describe('ÉLIGIBILITÉ À L’ABONNEMENT — deux appelantes, une seule règle', () => {
  /**
   * `access_for_books` décide si un abonné peut ouvrir le titre ; `catalog_list`
   * décide si le titre s'affiche sous le filtre « accessible par abonnement ».
   * La règle est la même — elle a été écrite deux fois, et c'est ce qui avait
   * justifié `fenetre_de_vente_ecoulee` à la migration 0033.
   *
   * La migration 0064 a retiré la fenêtre, donc la fonction commune. La règle
   * qui reste — publié ET `inclus_abonnement` — est de nouveau écrite des deux
   * côtés, cette fois parce qu'elle tient en deux prédicats. Ce `describe` est
   * ce qui l'empêche de diverger : il ne lit plus un appel partagé, il compare
   * les VERDICTS.
   */
  it('aucune des deux ne réintroduit un calcul de délai depuis `publie_le`', async () => {
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
          // Le calcul en clair : ce qui traduisait la règle avant qu'elle ait
          // un nom, et ce qui la ferait repousser maintenant qu'elle n'en a
          // plus. Aucune des deux ne doit dater l'entrée dans l'abonnement.
          /publie_le\s*\+\s*make_interval/.test(s.corps) ||
          /fenetre_nouveaute|fenetre_de_vente_ecoulee/.test(s.corps),
      )
      .map((s) => s.nom);

    expect(coupables).toEqual([]);
  });

  it('rendent la MÊME liste de titres accessibles par abonnement', async () => {
    // ┌──────────────────────────────────────────────────────────────────────┐
    // │ LA COMPARAISON QUI COMPTE, MAINTENANT QUE LA RÈGLE N'A PLUS DE NOM.  │
    // │                                                                      │
    // │ Un prédicat corrigé d'un seul côté afficherait au catalogue un titre │
    // │ que l'accès refuse ensuite — un abonné à qui l'on montre une porte   │
    // │ fermée — ou l'inverse : un titre lisible que le rayon ne montre pas. │
    // │ On n'interroge donc pas le texte des fonctions, on les fait parler.  │
    // └──────────────────────────────────────────────────────────────────────┘
    const abonne = await createTestUser();
    try {
      await query(
        `insert into public.subscriptions
           (user_id, offre, statut, debut_periode, fin_periode, zone, devise, montant)
         values ($1, 'annuel', 'actif', public.app_now(), public.app_now() + interval '1 year',
                 'international', 'EUR', 6900)`,
        [abonne.id],
      );

      const parLAcces = await query<{ slug: string }>(
        `select b.slug
           from public.books b
          where b.statut = 'publie'
            and (public.access_for($1, b.id)).reason = 'subscription'
          order by b.slug`,
        [abonne.id],
      );

      const parLeCatalogue = await query<{ slug: string }>(
        `select slug from public.catalog_list(p_acces => 'abonnement', p_taille => 100)
          order by slug`,
      );

      expect(parLAcces.length).toBeGreaterThan(0);
      expect(parLAcces.map((l) => l.slug)).toEqual(parLeCatalogue.map((l) => l.slug));
    } finally {
      await deleteTestUser(abonne);
    }
  });

  it('traitent un titre jamais publié comme HORS abonnement, toutes deux', async () => {
    // `le-lievre-et-la-tortue` est en brouillon avec `inclus_abonnement` vrai :
    // le seul titre du corpus où le second prédicat ne suffit pas. Il ne doit
    // apparaître ni à l'accès ni au catalogue.
    const abonne = await createTestUser();
    try {
      await query(
        `insert into public.subscriptions
           (user_id, offre, statut, debut_periode, fin_periode, zone, devise, montant)
         values ($1, 'annuel', 'actif', public.app_now(), public.app_now() + interval '1 year',
                 'international', 'EUR', 6900)`,
        [abonne.id],
      );

      const brouillon = await queryOne<{ can_read: boolean }>(
        `select (public.access_for($1, b.id)).can_read
           from public.books b where b.slug = 'le-lievre-et-la-tortue'`,
        [abonne.id],
      );
      expect(brouillon?.can_read).toBe(false);

      const catalogue = await query<{ slug: string }>(
        `select slug from public.catalog_list(p_acces => 'abonnement', p_taille => 100)`,
      );
      expect(catalogue.map((l) => l.slug)).not.toContain('le-lievre-et-la-tortue');
    } finally {
      await deleteTestUser(abonne);
    }
  });
});

describe('VALEURS DE TEXTE LIBRE COMPARÉES POUR ÉGALITÉ', () => {
  // ┌────────────────────────────────────────────────────────────────────────┐
  // │ LA CLASSE DE DÉFAUT DÉCOUVERTE PAR L'AUDIT FRONTEND.                  │
  // │                                                                        │
  // │ `origine_culturelle` s'écrivait de DEUX façons dans le dépôt — une     │
  // │ apostrophe droite dans les seeds, une apostrophe typographique dans un │
  // │ test — sans que rien ne le signale, parce que rien ne comparait ces    │
  // │ deux valeurs.                                                          │
  // │                                                                        │
  // │ La cause générale : une donnée jamais comparée peut être fausse sans   │
  // │ bruit. Le frontend est le premier consommateur à comparer ces valeurs  │
  // │ — pour choisir une couleur, une traduction, une icône — et c'est       │
  // │ pourquoi il les révèle. Voir docs/PLAN.md §5 terdecies.                │
  // └────────────────────────────────────────────────────────────────────────┘

  it('les actions du journal d’audit disent la MÊME liste en base et dans la route', async () => {
    // La contrainte `check` de `admin_audit_log.action` et l'énumération Zod
    // de `/api/admin/audit` sont deux copies de la même liste. Une action
    // ajoutée en base sans l'autre rendrait un filtre d'administration
    // impossible à saisir — refusé en 400, pour une valeur pourtant réelle.
    // La contrainte est lue TELLE QUE POSTGRESQL LA REND, puis découpée ici :
    // l'extraire en SQL demanderait une expression régulière imbriquée dans
    // une chaîne SQL, elle-même dans une chaîne TypeScript — trois niveaux
    // d'échappement pour un découpage que JavaScript fait en une ligne.
    const contrainte = await query<{ definition: string }>(`
      select pg_get_constraintdef(c.oid) as definition
      from pg_constraint c
      join pg_class t on t.oid = c.conrelid
      where t.relname = 'admin_audit_log'
        and c.contype = 'c'
        and c.conname = 'admin_audit_log_action_check'
    `);

    const definition = contrainte[0]?.definition ?? '';
    expect(definition, 'contrainte `action` introuvable').toContain('action = ANY');

    const actionsBase = [...definition.matchAll(/'([a-z_]+)'::text/g)]
      .map((m) => m[1] ?? '')
      .sort();

    // Garde d'effectif : une extraction ratée rendrait [], et la comparaison
    // ci-dessous passerait en ne comparant rien.
    expect(actionsBase.length).toBeGreaterThanOrEqual(10);

    const source = readFileSync(
      join(process.cwd(), 'src', 'app', 'api', 'admin', 'audit', 'route.ts'),
      'utf8',
    );
    const bloc = /\.enum\(\[([\s\S]*?)\]\)/.exec(source);
    expect(bloc, 'énumération des actions introuvable dans la route').not.toBeNull();

    const actionsRoute = [...(bloc?.[1] ?? '').matchAll(/'([a-z_]+)'/g)]
      .map((m) => m[1] ?? '')
      .sort();

    expect(actionsRoute.length).toBeGreaterThanOrEqual(10);
    expect(actionsRoute).toEqual(actionsBase);
  });

  it('toute colonne de texte comparée pour égalité a une contrainte qui ferme ses valeurs', async () => {
    // ┌──────────────────────────────────────────────────────────────────────┐
    // │ LE REMÈDE GÉNÉRAL : fermer l'ensemble EN BASE.                       │
    // │                                                                      │
    // │ `langue` vaut `in ('fr','en')` sur ses sept sites, `slug` porte une  │
    // │ expression régulière, `promo_codes.code` impose `= upper(code)`.     │
    // │ Chacune rend une comparaison d'égalité TOTALE : il n'existe pas deux │
    // │ écritures de la même valeur.                                         │
    // │                                                                      │
    // │ `themes` reste ouvert, et c'est assumé : les pastilles de filtre     │
    // │ viennent de `catalog_facets()`, donc des valeurs RÉELLEMENT          │
    // │ présentes. L'interface n'en devine aucune. Deux orthographes y       │
    // │ produiraient deux pastilles — visible, et corrigeable par l'éditeur. │
    // └──────────────────────────────────────────────────────────────────────┘
    const ouvertes = await query<{ colonne: string }>(`
      select a.attname as colonne
      from pg_attribute a
      join pg_class t on t.oid = a.attrelid
      join pg_namespace n on n.oid = t.relnamespace
      where n.nspname = 'public'
        and t.relname = 'books'
        and a.attname in ('slug', 'origine_culturelle', 'region')
        and a.attnum > 0
        and not exists (
          select 1 from pg_constraint c
          where c.conrelid = t.oid
            and (c.contype = 'c' and pg_get_constraintdef(c.oid) like '%' || a.attname || '%')
        )
        and format_type(a.atttypid, null) = 'text'
    `);

    // `region` est une énumération : elle ne figure pas ici, son type ferme
    // déjà l'ensemble. `origine_culturelle` reste du texte libre DÉLIBÉRÉMENT
    // — « conte akan — Ghana » n'entre pas dans cinq valeurs — mais elle n'est
    // plus comparée pour égalité par personne : c'est `region` qui l'est.
    expect(ouvertes.map((l) => l.colonne)).toEqual(['origine_culturelle']);
  });
});

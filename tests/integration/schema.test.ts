import { afterAll, describe, expect, it } from 'vitest';

import { closePool, query, queryOne } from '../helpers/db';
import { createTestUser, deleteTestUser } from '../helpers/users';

afterAll(async () => {
  await closePool();
});

describe('couverture RLS du schéma public', () => {
  it('n’a aucune table sans RLS activée', async () => {
    // CLAUDE.md règle 1 : « Une table sans RLS est une faille, pas un oubli. »
    // Vérifié par énumération, jamais par relecture humaine.
    const rows = await query<{ tablename: string }>(`
      select t.tablename
      from pg_tables t
      join pg_class c on c.relname = t.tablename
      join pg_namespace n on n.oid = c.relnamespace and n.nspname = t.schemaname
      where t.schemaname = 'public' and c.relrowsecurity = false
      order by t.tablename
    `);

    expect(rows.map((r) => r.tablename)).toEqual([]);
  });

  it('n’a aucune table sans politique explicite', async () => {
    // Une table sans politique refuse déjà tout. La spécification exige
    // néanmoins une politique écrite : l'intention doit se lire dans le schéma.
    const rows = await query<{ tablename: string }>(`
      select t.tablename
      from pg_tables t
      where t.schemaname = 'public'
        and not exists (
          select 1 from pg_policies p
          where p.schemaname = 'public' and p.tablename = t.tablename
        )
      order by t.tablename
    `);

    expect(rows.map((r) => r.tablename)).toEqual([]);
  });

  it('couvre les tables attendues par la spécification §8', async () => {
    const rows = await query<{ tablename: string }>(
      `select tablename from pg_tables where schemaname = 'public' order by tablename`,
    );
    const tables = rows.map((r) => r.tablename);

    for (const attendue of [
      'users',
      'books',
      'book_translations',
      'subscriptions',
      'orders',
      'order_items',
      'entitlements',
      'reading_progress',
      'download_logs',
    ]) {
      expect(tables).toContain(attendue);
    }
  });
});

describe('écarts assumés avec la spécification §8', () => {
  it('entitlements.type ne connaît que « achat » et « offert »', async () => {
    // docs/PLAN.md D1 point 1 : la valeur `abonnement` est retirée. L'accès par
    // abonnement est recalculé, jamais matérialisé.
    const rows = await query<{ valeur: string }>(`
      select e.enumlabel as valeur
      from pg_type t join pg_enum e on e.enumtypid = t.oid
      where t.typname = 'entitlement_type'
      order by e.enumsortorder
    `);

    expect(rows.map((r) => r.valeur)).toEqual(['achat', 'offert']);
  });

  it('books n’a plus de colonne prix', async () => {
    // docs/PLAN.md D4 point 1 : tous les prix passent par book_prices.
    const colonne = await queryOne(`
      select column_name from information_schema.columns
      where table_schema = 'public' and table_name = 'books' and column_name = 'prix'
    `);

    expect(colonne).toBeUndefined();
  });

  it('books porte gratuit et nb_pages_extrait', async () => {
    const rows = await query<{ column_name: string }>(`
      select column_name from information_schema.columns
      where table_schema = 'public' and table_name = 'books'
        and column_name in ('gratuit', 'nb_pages_extrait')
      order by column_name
    `);

    expect(rows.map((r) => r.column_name)).toEqual(['gratuit', 'nb_pages_extrait']);
  });

  it('book_prices n’a aucune dimension linguistique', async () => {
    // docs/PLAN.md D2 point 5 : le prix ne dépend jamais de la langue.
    const colonne = await queryOne(`
      select column_name from information_schema.columns
      where table_schema = 'public' and table_name = 'book_prices' and column_name = 'langue'
    `);

    expect(colonne).toBeUndefined();
  });

  it('documente en base que order_items.langue est informative', async () => {
    // docs/PLAN.md D2 point 2 : consigné dans le schéma pour qu'aucune
    // évolution future ne s'en serve dans une vérification de droits.
    const row = await queryOne<{ commentaire: string | null }>(`
      select col_description(c.oid, a.attnum) as commentaire
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
      join pg_attribute a on a.attrelid = c.oid and a.attname = 'langue'
      where c.relname = 'order_items'
    `);

    expect(row?.commentaire).toMatch(/INFORMATIVE UNIQUEMENT/);
  });
});

describe('devises (docs/PLAN.md D4 point 3)', () => {
  it('déclare le nombre de décimales de chaque devise', async () => {
    const rows = await query<{ code: string; decimals: number; symbole: string }>(
      `select code, decimals, symbole from public.currencies order by code`,
    );

    expect(rows).toEqual([
      { code: 'EUR', decimals: 2, symbole: '€' },
      { code: 'XAF', decimals: 0, symbole: 'FCFA' },
      { code: 'XOF', decimals: 0, symbole: 'FCFA' },
    ]);
  });
});

describe('jeu de démonstration', () => {
  it('couvre tous les cas du moteur de droits', async () => {
    const rows = await query<{
      slug: string;
      statut: string;
      inclus_abonnement: boolean;
      disponible_achat: boolean;
      gratuit: boolean;
      mois: number | null;
    }>(`
      select slug, statut::text, inclus_abonnement, disponible_achat, gratuit,
             case when publie_le is null then null
                  else round(extract(epoch from (public.app_now() - publie_le)) / 2629746)
             end::int as mois
      from public.books order by slug
    `);
    const par = (slug: string) => rows.find((r) => r.slug === slug);

    expect(rows).toHaveLength(10);

    // Publié il y a plus de 3 mois et inclus : entrera dans l'abonnement.
    expect(par('le-lion-et-la-souris')).toMatchObject({
      statut: 'publie',
      inclus_abonnement: true,
    });
    expect(par('le-lion-et-la-souris')?.mois).toBeGreaterThan(3);

    // Publié il y a moins de 3 mois : encore dans la fenêtre de vente.
    expect(par('l-oiseau-de-feu')?.mois).toBeLessThan(3);
    expect(par('l-oiseau-de-feu')?.inclus_abonnement).toBe(true);

    // Vendu à l'unité seulement.
    expect(par('la-tortue-et-le-lapin')).toMatchObject({
      inclus_abonnement: false,
      disponible_achat: true,
    });

    // Gratuit et non vendu.
    expect(par('petit-baobab')).toMatchObject({ gratuit: true, disponible_achat: false });

    // Le titre d'appel : gratuit ET vendu, et encore dans sa fenêtre de vente.
    // C'est le cas qui prouve que `gratuit` prime sur la fenêtre de 3 mois.
    expect(par('la-riviere-qui-parlait')).toMatchObject({
      gratuit: true,
      disponible_achat: true,
    });
    expect(par('la-riviere-qui-parlait')?.mois).toBeLessThan(3);

    expect(par('le-lievre-et-la-tortue')?.statut).toBe('brouillon');
    expect(par('la-hyene-qui-voulait-changer')?.statut).toBe('archive');
  });

  it('comprend un titre bilingue et un titre à traduction en brouillon', async () => {
    const rows = await query<{ slug: string; langue: string; statut: string }>(`
      select b.slug, t.langue, t.statut::text
      from public.book_translations t join public.books b on b.id = t.book_id
      where b.slug in ('kouassi-et-le-tam-tam', 'la-girafe-et-l-oiseau-malin')
      order by b.slug, t.langue
    `);

    expect(rows).toEqual([
      { slug: 'kouassi-et-le-tam-tam', langue: 'en', statut: 'publie' },
      { slug: 'kouassi-et-le-tam-tam', langue: 'fr', statut: 'publie' },
      { slug: 'la-girafe-et-l-oiseau-malin', langue: 'en', statut: 'brouillon' },
      { slug: 'la-girafe-et-l-oiseau-malin', langue: 'fr', statut: 'publie' },
    ]);
  });

  it('comprend un titre sans prix pour la zone afrique, pour éprouver le repli', async () => {
    // docs/PLAN.md D4 point 8 : si un conte n'a pas de prix pour la zone
    // résolue, on retombe sur la zone internationale plutôt que d'échouer.
    const rows = await query<{ zone: string }>(`
      select p.zone::text from public.book_prices p
      join public.books b on b.id = p.book_id
      where b.slug = 'la-tortue-et-le-lapin'
    `);

    expect(rows.map((r) => r.zone)).toEqual(['international']);
  });

  it('exprime les montants dans la plus petite unité de leur devise', async () => {
    const rows = await query<{ zone: string; montant: string; devise: string }>(`
      select p.zone::text, p.montant::text, p.devise from public.book_prices p
      join public.books b on b.id = p.book_id
      where b.slug = 'le-lion-et-la-souris' order by p.zone::text
    `);

    // 1500 XAF vaut bien 1 500 francs : le franc CFA n'a pas de sous-unité.
    expect(rows).toEqual([
      { zone: 'afrique', montant: '1500', devise: 'XAF' },
      { zone: 'international', montant: '499', devise: 'EUR' },
    ]);
  });
});

describe('idempotence garantie par la base (docs/PLAN.md D1 point 8)', () => {
  it('refuse deux droits identiques pour le même utilisateur, livre et origine', async () => {
    const user = await createTestUser();
    try {
      const book = await queryOne<{ id: string }>(
        `select id from public.books where slug = 'le-lion-et-la-souris'`,
      );
      const order = await queryOne<{ id: string }>(
        `insert into public.orders (user_id, montant_total, devise, zone, statut)
         values ($1, 499, 'EUR', 'international', 'paye') returning id`,
        [user.id],
      );

      const inserer = () =>
        query(
          `insert into public.entitlements (user_id, book_id, type, source_id, peut_telecharger)
           values ($1, $2, 'achat', $3, true)`,
          [user.id, book?.id, order?.id],
        );

      await expect(inserer()).resolves.toBeDefined();
      // Le rejeu du même webhook doit échouer ICI, au niveau base, et non être
      // seulement filtré en amont.
      await expect(inserer()).rejects.toThrow(/entitlements_unique_origin|duplicate key/i);

      const rows = await query(`select 1 from public.entitlements where user_id = $1`, [user.id]);
      expect(rows).toHaveLength(1);
    } finally {
      await deleteTestUser(user);
    }
  });

  it('refuse deux octrois manuels en double, malgré leur origine nulle', async () => {
    // `nulls not distinct` : sans cette clause, PostgreSQL considérerait deux
    // NULL comme distincts et laisserait passer le doublon.
    const user = await createTestUser();
    try {
      const book = await queryOne<{ id: string }>(
        `select id from public.books where slug = 'anansi-l-araignee-maligne'`,
      );

      const inserer = () =>
        query(
          `insert into public.entitlements (user_id, book_id, type, peut_telecharger)
           values ($1, $2, 'offert', false)`,
          [user.id, book?.id],
        );

      await expect(inserer()).resolves.toBeDefined();
      await expect(inserer()).rejects.toThrow(/entitlements_unique_origin|duplicate key/i);
    } finally {
      await deleteTestUser(user);
    }
  });

  it('refuse un achat sans origine', async () => {
    const user = await createTestUser();
    try {
      const book = await queryOne<{ id: string }>(
        `select id from public.books where slug = 'le-lion-et-la-souris'`,
      );

      await expect(
        query(
          `insert into public.entitlements (user_id, book_id, type, peut_telecharger)
           values ($1, $2, 'achat', true)`,
          [user.id, book?.id],
        ),
      ).rejects.toThrow(/entitlements_achat_a_une_source/);
    } finally {
      await deleteTestUser(user);
    }
  });
});

describe('intégrité du catalogue', () => {
  it('refuse un livre publié sans date de publication', async () => {
    // La fenêtre de 3 mois se calcule sur publie_le : un titre publié sans
    // date rendrait la règle inapplicable.
    await expect(
      query(
        `insert into public.books (slug, auteur, statut, publie_le)
         values ('test-sans-date', 'Test', 'publie', null)`,
      ),
    ).rejects.toThrow(/books_publie_a_une_date/);
  });

  it('refuse une tranche d’âge incohérente', async () => {
    await expect(
      query(
        `insert into public.books (slug, auteur, age_min, age_max)
         values ('test-age', 'Test', 10, 3)`,
      ),
    ).rejects.toThrow(/books_age_coherent/);
  });

  it('refuse un abonnement dont la période se termine avant de commencer', async () => {
    const user = await createTestUser();
    try {
      await expect(
        query(
          `insert into public.subscriptions
             (user_id, offre, statut, debut_periode, fin_periode, zone, devise, montant)
           values ($1, 'mensuel', 'actif', now(), now() - interval '1 day', 'international', 'EUR', 799)`,
          [user.id],
        ),
      ).rejects.toThrow(/subscriptions_periode_coherente/);
    } finally {
      await deleteTestUser(user);
    }
  });

  it('refuse un deuxième abonnement en cours de vie pour le même utilisateur', async () => {
    const user = await createTestUser();
    try {
      const inserer = (statut: string) =>
        query(
          `insert into public.subscriptions
             (user_id, offre, statut, debut_periode, fin_periode, zone, devise, montant)
           values ($1, 'mensuel', $2, now(), now() + interval '30 days', 'international', 'EUR', 799)`,
          [user.id, statut],
        );

      await expect(inserer('actif')).resolves.toBeDefined();
      await expect(inserer('essai')).rejects.toThrow(/subscriptions_un_seul_actif_idx|duplicate key/i);
      // Un abonnement expiré n'empêche pas de se réabonner.
      await expect(inserer('expire')).resolves.toBeDefined();
    } finally {
      await deleteTestUser(user);
    }
  });
});

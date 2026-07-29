import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

import { closePool, queryOne } from '../helpers/db';
import { anonClient, createTestUser, deleteTestUser, type TestUser } from '../helpers/users';

/**
 * Refus complet d'accès à une table.
 *
 * Deux barrières se cumulent sur ces tables (migration 0010) : le privilège
 * SELECT est révoqué, ET une politique de refus explicite est posée. C'est le
 * privilège qui parle en premier : PostgREST renvoie alors une erreur, et non
 * un résultat vide. La distinction compte — un tableau vide pourrait aussi
 * signifier « table vide », ce qui ne prouverait rien.
 */
async function attendreRefus(client: SupabaseClient, table: string): Promise<void> {
  const { data, error } = await client.from(table).select('*');

  expect(error, `${table} devrait être inaccessible au client`).not.toBeNull();
  expect(data, `${table} ne doit renvoyer aucune ligne`).toBeNull();
}

/**
 * Isolation entre utilisateurs.
 *
 * CLAUDE.md : « pour chaque table, un test qui vérifie qu'un utilisateur A ne
 * peut pas lire ou modifier les données d'un utilisateur B. »
 *
 * Ces tests passent obligatoirement par un client Supabase porteur du jeton de
 * l'utilisateur. Une vérification faite avec la connexion `postgres`, qui est
 * au-dessus de RLS, ne prouverait rien.
 */
let alice: TestUser;
let bob: TestUser;
let livreId: string;

beforeAll(async () => {
  alice = await createTestUser();
  bob = await createTestUser();
  const livre = await queryOne<{ id: string }>(
    `select id from public.books where slug = 'le-lion-et-la-souris'`,
  );
  if (!livre) throw new Error('Jeu de démonstration absent : lancer npm run db:reset.');
  livreId = livre.id;
});

afterAll(async () => {
  await deleteTestUser(alice);
  await deleteTestUser(bob);
  await closePool();
});

describe('users', () => {
  it('laisse chacun lire son propre profil', async () => {
    const { data } = await alice.client.from('users').select('id, email').eq('id', alice.id);

    expect(data).toHaveLength(1);
    expect(data?.[0]?.email).toBe(alice.email);
  });

  it('empêche A de lire le profil de B', async () => {
    const { data } = await alice.client.from('users').select('id, email').eq('id', bob.id);

    expect(data).toEqual([]);
  });

  it('empêche un utilisateur de se promouvoir administrateur', async () => {
    // Une politique RLS agit sur les lignes, pas sur les colonnes : c'est le
    // privilège UPDATE, restreint à deux colonnes, qui porte cette garantie.
    const { error } = await alice.client.from('users').update({ role: 'admin' }).eq('id', alice.id);

    expect(error).not.toBeNull();

    const apres = await queryOne<{ role: string }>(`select role::text from public.users where id = $1`, [
      alice.id,
    ]);
    expect(apres?.role).toBe('user');
  });

  it('empêche un utilisateur de lever sa propre suspension', async () => {
    const { error } = await alice.client.from('users').update({ statut: 'actif' }).eq('id', alice.id);

    expect(error).not.toBeNull();
  });

  it('autorise la modification de son nom et de sa langue', async () => {
    const { error } = await alice.client
      .from('users')
      .update({ nom_complet: 'Alice Parent', langue_preferee: 'en' })
      .eq('id', alice.id);

    expect(error).toBeNull();
  });
});

describe('catalogue', () => {
  it('montre au visiteur les titres publiés, et eux seuls', async () => {
    const { data } = await anonClient().from('books').select('slug, statut');

    expect(data).not.toBeNull();
    const livres = data ?? [];
    expect(livres.every((b) => b.statut === 'publie')).toBe(true);
    expect(livres.map((b) => b.slug)).not.toContain('le-lievre-et-la-tortue');
    expect(livres.map((b) => b.slug)).not.toContain('la-hyene-qui-voulait-changer');
  });

  it('masque une traduction en brouillon, même si le livre est publié', async () => {
    // docs/PLAN.md D2 point 4.
    const { data } = await anonClient()
      .from('book_translations')
      .select('langue, statut, books!inner(slug)')
      .eq('books.slug', 'la-girafe-et-l-oiseau-malin');

    expect(data?.map((t) => t.langue)).toEqual(['fr']);
  });

  it('empêche un utilisateur de modifier le catalogue', async () => {
    const { error } = await alice.client
      .from('books')
      .update({ gratuit: true })
      .eq('id', livreId);

    expect(error).not.toBeNull();
  });

  it('n’expose jamais les pages d’un livre en accès direct', async () => {
    // Le contenu passe par une route serveur qui vérifie les droits puis émet
    // une URL signée (CLAUDE.md règle 3).
    await attendreRefus(alice.client, 'book_pages');
  });
});

describe('panier', () => {
  it('empêche B de lire le panier de A', async () => {
    const cree = await alice.client.from('carts').insert({ user_id: alice.id }).select('id').single();
    expect(cree.error).toBeNull();

    const vuParBob = await bob.client.from('carts').select('id');
    expect(vuParBob.data).toEqual([]);

    const vuParAlice = await alice.client.from('carts').select('id');
    expect(vuParAlice.data).toHaveLength(1);
  });

  it('empêche B d’ajouter un article au panier de A', async () => {
    const panier = await queryOne<{ id: string }>(
      `select id from public.carts where user_id = $1`,
      [alice.id],
    );
    // Sans ce préalable, un panier absent ferait passer le test pour une
    // mauvaise raison : l'insertion échouerait faute de cible, pas faute de
    // droits.
    expect(panier).toBeDefined();

    const { error } = await bob.client
      .from('cart_items')
      .insert({ cart_id: panier?.id ?? '', book_id: livreId, langue: 'fr' });

    expect(error).not.toBeNull();
  });
});

describe('commandes', () => {
  it('empêche B de lire la commande de A', async () => {
    const commande = await queryOne<{ id: string }>(
      `insert into public.orders (user_id, montant_total, devise, zone)
       values ($1, 499, 'EUR', 'international') returning id`,
      [alice.id],
    );

    const vuParAlice = await alice.client.from('orders').select('id').eq('id', commande?.id ?? '');
    expect(vuParAlice.data).toHaveLength(1);

    const vuParBob = await bob.client.from('orders').select('id').eq('id', commande?.id ?? '');
    expect(vuParBob.data).toEqual([]);
  });

  it('empêche un utilisateur de créer une commande lui-même', async () => {
    // Structurant : une commande est créée par le serveur, qui relit les prix
    // en base. Sans cela, le client soumettrait son propre montant.
    const { error } = await alice.client
      .from('orders')
      .insert({ user_id: alice.id, montant_total: 1, devise: 'EUR', zone: 'international' });

    expect(error).not.toBeNull();
  });

  it('empêche un utilisateur de passer sa commande au statut payé', async () => {
    const { error } = await alice.client.from('orders').update({ statut: 'paye' }).eq('user_id', alice.id);

    expect(error).not.toBeNull();
  });
});

describe('droits d’accès', () => {
  it('empêche un utilisateur de s’octroyer un droit', async () => {
    // Le test le plus important du lot : sans cette barrière, tout le modèle
    // économique s'effondre.
    const { error } = await alice.client
      .from('entitlements')
      .insert({ user_id: alice.id, book_id: livreId, type: 'offert', peut_telecharger: true });

    expect(error).not.toBeNull();
  });

  it('empêche B de lire les droits de A', async () => {
    await queryOne(
      `insert into public.entitlements (user_id, book_id, type, peut_telecharger)
       values ($1, $2, 'offert', false) returning id`,
      [alice.id, livreId],
    );

    const vuParAlice = await alice.client.from('entitlements').select('id');
    expect(vuParAlice.data).toHaveLength(1);

    const vuParBob = await bob.client.from('entitlements').select('id');
    expect(vuParBob.data).toEqual([]);
  });

  it('empêche un utilisateur de s’accorder le téléchargement sur un droit existant', async () => {
    const { error } = await alice.client
      .from('entitlements')
      .update({ peut_telecharger: true })
      .eq('user_id', alice.id);

    expect(error).not.toBeNull();
  });
});

describe('abonnements', () => {
  it('empêche B de lire l’abonnement de A', async () => {
    await queryOne(
      `insert into public.subscriptions
         (user_id, offre, statut, debut_periode, fin_periode, zone, devise, montant)
       values ($1, 'mensuel', 'actif', now(), now() + interval '30 days', 'international', 'EUR', 799)
       returning id`,
      [alice.id],
    );

    expect((await alice.client.from('subscriptions').select('id')).data).toHaveLength(1);
    expect((await bob.client.from('subscriptions').select('id')).data).toEqual([]);
  });

  it('empêche un utilisateur de prolonger son abonnement', async () => {
    const { error } = await alice.client
      .from('subscriptions')
      .update({ fin_periode: '2099-01-01T00:00:00Z' })
      .eq('user_id', alice.id);

    expect(error).not.toBeNull();
  });
});

describe('progression de lecture', () => {
  it('laisse chacun écrire la sienne', async () => {
    const { error } = await alice.client
      .from('reading_progress')
      .insert({ user_id: alice.id, book_id: livreId, langue: 'fr', derniere_page: 4 });

    expect(error).toBeNull();
  });

  it('empêche B de lire ou d’écrire celle de A', async () => {
    expect((await bob.client.from('reading_progress').select('*')).data).toEqual([]);

    const ecriture = await bob.client
      .from('reading_progress')
      .update({ derniere_page: 99 })
      .eq('user_id', alice.id);
    expect(ecriture.data).toBeNull();

    const apres = await queryOne<{ derniere_page: number }>(
      `select derniere_page from public.reading_progress where user_id = $1`,
      [alice.id],
    );
    expect(apres?.derniere_page).toBe(4);
  });

  it('empêche d’écrire une progression au nom d’un autre', async () => {
    const { error } = await bob.client
      .from('reading_progress')
      .insert({ user_id: alice.id, book_id: livreId, langue: 'fr', derniere_page: 1 });

    expect(error).not.toBeNull();
  });
});

describe('journal des téléchargements', () => {
  it('empêche B de lire les téléchargements de A', async () => {
    await queryOne(
      `insert into public.download_logs (user_id, book_id, langue, format)
       values ($1, $2, 'fr', 'pdf') returning id`,
      [alice.id, livreId],
    );

    expect((await alice.client.from('download_logs').select('id')).data).toHaveLength(1);
    expect((await bob.client.from('download_logs').select('id')).data).toEqual([]);
  });
});

describe('tables réservées au serveur', () => {
  it('n’expose ni les codes promotionnels, ni les webhooks, ni les emails', async () => {
    // Les codes promotionnels sont validés côté serveur : les exposer
    // livrerait la liste des codes actifs à n'importe quel visiteur.
    for (const table of ['promo_codes', 'webhook_events', 'payment_events', 'email_log', 'ingestion_jobs']) {
      await attendreRefus(alice.client, table);
    }
  });

  it('n’expose pas l’artefact d’activation de l’horloge simulée', async () => {
    // Sa seule lecture indiquerait qu'une base honore le décalage d'horloge.
    await attendreRefus(anonClient(), 'dev_clock_activation');
  });
});

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { GET as detailCommande } from '@/app/api/orders/[id]/route';
import { GET as listerCommandes, POST as commander } from '@/app/api/orders/route';
import { GET as lirePanier, POST as ajouter } from '@/app/api/cart/route';
import { DELETE as retirer } from '@/app/api/cart/items/[bookId]/route';

import { closePool, query, queryOne } from '../helpers/db';
import { corpsJson, get, postJson } from '../helpers/http';
import { anonClient, createTestUser, deleteTestUser, type TestUser } from '../helpers/users';

/**
 * Cloisonnement entre utilisateurs — panier et commandes.
 *
 * CLAUDE.md, stratégie de test : « pour chaque table, un test qui vérifie qu'un
 * utilisateur A ne peut pas lire ou modifier les données d'un utilisateur B ».
 *
 * Les deux barrières sont éprouvées séparément :
 *   * les POLITIQUES RLS, avec un vrai client soumis à RLS ;
 *   * les ROUTES, qui ne doivent jamais servir la donnée d'autrui même si une
 *     politique venait à être relâchée.
 */
let alice: TestUser;
let bob: TestUser;
let commandeDAlice: string;
let livreId: string;

beforeAll(async () => {
  alice = await createTestUser();
  bob = await createTestUser();

  const livre = await queryOne<{ id: string }>(
    `select id from public.books where slug = 'la-tortue-et-le-lapin'`,
  );
  livreId = livre!.id;

  await ajouter(postJson('/api/cart', { book_id: livreId }, { jeton: alice.accessToken }));
  const corps = await corpsJson<{ commande_id: string }>(
    await commander(postJson('/api/orders', {}, { jeton: alice.accessToken })),
  );
  commandeDAlice = corps.commande_id;
});

afterAll(async () => {
  await deleteTestUser(alice);
  await deleteTestUser(bob);
  await closePool();
});

describe('commandes — politiques RLS', () => {
  it('B ne lit pas la commande de A', async () => {
    const { data } = await bob.client.from('orders').select('id').eq('id', commandeDAlice);

    expect(data ?? []).toHaveLength(0);
  });

  it('A lit bien la sienne — sinon ce test ne prouverait rien', async () => {
    const { data } = await alice.client.from('orders').select('id').eq('id', commandeDAlice);

    expect(data).toHaveLength(1);
  });

  it('B ne lit pas les lignes de la commande de A', async () => {
    // Les lignes portent ce qui a été acheté : les laisser fuir révélerait les
    // lectures d'autrui.
    const { data } = await bob.client
      .from('order_items')
      .select('book_id')
      .eq('order_id', commandeDAlice);

    expect(data ?? []).toHaveLength(0);
  });

  it('personne n’écrit dans `orders`, pas même pour soi', async () => {
    // Aucun privilège d'écriture n'est accordé : une commande est créée par le
    // serveur, qui relit les prix. Sans cela, le montant serait soumis par le
    // client.
    const { error } = await alice.client
      .from('orders')
      .insert({ user_id: alice.id, montant_total: 1, devise: 'EUR', zone: 'international' });

    expect(error).not.toBeNull();
  });

  it('personne ne modifie le montant d’une commande existante', async () => {
    const { error } = await alice.client
      .from('orders')
      .update({ montant_total: 1 })
      .eq('id', commandeDAlice);

    expect(error).not.toBeNull();

    const enBase = await queryOne<{ montant_total: string }>(
      `select montant_total::text from public.orders where id = $1`,
      [commandeDAlice],
    );
    expect(enBase?.montant_total).toBe('499');
  });

  it('personne ne fait passer sa commande en `paye`', async () => {
    // Le cœur de la règle 5 : l'octroi d'un droit ne vient jamais du client.
    const { error } = await alice.client
      .from('orders')
      .update({ statut: 'paye' })
      .eq('id', commandeDAlice);

    expect(error).not.toBeNull();

    const enBase = await queryOne<{ statut: string }>(
      `select statut from public.orders where id = $1`,
      [commandeDAlice],
    );
    expect(enBase?.statut).toBe('en_attente');
  });
});

describe('codes promotionnels — jamais exposés', () => {
  it('ne sont lisibles par aucun client', async () => {
    // Sans ce refus, la liste des codes actifs serait lisible par n'importe qui.
    const { data } = await alice.client.from('promo_codes').select('code');

    expect(data ?? []).toHaveLength(0);
  });

  it('ne sont pas lisibles par un visiteur non connecté non plus', async () => {
    const { data } = await anonClient().from('promo_codes').select('code, valeur');

    expect(data ?? []).toHaveLength(0);
  });

  it('ne sont pas modifiables par un client', async () => {
    // Relever `usage_max` ou réactiver un code expiré serait une remise offerte.
    const { error } = await alice.client
      .from('promo_codes')
      .update({ actif: true })
      .eq('code', 'EXPIRE');

    expect(error).not.toBeNull();
  });
});

describe('panier — cloisonnement', () => {
  it('B ne lit pas le panier de A', async () => {
    await ajouter(postJson('/api/cart', { book_id: livreId }, { jeton: alice.accessToken }));

    const { data } = await bob.client.from('cart_items').select('book_id');

    expect(data ?? []).toHaveLength(0);
  });

  it('B ne s’ajoute pas au panier de A', async () => {
    const panierDAlice = await queryOne<{ id: string }>(
      `select id from public.carts where user_id = $1`,
      [alice.id],
    );

    const { error } = await bob.client
      .from('cart_items')
      .insert({ cart_id: panierDAlice!.id, book_id: livreId, langue: 'fr' });

    expect(error).not.toBeNull();
  });

  it('B ne vide pas le panier de A par la route', async () => {
    // La route agit sur le panier de l'APPELANT : aucun identifiant de panier
    // ne circule, donc celui d'autrui n'est pas atteignable.
    await ajouter(postJson('/api/cart', { book_id: livreId }, { jeton: alice.accessToken }));

    await retirer(
      new Request(`http://localhost:3000/api/cart/items/${livreId}`, {
        method: 'DELETE',
        headers: { authorization: `Bearer ${bob.accessToken}` },
      }),
      { params: Promise.resolve({ bookId: livreId }) },
    );

    const corps = await corpsJson<{ lignes: unknown[] }>(
      await lirePanier(get('/api/cart', { jeton: alice.accessToken })),
    );
    expect(corps.lignes).toHaveLength(1);
  });
});

describe('routes — cloisonnement', () => {
  it('rend 404 sur la commande d’autrui, jamais 403', async () => {
    // Un 403 confirmerait que la commande existe : en sondant des
    // identifiants, on apprendrait le rythme des ventes de la boutique.
    const reponse = await detailCommande(
      get(`/api/orders/${commandeDAlice}`, { jeton: bob.accessToken }),
      { params: Promise.resolve({ id: commandeDAlice }) },
    );

    expect(reponse.status).toBe(404);
  });

  it('rend le même 404 sur un identifiant inconnu', async () => {
    const inconnu = '00000000-0000-4000-8000-000000000000';
    const reponse = await detailCommande(get(`/api/orders/${inconnu}`, { jeton: bob.accessToken }), {
      params: Promise.resolve({ id: inconnu }),
    });

    expect(reponse.status).toBe(404);
  });

  it('n’inclut aucune commande d’autrui dans l’historique', async () => {
    const corps = await corpsJson<{ commandes: { id: string }[] }>(
      await listerCommandes(get('/api/orders', { jeton: bob.accessToken })),
    );

    expect(corps.commandes.map((c) => c.id)).not.toContain(commandeDAlice);
  });

  it('refuse un visiteur non connecté sur toutes les routes', async () => {
    const sansJeton = [
      await lirePanier(get('/api/cart')),
      await listerCommandes(get('/api/orders')),
      await commander(postJson('/api/orders', {})),
    ];

    for (const reponse of sansJeton) {
      expect(reponse.status).toBe(401);
    }
  });
});

describe('la commande d’un titre déjà possédé', () => {
  it('est refusée à l’ajout au panier', async () => {
    // Revendre un titre déjà acheté est un débit indu : le droit est perpétuel.
    // Type `offert` : un octroi manuel d'administrateur. La contrainte
    // `entitlements_achat_a_une_source` impose une commande d'origine à un
    // `achat`, et le refus au panier ne regarde pas le type — il regarde si le
    // droit EXISTE. Le cas couvert est donc le même, sans fabriquer une
    // commande de circonstance.
    await query(
      `insert into public.entitlements (user_id, book_id, type, peut_telecharger)
       values ($1, $2, 'offert', true)
       on conflict do nothing`,
      [bob.id, livreId],
    );

    try {
      const reponse = await ajouter(
        postJson('/api/cart', { book_id: livreId }, { jeton: bob.accessToken }),
      );

      expect(reponse.status).toBe(409);
    } finally {
      await query(`delete from public.entitlements where user_id = $1`, [bob.id]);
    }
  });
});

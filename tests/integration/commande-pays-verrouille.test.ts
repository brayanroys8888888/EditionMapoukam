import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { NotchPayPaymentProvider } from '@/adapters/payment/notchpay/notchpay-payment-provider';
import type * as Registre from '@/adapters/registry';

import { closePool, queryOne } from '../helpers/db';
import { corpsJson, postJson } from '../helpers/http';
import { createTestUser, deleteTestUser, type TestUser } from '../helpers/users';

/**
 * ╔═══════════════════════════════════════════════════════════════════════════╗
 * ║ LE PAYS DÉCLARÉ, ET LE VERROU QUI LE REND OPPOSABLE.                      ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 *
 * Décision du propriétaire du 25 septembre 2026. Notch Pay ne révèle le pays
 * du moyen de paiement qu'APRÈS le règlement : le client le déclare donc au
 * récapitulatif (prérempli depuis son adresse IP), la zone s'en déduit, et le
 * paiement est ouvert verrouillé sur ce pays (`locked_country`).
 *
 * Ce fichier branche un VRAI adaptateur Notch Pay, dont seul le transport est
 * remplacé : ce qui est éprouvé, c'est le chemin complet — route de commande,
 * `create_order` en base, route de paiement, corps envoyé au prestataire.
 *
 * Le trou que ces tests ferment : un pays qui voyagerait dans la requête de
 * PAIEMENT plutôt que sur la commande. On créerait une commande à 1 500 FCFA
 * en se déclarant camerounais, puis on ouvrirait son paiement « en France ».
 */

const envois: Record<string, unknown>[] = [];

const notchPay = new NotchPayPaymentProvider({
  clePublique: 'pk_test_integration',
  clePrivee: 'sk_test_integration',
  cleHachage: 'hsk_test_integration',
  urlApplication: 'http://localhost:3000',
  transport: (_url, init) => {
    if (typeof init.body !== 'string') throw new TypeError('Corps envoyé non JSON.');
    envois.push(JSON.parse(init.body) as Record<string, unknown>);
    return Promise.resolve(
      new Response(
        JSON.stringify({ transaction: 'trx_test', authorization_url: 'https://pay.test/trx' }),
        { status: 201, headers: { 'content-type': 'application/json' } },
      ),
    );
  },
});

vi.mock('@/adapters/registry', async (importOriginal) => ({
  ...(await importOriginal<typeof Registre>()),
  getPaymentProvider: () => notchPay,
}));

// Importés APRÈS le remplacement du registre, qu'ils lisent à chaque appel.
const { POST: ajouter, DELETE: vider } = await import('@/app/api/cart/route');
const { POST: commander, PUT: apercuCommande } = await import('@/app/api/orders/route');
const { POST: payer } = await import('@/app/api/checkout/route');

let acheteur: TestUser;
let livre: string;

interface CorpsCommande {
  commande_id: string;
  total: number;
  devise: string;
  zone: string;
  pays_paiement: string | null;
}

async function remplirPanier(): Promise<void> {
  await ajouter(
    postJson('/api/cart', { book_id: livre, langue: 'fr' }, { jeton: acheteur.accessToken }),
  );
}

async function paysEcrit(commandeId: string): Promise<string | null> {
  const ligne = await queryOne<{ pays_paiement: string | null }>(
    `select pays_paiement from public.orders where id = $1`,
    [commandeId],
  );
  return ligne?.pays_paiement ?? null;
}

beforeAll(async () => {
  acheteur = await createTestUser();
  const ligne = await queryOne<{ id: string }>(
    `select id from public.books where slug = 'le-lion-et-la-souris'`,
  );
  if (!ligne) throw new Error('Titre absent du jeu de démonstration : le-lion-et-la-souris');
  livre = ligne.id;
});

beforeEach(async () => {
  envois.length = 0;
  await vider(
    new Request('http://localhost:3000/api/cart', {
      method: 'DELETE',
      headers: { authorization: `Bearer ${acheteur.accessToken}` },
    }),
  );
});

afterAll(async () => {
  await deleteTestUser(acheteur);
  await closePool();
});

describe('un client qui se déclare camerounais', () => {
  it('paie la grille Afrique, et son paiement est VERROUILLÉ sur le Cameroun', async () => {
    await remplirPanier();

    const commande = await corpsJson<CorpsCommande>(
      await commander(
        postJson(
          '/api/orders',
          { zone_affichee: 'afrique', pays_paiement: 'CM' },
          { jeton: acheteur.accessToken },
        ),
      ),
    );

    expect(commande.zone).toBe('afrique');
    expect(commande.total).toBe(1500);
    expect(commande.devise).toBe('XAF');
    // Écrit AVEC le montant, dans la même transaction.
    expect(await paysEcrit(commande.commande_id)).toBe('CM');

    const reponse = await payer(
      postJson(
        '/api/checkout',
        { commande_id: commande.commande_id },
        { jeton: acheteur.accessToken },
      ),
    );
    expect(reponse.status).toBe(200);

    expect(envois).toHaveLength(1);
    expect(envois[0]).toMatchObject({
      amount: 1500,
      currency: 'XAF',
      locked_country: 'CM',
    });
  });

  it('IGNORE un pays glissé dans la requête de paiement : seul compte celui de la commande', async () => {
    await remplirPanier();

    const commande = await corpsJson<CorpsCommande>(
      await commander(
        postJson(
          '/api/orders',
          { zone_affichee: 'afrique', pays_paiement: 'CM' },
          { jeton: acheteur.accessToken },
        ),
      ),
    );

    await payer(
      postJson(
        '/api/checkout',
        { commande_id: commande.commande_id, pays_paiement: 'FR', locked_country: 'FR' },
        { jeton: acheteur.accessToken },
      ),
    );

    expect(envois[0]?.['locked_country']).toBe('CM');
  });
});

describe('le pays par défaut — celui de l’adresse IP', () => {
  it('sert la grille Afrique à un visiteur situé au Cameroun, sans qu’il ait rien choisi', async () => {
    await remplirPanier();

    const vue = await corpsJson<CorpsCommande>(
      await apercuCommande(
        postJson(
          '/api/orders',
          {},
          { jeton: acheteur.accessToken, headers: { 'x-vercel-ip-country': 'CM' } },
        ),
      ),
    );

    expect(vue.zone).toBe('afrique');
    expect(vue.pays_paiement).toBe('CM');
  });

  it('« Autre pays » l’emporte sur l’adresse IP : grille internationale, aucun verrou', async () => {
    await remplirPanier();

    const commande = await corpsJson<CorpsCommande>(
      await commander(
        postJson(
          '/api/orders',
          { zone_affichee: 'international', pays_paiement: '' },
          { jeton: acheteur.accessToken, headers: { 'x-vercel-ip-country': 'CM' } },
        ),
      ),
    );

    expect(commande.zone).toBe('international');
    expect(commande.devise).toBe('EUR');
    expect(await paysEcrit(commande.commande_id)).toBeNull();
  });

  it('un pays inconnu ou illisible retombe sur la grille la plus chère', async () => {
    await remplirPanier();

    const vue = await corpsJson<CorpsCommande>(
      await apercuCommande(
        postJson(
          '/api/orders',
          { pays_paiement: 'XX' },
          { jeton: acheteur.accessToken },
        ),
      ),
    );

    expect(vue.zone).toBe('international');
    expect(vue.pays_paiement).toBeNull();
  });
});

describe('un client qui se déclare français', () => {
  it('paie la grille internationale, et son paiement n’est verrouillé sur AUCUN pays', async () => {
    await remplirPanier();

    const commande = await corpsJson<CorpsCommande>(
      await commander(
        postJson(
          '/api/orders',
          { zone_affichee: 'international', pays_paiement: 'FR' },
          { jeton: acheteur.accessToken },
        ),
      ),
    );

    expect(commande.zone).toBe('international');
    // Verrouiller la France refuserait la carte belge d'un client français,
    // sans empêcher aucun abus : la grille internationale est la plus chère.
    expect(await paysEcrit(commande.commande_id)).toBeNull();

    await payer(
      postJson(
        '/api/checkout',
        { commande_id: commande.commande_id },
        { jeton: acheteur.accessToken },
      ),
    );
    expect(envois[0]).not.toHaveProperty('locked_country');
  });
});

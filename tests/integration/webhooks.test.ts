import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';

import { POST as webhook } from '@/app/api/webhooks/payments/route';
import { POST as checkout } from '@/app/api/checkout/route';
import { POST as ajouter } from '@/app/api/cart/route';
import { POST as commander } from '@/app/api/orders/route';
import { FakePaymentProvider } from '@/adapters/payment/fake/fake-payment-provider';
import { SIGNATURE_HEADER, signerCharge } from '@/lib/crypto/webhook-signature';
import { getAccess } from '@/lib/access/engine';

import { closePool, query, queryOne } from '../helpers/db';
import { corpsJson, postJson } from '../helpers/http';
import { createTestUser, deleteTestUser, serviceClient, type TestUser } from '../helpers/users';

/**
 * Gestionnaire de webhooks — §9.1, CLAUDE.md règle 5.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ « Les webhooks sont la seule source de vérité sur l'état d'un paiement.  │
 * │   Une redirection de navigateur ne déclenche jamais l'octroi d'un droit. │
 * │   Signature vérifiée systématiquement, traitement idempotent. Cette      │
 * │   règle s'applique aussi au faux prestataire. »                         │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Le faux prestataire émet de VRAIS événements signés vers ce vrai
 * gestionnaire : ce qui est éprouvé ici est le code de production, pas une
 * imitation.
 */
let acheteur: TestUser;
let livreId: string;
let secret: string;

/** Passe une commande et rend son identifiant. */
async function commandeEnAttente(): Promise<string> {
  await ajouter(postJson('/api/cart', { book_id: livreId }, { jeton: acheteur.accessToken }));
  const corps = await corpsJson<{ commande_id: string }>(
    await commander(postJson('/api/orders', {}, { jeton: acheteur.accessToken })),
  );
  return corps.commande_id;
}

/** Construit une requête de webhook signée, comme le ferait le prestataire. */
function requeteSignee(
  charge: unknown,
  options: { secret?: string; instant?: Date; entete?: string | null } = {},
): Request {
  // Le corps est sérialisé UNE fois : c'est cette chaîne exacte qui est signée
  // puis transmise. Re-sérialiser après signature invaliderait la signature.
  const corpsBrut = JSON.stringify(charge);
  const entete =
    options.entete !== undefined
      ? options.entete
      : signerCharge(corpsBrut, options.secret ?? secret, options.instant ?? new Date());

  const headers = new Headers({ 'content-type': 'application/json' });
  if (entete !== null) headers.set(SIGNATURE_HEADER, entete);

  return new Request('http://localhost:3000/api/webhooks/payments', {
    method: 'POST',
    headers,
    body: corpsBrut,
  });
}

function evenement(
  type: string,
  donnees: Record<string, unknown>,
  id = `evt_${randomUUID()}`,
): Record<string, unknown> {
  return { id, type, survenuLe: new Date().toISOString(), donnees };
}

beforeAll(async () => {
  const cle = process.env['FAKE_WEBHOOK_SECRET'];
  if (!cle) throw new Error('FAKE_WEBHOOK_SECRET absent : .env.local n’a pas été chargé.');
  secret = cle;

  acheteur = await createTestUser();

  const livre = await queryOne<{ id: string }>(
    `select id from public.books where slug = 'la-tortue-et-le-lapin'`,
  );
  livreId = livre!.id;
});

beforeEach(async () => {
  // Les droits sont effacés entre les tests : sans cela, l'ajout au panier
  // serait refusé au second test pour « titre déjà possédé ».
  await query(`delete from public.entitlements where user_id = $1`, [acheteur.id]);
  await query(`delete from public.cart_items where cart_id in (select id from public.carts where user_id = $1)`, [acheteur.id]);
});

afterAll(async () => {
  await deleteTestUser(acheteur);
  await closePool();
});

describe('signature', () => {
  it('rejette un événement sans en-tête, et n’octroie rien', async () => {
    const orderId = await commandeEnAttente();

    const reponse = await webhook(
      requeteSignee(evenement('paiement.reussi', { orderId }), { entete: null }),
    );

    expect(reponse.status).toBe(400);
    const droits = await query(`select 1 from public.entitlements where user_id = $1`, [
      acheteur.id,
    ]);
    expect(droits).toHaveLength(0);
  });

  it('rejette une signature calculée avec une autre clé', async () => {
    const orderId = await commandeEnAttente();

    const reponse = await webhook(
      requeteSignee(evenement('paiement.reussi', { orderId }), { secret: 'mauvaise-cle-secrete' }),
    );

    expect(reponse.status).toBe(400);
    const commande = await queryOne<{ statut: string }>(
      `select statut from public.orders where id = $1`,
      [orderId],
    );
    expect(commande?.statut).toBe('en_attente');
  });

  it('rejette un corps altéré APRÈS signature', async () => {
    // L'attaque évidente : intercepter un événement légitime et en changer le
    // montant ou la commande. La signature porte sur les octets, elle ne suit
    // pas la modification.
    const orderId = await commandeEnAttente();
    const charge = evenement('paiement.reussi', { orderId });
    const corpsLegitime = JSON.stringify(charge);
    const entete = signerCharge(corpsLegitime, secret, new Date());

    const corpsAltere = corpsLegitime.replace(orderId, randomUUID());

    const reponse = await webhook(
      new Request('http://localhost:3000/api/webhooks/payments', {
        method: 'POST',
        headers: { 'content-type': 'application/json', [SIGNATURE_HEADER]: entete },
        body: corpsAltere,
      }),
    );

    expect(reponse.status).toBe(400);
  });

  it('rejette un horodatage hors tolérance', async () => {
    // Sans cette borne, une signature valide interceptée resterait rejouable
    // indéfiniment.
    const orderId = await commandeEnAttente();
    const vieux = new Date(Date.now() - 3600_000);

    const reponse = await webhook(
      requeteSignee(evenement('paiement.reussi', { orderId }), { instant: vieux }),
    );

    expect(reponse.status).toBe(400);
  });

  it('rejette un en-tête malformé', async () => {
    const orderId = await commandeEnAttente();

    const reponse = await webhook(
      // ASCII pur : un en-tête HTTP ne peut pas porter de caractère au-delà de
      // 255, et le constructeur `Headers` refuserait la chaîne avant même que
      // la route ne la voie.
      requeteSignee(evenement('paiement.reussi', { orderId }), { entete: 't=abc,v1=zzz' }),
    );

    expect(reponse.status).toBe(400);
  });

  it('journalise le rejet — une signature invalide répétée est un signal', async () => {
    const orderId = await commandeEnAttente();
    await webhook(requeteSignee(evenement('paiement.reussi', { orderId }), { secret: 'fausse' }));

    const traces = await query<{ signature_valide: boolean }>(
      `select signature_valide from public.webhook_events where signature_valide = false`,
    );
    expect(traces.length).toBeGreaterThan(0);
  });

  it('ne laisse pas un corps non authentifié occuper l’identifiant d’un vrai événement', async () => {
    // Sinon il suffirait d'envoyer une contrefaçon portant l'identifiant d'un
    // événement à venir pour que le vrai soit ensuite rejeté comme un rejeu.
    const orderId = await commandeEnAttente();
    const id = `evt_${randomUUID()}`;

    await webhook(requeteSignee(evenement('paiement.reussi', { orderId }, id), { secret: 'fausse' }));
    const reponse = await webhook(requeteSignee(evenement('paiement.reussi', { orderId }, id)));

    expect(reponse.status).toBe(200);
    const commande = await queryOne<{ statut: string }>(
      `select statut from public.orders where id = $1`,
      [orderId],
    );
    expect(commande?.statut).toBe('paye');
  });
});

describe('paiement réussi', () => {
  it('passe la commande en payé ET crée les droits', async () => {
    const orderId = await commandeEnAttente();

    const reponse = await webhook(
      requeteSignee(evenement('paiement.reussi', { orderId, referencePaiement: 'pay_123' })),
    );

    expect(reponse.status).toBe(200);

    const commande = await queryOne<{ statut: string; paye_le: string | null; reference_paiement: string }>(
      `select statut, paye_le, reference_paiement from public.orders where id = $1`,
      [orderId],
    );
    expect(commande?.statut).toBe('paye');
    expect(commande?.paye_le).not.toBeNull();
    expect(commande?.reference_paiement).toBe('pay_123');

    const droits = await query<{ type: string; peut_telecharger: boolean; source_id: string }>(
      `select type, peut_telecharger, source_id from public.entitlements where user_id = $1`,
      [acheteur.id],
    );
    expect(droits).toHaveLength(1);
    expect(droits[0]?.type).toBe('achat');
    expect(droits[0]?.source_id).toBe(orderId);
  });

  it('accorde le TÉLÉCHARGEMENT — c’est ce qui distingue l’achat de l’abonnement', async () => {
    // §3.2, la règle métier centrale : l'achat donne le téléchargement,
    // l'abonnement ne le donne jamais.
    const orderId = await commandeEnAttente();
    await webhook(requeteSignee(evenement('paiement.reussi', { orderId })));

    const acces = await getAccess(acheteur.id, livreId);

    expect(acces.canRead).toBe(true);
    expect(acces.canDownload).toBe(true);
    expect(acces.reason).toBe('purchase');
  });

  it('décompte le code promotionnel, une seule fois', async () => {
    // À la création de la commande, rien n'est décompté : une commande en
    // attente peut être abandonnée. C'est ici que l'usage est enregistré.
    await ajouter(postJson('/api/cart', { book_id: livreId }, { jeton: acheteur.accessToken }));
    const corps = await corpsJson<{ commande_id: string }>(
      await commander(
        postJson('/api/orders', { code_promo: 'BIENVENUE' }, { jeton: acheteur.accessToken }),
      ),
    );

    const avant = await queryOne<{ usage_count: number }>(
      `select usage_count from public.promo_codes where code = 'BIENVENUE'`,
    );

    const charge = evenement('paiement.reussi', { orderId: corps.commande_id });
    await webhook(requeteSignee(charge));
    await webhook(requeteSignee(charge)); // rejeu

    const apres = await queryOne<{ usage_count: number }>(
      `select usage_count from public.promo_codes where code = 'BIENVENUE'`,
    );
    expect(apres!.usage_count).toBe(avant!.usage_count + 1);

    const rachats = await query(`select 1 from public.promo_redemptions where order_id = $1`, [
      corps.commande_id,
    ]);
    expect(rachats).toHaveLength(1);
  });
});

describe('idempotence', () => {
  it('traite un même événement une seule fois', async () => {
    const orderId = await commandeEnAttente();
    const charge = evenement('paiement.reussi', { orderId });

    const premier = await webhook(requeteSignee(charge));
    const second = await webhook(requeteSignee(charge));

    // Les deux répondent 200 : un prestataire réel réémet tant qu'il n'a pas
    // reçu de succès, et un 500 le ferait boucler.
    expect(premier.status).toBe(200);
    expect(second.status).toBe(200);

    const droits = await query(`select 1 from public.entitlements where user_id = $1`, [
      acheteur.id,
    ]);
    expect(droits).toHaveLength(1);

    const traces = await query(`select 1 from public.webhook_events where event_id = $1`, [
      charge['id'],
    ]);
    expect(traces).toHaveLength(1);
  });

  it('reste idempotent même sous des identifiants d’événement différents', async () => {
    // Deux événements distincts portant la même commande : la déduplication par
    // `event_id` ne joue pas, et c'est le verrou de ligne sur la commande qui
    // tient.
    const orderId = await commandeEnAttente();

    await webhook(requeteSignee(evenement('paiement.reussi', { orderId })));
    const second = await webhook(requeteSignee(evenement('paiement.reussi', { orderId })));

    expect(second.status).toBe(200);
    const droits = await query(`select 1 from public.entitlements where user_id = $1`, [
      acheteur.id,
    ]);
    expect(droits).toHaveLength(1);
  });

  it('DEUX OCTROIS CONCURRENTS : la base tranche, un seul droit subsiste', async () => {
    // docs/PLAN.md D1 point 8 — « la garantie est cherchée au niveau base ».
    // Les deux appels partent ensemble, sans déduplication en amont : c'est le
    // verrou de ligne puis l'index unique de `entitlements` qui décident.
    const orderId = await commandeEnAttente();

    const resultats = await Promise.allSettled([
      serviceClient().rpc('fulfill_order', { p_order_id: orderId } as never),
      serviceClient().rpc('fulfill_order', { p_order_id: orderId } as never),
    ]);

    expect(resultats.every((r) => r.status === 'fulfilled')).toBe(true);

    const droits = await query(`select 1 from public.entitlements where source_id = $1`, [orderId]);
    expect(droits).toHaveLength(1);
  });

  it('ÉCHEC AU MILIEU DE L’OCTROI : rien n’est écrit', async () => {
    // L'atomicité, éprouvée en la faisant échouer. Une commande sans ligne fait
    // lever la fonction APRÈS le passage en `paye` : si les deux écritures
    // n'étaient pas dans la même transaction, la commande resterait payée sans
    // le moindre droit — le client aurait payé et n'aurait rien reçu.
    const orderId = await commandeEnAttente();
    await query(`delete from public.order_items where order_id = $1`, [orderId]);

    const { error } = await serviceClient().rpc('fulfill_order', {
      p_order_id: orderId,
    } as never);

    expect(error).not.toBeNull();

    const commande = await queryOne<{ statut: string; paye_le: string | null }>(
      `select statut, paye_le from public.orders where id = $1`,
      [orderId],
    );
    // Le `update` qui précédait la levée a bien été annulé.
    expect(commande?.statut).toBe('en_attente');
    expect(commande?.paye_le).toBeNull();

    const droits = await query(`select 1 from public.entitlements where source_id = $1`, [orderId]);
    expect(droits).toHaveLength(0);
  });

  it('l’index unique refuse un second droit de même origine', async () => {
    // La dernière ligne de défense, éprouvée seule : même si tout le reste
    // était contourné, la base refuserait le doublon.
    const orderId = await commandeEnAttente();
    await webhook(requeteSignee(evenement('paiement.reussi', { orderId })));

    await expect(
      query(
        `insert into public.entitlements (user_id, book_id, type, source_id, peut_telecharger)
         values ($1, $2, 'achat', $3, true)`,
        [acheteur.id, livreId, orderId],
      ),
    ).rejects.toThrow(/entitlements_unique_origin|duplicate key/i);
  });
});

describe('paiement échoué et abandonné', () => {
  it('marque la commande en échec, sans aucun droit', async () => {
    const orderId = await commandeEnAttente();

    const reponse = await webhook(
      requeteSignee(evenement('paiement.echoue', { orderId, motif: 'carte refusée' })),
    );

    expect(reponse.status).toBe(200);

    const commande = await queryOne<{ statut: string }>(
      `select statut from public.orders where id = $1`,
      [orderId],
    );
    expect(commande?.statut).toBe('echoue');

    const droits = await query(`select 1 from public.entitlements where user_id = $1`, [
      acheteur.id,
    ]);
    expect(droits).toHaveLength(0);
  });

  it('ne défait PAS un paiement déjà encaissé', async () => {
    // Les événements d'un prestataire ne sont pas garantis dans l'ordre. Un
    // échec tardif ne doit pas retirer un contenu déjà payé — cela demande un
    // remboursement explicite.
    const orderId = await commandeEnAttente();
    await webhook(requeteSignee(evenement('paiement.reussi', { orderId })));
    await webhook(requeteSignee(evenement('paiement.echoue', { orderId })));

    const commande = await queryOne<{ statut: string }>(
      `select statut from public.orders where id = $1`,
      [orderId],
    );
    expect(commande?.statut).toBe('paye');

    const droits = await query(`select 1 from public.entitlements where user_id = $1`, [
      acheteur.id,
    ]);
    expect(droits).toHaveLength(1);
  });

  it('traite un abandon comme un échec', async () => {
    const orderId = await commandeEnAttente();
    await webhook(requeteSignee(evenement('paiement.abandonne', { orderId })));

    const commande = await queryOne<{ statut: string }>(
      `select statut from public.orders where id = $1`,
      [orderId],
    );
    expect(commande?.statut).toBe('echoue');
  });
});

describe('remboursement', () => {
  it('retire le droit acquis par cette commande', async () => {
    // §3.2 fait du droit d'accès la contrepartie du paiement : rembourser sans
    // retirer laisserait le contenu accessible gratuitement et à perpétuité.
    const orderId = await commandeEnAttente();
    await webhook(requeteSignee(evenement('paiement.reussi', { orderId })));

    await webhook(requeteSignee(evenement('remboursement.effectue', { orderId })));

    const commande = await queryOne<{ statut: string }>(
      `select statut from public.orders where id = $1`,
      [orderId],
    );
    expect(commande?.statut).toBe('rembourse');

    const acces = await getAccess(acheteur.id, livreId);
    expect(acces.canDownload).toBe(false);
  });

  it('ne touche pas un droit d’une autre origine', async () => {
    // Un octroi manuel d'administrateur sur le même titre ne doit pas
    // disparaître avec le remboursement d'un achat.
    const orderId = await commandeEnAttente();
    await webhook(requeteSignee(evenement('paiement.reussi', { orderId })));

    await query(
      `insert into public.entitlements (user_id, book_id, type, peut_telecharger)
       values ($1, $2, 'offert', true)`,
      [acheteur.id, livreId],
    );

    await webhook(requeteSignee(evenement('remboursement.effectue', { orderId })));

    const restants = await query<{ type: string }>(
      `select type from public.entitlements where user_id = $1`,
      [acheteur.id],
    );
    expect(restants).toHaveLength(1);
    expect(restants[0]?.type).toBe('offert');
  });
});

describe('événements non applicables', () => {
  it('répond 500 sur un événement d’abonnement, pour qu’il soit réémis', async () => {
    // Répondre 200 sur un événement qu'aucun code ne traite ferait cesser les
    // réémissions, et l'abonnement serait perdu en silence. L'étape 10 les
    // traitera.
    const reponse = await webhook(
      requeteSignee(evenement('abonnement.souscrit', { subscriptionId: randomUUID() })),
    );

    expect(reponse.status).toBe(500);
  });

  it('laisse l’événement non traité, pour qu’une réémission le reprenne', async () => {
    const charge = evenement('abonnement.renouvele', { subscriptionId: randomUUID() });
    await webhook(requeteSignee(charge));

    const trace = await queryOne<{ traite_le: string | null; erreur: string | null }>(
      `select traite_le, erreur from public.webhook_events where event_id = $1`,
      [charge['id']],
    );
    expect(trace?.traite_le).toBeNull();
    expect(trace?.erreur).not.toBeNull();
  });

  it('rejette un paiement réussi sans identifiant de commande', async () => {
    const reponse = await webhook(requeteSignee(evenement('paiement.reussi', {})));

    expect(reponse.status).toBe(500);
  });
});

describe('tunnel de paiement', () => {
  it('ouvre une session sans rien octroyer', async () => {
    const orderId = await commandeEnAttente();

    const reponse = await checkout(
      postJson('/api/checkout', { commande_id: orderId }, { jeton: acheteur.accessToken }),
    );

    expect(reponse.status).toBe(200);
    const corps = await corpsJson<{ url: string; statut_commande: string }>(reponse);
    expect(corps.statut_commande).toBe('en_attente');

    // Le point qui compte : ouvrir le tunnel ne crée aucun droit.
    const droits = await query(`select 1 from public.entitlements where user_id = $1`, [
      acheteur.id,
    ]);
    expect(droits).toHaveLength(0);
  });

  it('refuse d’ouvrir un tunnel sur une commande déjà payée', async () => {
    const orderId = await commandeEnAttente();
    await webhook(requeteSignee(evenement('paiement.reussi', { orderId })));

    const reponse = await checkout(
      postJson('/api/checkout', { commande_id: orderId }, { jeton: acheteur.accessToken }),
    );

    expect(reponse.status).toBe(409);
  });

  it('rend 404 sur la commande d’autrui', async () => {
    const autre = await createTestUser();
    try {
      const orderId = await commandeEnAttente();

      const reponse = await checkout(
        postJson('/api/checkout', { commande_id: orderId }, { jeton: autre.accessToken }),
      );

      expect(reponse.status).toBe(404);
    } finally {
      await deleteTestUser(autre);
    }
  });

  it('exige un compte connecté', async () => {
    const reponse = await checkout(postJson('/api/checkout', { commande_id: randomUUID() }));

    expect(reponse.status).toBe(401);
  });
});

describe('le faux prestataire parle au vrai gestionnaire', () => {
  it('émet un événement réellement signé, accepté de bout en bout', async () => {
    // C'est le montage entier qui est vérifié ici : le faux prestataire
    // fabrique, signe et transmet ; le vrai gestionnaire vérifie, journalise et
    // applique. Aucun raccourci.
    const orderId = await commandeEnAttente();

    const provider = new FakePaymentProvider({
      transport: async (_url, init) =>
        await webhook(
          new Request('http://localhost:3000/api/webhooks/payments', {
            method: 'POST',
            headers: init.headers as HeadersInit,
            body: init.body as BodyInit,
          }),
        ),
    });

    const resultat = await provider.declencher('paiement.reussi', { orderId });

    expect(resultat.statut).toBe(200);
    const acces = await getAccess(acheteur.id, livreId);
    expect(acces.canDownload).toBe(true);
  });
});

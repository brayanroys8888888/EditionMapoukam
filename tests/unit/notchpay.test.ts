import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import {
  NotchPayPaymentProvider,
  ENTETE_SIGNATURE_NOTCHPAY,
} from '@/adapters/payment/notchpay/notchpay-payment-provider';

/**
 * ╔═══════════════════════════════════════════════════════════════════════════╗
 * ║ L'ADAPTATEUR NOTCH PAY.                                                   ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 *
 * Aucun appel réseau : le transport est injecté. Ce que ces tests défendent
 * n'est pas « l'API répond » — c'est ce qu'un remaniement casserait sans
 * bruit, et qui coûterait cher :
 *
 *  · la garde sur les clés de PRODUCTION, seule chose qui tienne la consigne
 *    « on ne va utiliser que la version paiement de test » ;
 *  · la clé employée pour vérifier une signature — la clé de hachage, et non
 *    la privée, contresens le plus courant de cette intégration ;
 *  · la traduction des événements, où une erreur ne se voit qu'à la commande
 *    d'un client resté sans ses fichiers.
 */

const CLES = {
  clePublique: 'pk_test_abcdef',
  clePrivee: 'sk_test_abcdef',
  cleHachage: 'hsk_test_secret',
  urlApplication: 'http://localhost:3000',
};

/** Un transport qui note ce qu'on lui demande et rend ce qu'on lui dicte. */
function transportSimule(reponse: { statut?: number; corps?: unknown } = {}) {
  const appels: { url: string; init: RequestInit }[] = [];

  const transport = (url: string, init: RequestInit): Promise<Response> => {
    appels.push({ url, init });
    return Promise.resolve(
      new Response(JSON.stringify(reponse.corps ?? {}), {
        status: reponse.statut ?? 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
  };

  return { appels, transport };
}

/**
 * Le corps JSON réellement envoyé.
 *
 * `RequestInit['body']` accepte des flux et des formulaires : le passer à
 * `String()` donnerait `[object Object]` sur l'un d'eux, et le test
 * comparerait une chaîne inutile. On EXIGE donc une chaîne — ce que
 * l'adaptateur envoie, et ce qu'une signature de webhook suppose.
 */
function corpsEnvoye(appel: { init: RequestInit } | undefined): Record<string, unknown> {
  const brut = appel?.init.body;
  if (typeof brut !== 'string') throw new TypeError('Le corps envoyé n’est pas une chaîne JSON.');
  return JSON.parse(brut) as Record<string, unknown>;
}

function provider(options: Partial<ConstructorParameters<typeof NotchPayPaymentProvider>[0]> = {}) {
  return new NotchPayPaymentProvider({ ...CLES, ...options });
}

describe('les clés', () => {
  it('exige les trois, et les nomme TOUTES d’un coup', () => {
    /*
     * Trois redémarrages pour apprendre trois oublis, c'est deux de trop —
     * et le troisième oubli, celui de la clé de hachage, ne se manifeste
     * qu'au premier webhook, une commande déjà payée.
     */
    expect(() => new NotchPayPaymentProvider({ clePublique: 'pk_test_x' })).toThrow(
      /NOTCHPAY_PRIVATE_KEY, NOTCHPAY_HASH_KEY/,
    );
  });

  it('REFUSE une clé de production tant qu’on ne l’a pas explicitement voulu', () => {
    expect(() =>
      provider({ clePublique: 'pk_live_reelle' }),
    ).toThrow(/NOTCHPAY_PUBLIC_KEY/);
  });

  it('accepte les clés de production quand le drapeau est posé', () => {
    expect(() =>
      provider({ clePublique: 'pk_live_reelle', autoriserProduction: true }),
    ).not.toThrow();
  });

  /**
   * ┌────────────────────────────────────────────────────────────────────────┐
   * │ LE FORMAT RÉEL DE NOTCH PAY : UN POINT, PAS UN TIRET BAS.             │
   * │                                                                        │
   * │ Les clés du tableau de bord s'écrivent `pk_test.xxx`. Le contrôle      │
   * │ cherchait `test_` et les prenait donc pour des clés de production :    │
   * │ l'adaptateur refusait de se construire, et le panier devenait          │
   * │ illisible — 500 sur `PUT /api/orders`, sans que rien ne parle de       │
   * │ paiement.                                                              │
   * │                                                                        │
   * │ Les deux écritures doivent passer : celle du tableau de bord, et       │
   * │ celle des exemples de la documentation.                                │
   * └────────────────────────────────────────────────────────────────────────┘
   */
  it('accepte les clés de test dans les DEUX écritures — point et tiret bas', () => {
    for (const separateur of ['.', '_']) {
      expect(
        () =>
          provider({
            clePublique: `pk_test${separateur}abc`,
            clePrivee: `sk_test${separateur}abc`,
            cleHachage: `hsk_test${separateur}abc`,
          }),
        `pk_test${separateur}… refusée`,
      ).not.toThrow();
    }
  });

  /**
   * Le contre-test du précédent : élargir le contrôle ne doit pas l'avoir
   * rendu permissif. `includes('test_')` acceptait ces clés de PRODUCTION —
   * les six caractères y figurent, au milieu du secret.
   */
  it('ne prend PAS une clé de production pour une clé de test', () => {
    for (const piege of ['sk_live.mon_latest_secret', 'pk_live_protest_abc']) {
      expect(() => provider({ clePublique: piege }), `${piege} acceptée à tort`).toThrow(
        /NOTCHPAY_PUBLIC_KEY/,
      );
    }
  });

  it('se déclare NON simulé — c’est ce qui retire la console de l’écran', () => {
    expect(provider().simule).toBe(false);
    expect(provider().enteteSignature).toBe('x-notch-signature');
  });
});

describe('l’ouverture d’un paiement', () => {
  it('porte l’identifiant de commande en `reference`, et verrouille la devise', async () => {
    const { appels, transport } = transportSimule({
      statut: 201,
      corps: { transaction: 'trx_1', authorization_url: 'https://pay.notchpay.co/trx_1' },
    });

    const session = await provider({ transport }).ouvrirCheckout({
      orderId: 'cmd-42',
      montant: { montant: 1697, devise: 'XAF' },
      zone: 'afrique',
      client: { userId: 'u1', email: 'parent@example.test' },
      urlRetourSucces: 'http://localhost:3000/fr/paiement/cmd-42',
      urlRetourAbandon: 'http://localhost:3000/fr/panier',
    });

    expect(session.url).toBe('https://pay.notchpay.co/trx_1');
    expect(session.id).toBe('trx_1');

    const [appel] = appels;
    expect(appel?.url).toBe('https://api.notchpay.co/payments');

    const corps = corpsEnvoye(appel);
    // C'EST TOUT LE LIEN ENTRE LES DEUX MONDES : le webhook le recopie, et
    // c'est par lui que le gestionnaire retrouve la commande à honorer.
    expect(corps['reference']).toBe('cmd-42');
    expect(corps['amount']).toBe(1697);
    // Sans le verrou, le client change de monnaie sur la page hébergée et paie
    // un montant qui n'est pas celui qui l'engage.
    expect(corps['locked_currency']).toBe('XAF');
  });

  it('la clé publique voyage en `Authorization`, et la privée NE VOYAGE PAS', async () => {
    const { appels, transport } = transportSimule({
      statut: 201,
      corps: { transaction: 't', authorization_url: 'https://pay.notchpay.co/t' },
    });

    await provider({ transport }).ouvrirCheckout({
      orderId: 'cmd-1',
      montant: { montant: 500, devise: 'XAF' },
      zone: 'afrique',
      client: { userId: 'u', email: 'a@b.test' },
      urlRetourSucces: 'x',
      urlRetourAbandon: 'y',
    });

    const entetes = appels[0]?.init.headers as Record<string, string>;
    expect(entetes['Authorization']).toBe('pk_test_abcdef');
    // Une clé qui rembourse n'accompagne pas une requête qui n'en a pas besoin.
    expect(entetes['X-Grant']).toBeUndefined();
  });

  it('échoue franchement quand la réponse n’a pas d’adresse de paiement', async () => {
    const { transport } = transportSimule({ statut: 422, corps: { message: 'amount required' } });

    await expect(
      provider({ transport }).ouvrirCheckout({
        orderId: 'cmd-1',
        montant: { montant: 0, devise: 'XAF' },
        zone: 'afrique',
        client: { userId: 'u', email: 'a@b.test' },
        urlRetourSucces: 'x',
        urlRetourAbandon: 'y',
      }),
    ).rejects.toThrow(/amount required/);
  });
});

describe('le remboursement', () => {
  it('est la SEULE opération qui présente la clé privée', async () => {
    const { appels, transport } = transportSimule({ statut: 200, corps: { id: 'ref_1' } });

    await provider({ transport }).rembourser({ referencePaiement: 'pay_9' });

    expect(appels[0]?.url).toBe('https://api.notchpay.co/refunds');
    const entetes = appels[0]?.init.headers as Record<string, string>;
    expect(entetes['X-Grant']).toBe('sk_test_abcdef');
  });

  it('transmet le montant d’un remboursement PARTIEL, et rien pour un total', async () => {
    const partiel = transportSimule({ statut: 200 });
    await provider({ transport: partiel.transport }).rembourser({
      referencePaiement: 'pay_9',
      montant: { montant: 499, devise: 'XAF' },
    });
    expect(corpsEnvoye(partiel.appels[0])['amount']).toBe(499);

    const total = transportSimule({ statut: 200 });
    await provider({ transport: total.transport }).rembourser({ referencePaiement: 'pay_9' });
    expect(corpsEnvoye(total.appels[0])['amount']).toBeUndefined();
  });
});

describe('la signature des webhooks', () => {
  const corps = JSON.stringify({ type: 'payment.complete', data: { id: 'pay_1' } });

  function signer(charge: string, cle: string): string {
    return createHmac('sha256', cle).update(charge).digest('hex');
  }

  it('accepte une signature calculée avec la clé de HACHAGE', () => {
    const resultat = provider().verifierSignatureWebhook(
      corps,
      signer(corps, CLES.cleHachage),
      new Date(),
    );
    expect(resultat.valide).toBe(true);
  });

  it('REFUSE une signature calculée avec la clé privée — le contresens courant', () => {
    /*
     * La documentation de Notch Pay y insiste, et c'est le piège : signer avec
     * `sk_` produit une signature qui ne correspondra jamais, et le symptôme
     * — « tous mes webhooks sont rejetés » — ne désigne pas la cause.
     */
    const resultat = provider().verifierSignatureWebhook(
      corps,
      signer(corps, CLES.clePrivee),
      new Date(),
    );
    expect(resultat).toEqual({ valide: false, raison: 'signature_invalide' });
  });

  it('refuse une signature absente, et une signature TRONQUÉE sans lever', () => {
    expect(provider().verifierSignatureWebhook(corps, null, new Date())).toEqual({
      valide: false,
      raison: 'signature_absente',
    });

    /*
     * `timingSafeEqual` LÈVE quand les longueurs diffèrent. Sans la garde, une
     * signature tronquée produisait une exception au lieu d'un refus — et la
     * route rendait 500, donc « réessayez », sur une contrefaçon.
     */
    const tronquee = signer(corps, CLES.cleHachage).slice(0, 20);
    expect(provider().verifierSignatureWebhook(corps, tronquee, new Date())).toEqual({
      valide: false,
      raison: 'signature_invalide',
    });
  });

  it('porte sur les octets EXACTS du corps, espaces compris', () => {
    const signature = signer(corps, CLES.cleHachage);
    // Un corps re-sérialisé — même objet, autres octets — ne passe plus.
    const reserialise = JSON.stringify(JSON.parse(corps), null, 2);
    expect(
      provider().verifierSignatureWebhook(reserialise, signature, new Date()).valide,
    ).toBe(false);
  });
});

describe('la traduction des événements', () => {
  function lire(type: string, data: Record<string, unknown> = {}) {
    return provider().lireEvenement(JSON.stringify({ type, data }));
  }

  it('traduit les quatre événements de paiement qui nous concernent', () => {
    expect(lire('payment.complete').type).toBe('paiement.reussi');
    expect(lire('payment.failed').type).toBe('paiement.echoue');
    expect(lire('payment.canceled').type).toBe('paiement.abandonne');
    expect(lire('payment.expired').type).toBe('paiement.abandonne');
  });

  it('IGNORE ce qui ne nous concerne pas, au lieu de le refuser', () => {
    /*
     * Refuser rendrait un 400, et Notch Pay réémettrait sans fin un événement
     * qui ne deviendra jamais applicable. `evenement.ignore` est authentifié,
     * journalisé, et acquitté.
     */
    expect(lire('payment.created').type).toBe('evenement.ignore');
    expect(lire('transfer.complete').type).toBe('evenement.ignore');
    expect(lire('customer.created').type).toBe('evenement.ignore');
  });

  it('reprend NOTRE référence comme identifiant de commande, jamais la sienne', () => {
    const evenement = lire('payment.complete', { id: 'pay_77', reference: 'cmd-42' });

    expect(evenement.donnees.orderId).toBe('cmd-42');
    // `id` est la référence du prestataire : elle sert au remboursement, et
    // ne désigne aucune commande chez nous.
    expect(evenement.donnees.referencePaiement).toBe('pay_77');
  });

  it('distingue deux événements portant sur LA MÊME transaction', () => {
    /*
     * Notch Pay ne numérote pas ses événements. Sur l'identifiant de
     * transaction seul, `payment.complete` passerait pour un REJEU de
     * `payment.created` — même clé d'idempotence — et la commande ne serait
     * jamais honorée.
     */
    const cree = lire('payment.created', { id: 'pay_77', reference: 'cmd-42' });
    const complete = lire('payment.complete', { id: 'pay_77', reference: 'cmd-42' });

    expect(cree.id).not.toBe(complete.id);
    // …et il reste STABLE d'une réémission à l'autre, ce que l'idempotence exige.
    expect(lire('payment.complete', { id: 'pay_77', reference: 'cmd-42' }).id).toBe(complete.id);
  });

  it('reporte le montant quand il est complet, et rien quand il ne l’est pas', () => {
    expect(lire('payment.complete', { amount: 1697, currency: 'XAF' }).donnees.montant).toEqual({
      montant: 1697,
      devise: 'XAF',
    });
    expect(lire('payment.complete', { amount: 1697 }).donnees.montant).toBeUndefined();
  });

  it('refuse une charge sans type plutôt que d’en inventer un', () => {
    expect(() => provider().lireEvenement('{"data":{}}')).toThrow(/sans type/);
    expect(() => provider().lireEvenement('"une chaîne"')).toThrow(/illisible/);
  });
});

describe('ce que Notch Pay ne sait pas faire', () => {
  it('refuse une souscription, et le DIT — plutôt qu’encaisser une fois', async () => {
    /*
     * Son API porte des paiements, des virements, des clients et des
     * remboursements : aucun prélèvement programmé. Ouvrir un tunnel qui
     * encaisse une fois donnerait un abonnement qui ne se renouvelle pas et
     * dont personne n'aurait décidé — une règle métier inventée dans un
     * adaptateur.
     */
    await expect(
      provider().souscrireAbonnement({
        subscriptionId: 's1',
        offre: 'mensuel',
        domaine: 'lecture',
        codeOffre: 'lecture-mensuel',
        planId: 'p1',
        montant: { montant: 4500, devise: 'XAF' },
        zone: 'afrique',
        client: { userId: 'u', email: 'a@b.test' },
        joursEssai: 0,
      }),
    ).rejects.toThrow(/récurrent/);
  });

  it('ne prétend pas connaître le pays du moyen de paiement', async () => {
    /*
     * §3.3 : la zone d'encaissement vient du pays du moyen de paiement, que
     * Notch Pay ne révèle qu'APRÈS le règlement. `null` fait retomber
     * l'appelant sur la zone internationale — la plus chère. Une donnée
     * manquante ne doit jamais valoir remise.
     */
    await expect(
      provider().paysDuMoyenDePaiement({ userId: 'u', email: 'a@b.test' }),
    ).resolves.toBeNull();
  });
});

describe('l’en-tête exporté', () => {
  it('est celui que le gestionnaire de webhooks va lire', () => {
    // La route interroge `provider.enteteSignature` : lue d'une constante
    // partagée, elle demandait un en-tête absent et rejetait TOUT.
    expect(ENTETE_SIGNATURE_NOTCHPAY).toBe('x-notch-signature');
  });
});

describe('le repli de confirmation — la transaction doit désigner CETTE commande', () => {
  // ┌────────────────────────────────────────────────────────────────────┐
  // │ LA FAILLE QUE CES TESTS FERMENT.                                   │
  // │                                                                    │
  // │ La référence arrive par l'adresse de retour : le visiteur la       │
  // │ choisit. Le repli honorait la commande affichée dès que Notch Pay  │
  // │ disait « payée » — pour N'IMPORTE QUELLE transaction. Payer une    │
  // │ commande à un euro, puis ouvrir celle d'un coffret avec la même    │
  // │ référence, suffisait à recevoir le coffret.                        │
  // └────────────────────────────────────────────────────────────────────┘
  const ATTENDU = { commandeId: 'commande-a', montant: 1500, devise: 'XAF' };

  function relue(ecarts: Record<string, unknown> = {}) {
    return transportSimule({
      corps: {
        transaction: {
          status: 'complete',
          reference: 'commande-a',
          amount: 1500,
          currency: 'XAF',
          ...ecarts,
        },
      },
    });
  }

  it('confirme le règlement complet de la commande, pour son montant et sa devise', async () => {
    const { appels, transport } = relue();

    await expect(provider({ transport }).confirmerReglement('trx_1', ATTENDU)).resolves.toBe(true);
    expect(appels[0]?.url).toMatch(/\/payments\/trx_1$/);
  });

  it('accepte la référence MARCHANDE quand `reference` est celle du prestataire', async () => {
    const { transport } = relue({ reference: 'trx.notchpay', merchant_reference: 'commande-a' });
    await expect(provider({ transport }).confirmerReglement('trx_1', ATTENDU)).resolves.toBe(true);
  });

  it('REFUSE une transaction réussie qui règle une AUTRE commande', async () => {
    const { transport } = relue({ reference: 'commande-b', merchant_reference: 'commande-b' });
    await expect(provider({ transport }).confirmerReglement('trx_1', ATTENDU)).resolves.toBe(false);
  });

  it('refuse un montant différent — une commande moins chère réglée à sa place', async () => {
    const { transport } = relue({ amount: 100 });
    await expect(provider({ transport }).confirmerReglement('trx_1', ATTENDU)).resolves.toBe(false);
  });

  it('refuse une autre devise, et ignore la casse de la même', async () => {
    const autre = relue({ currency: 'EUR' });
    await expect(provider({ transport: autre.transport }).confirmerReglement('trx_1', ATTENDU)).resolves.toBe(false);

    const casse = relue({ currency: 'xaf' });
    await expect(provider({ transport: casse.transport }).confirmerReglement('trx_1', ATTENDU)).resolves.toBe(true);
  });

  it('refuse une transaction qui n’est pas COMPLÈTE', async () => {
    const { transport } = relue({ status: 'pending' });
    await expect(provider({ transport }).confirmerReglement('trx_1', ATTENDU)).resolves.toBe(false);
  });

  it('refuse une transaction introuvable, sans lever', async () => {
    const { transport } = transportSimule({ statut: 404, corps: { message: 'not found' } });
    await expect(provider({ transport }).confirmerReglement('trx_1', ATTENDU)).resolves.toBe(false);
  });
});

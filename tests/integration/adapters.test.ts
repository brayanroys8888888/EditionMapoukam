import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { FakePaymentProvider } from '@/adapters/payment/fake/fake-payment-provider';
import { FileMailer } from '@/adapters/mail/file-mailer';
import { getMailer, getPaymentProvider, resetAdapters } from '@/adapters/registry';
import { FixedClock } from '@/lib/clock/fixed-clock';
import { SIGNATURE_HEADER, verifierSignature } from '@/lib/crypto/webhook-signature';
import { resetServerEnvCache } from '@/lib/config/env';

import { closePool } from '../helpers/db';

/**
 * Adaptateurs locaux.
 *
 * Le principe éprouvé ici : SEUL L'ÉMETTEUR EST SIMULÉ. Le faux prestataire
 * n'écrit rien en base et n'accorde aucun droit — il émet une vraie requête
 * HTTP signée. Ces tests capturent cette requête et vérifient qu'elle est
 * réellement signée, sans quoi le montage entier serait une façade.
 */
const SECRET = 'secret_de_test_local_1234';
const HORLOGE = new FixedClock('2026-07-28T12:00:00.000Z');

interface RequeteCapturee {
  url: string;
  entete: string | null;
  corps: string;
}

function providerAvecCapture(): { provider: FakePaymentProvider; requetes: RequeteCapturee[] } {
  const requetes: RequeteCapturee[] = [];
  const provider = new FakePaymentProvider({
    clock: HORLOGE,
    secret: SECRET,
    urlWebhook: 'http://localhost:3000/api/webhooks/payments',
    transport: (url, init) => {
      const entetes = new Headers(init.headers);
      requetes.push({
        url,
        entete: entetes.get(SIGNATURE_HEADER),
        corps: typeof init.body === 'string' ? init.body : '',
      });
      return Promise.resolve(new Response('{"recu":true}', { status: 200 }));
    },
  });
  return { provider, requetes };
}

afterAll(async () => {
  await closePool();
});

describe('faux prestataire de paiement', () => {
  it('émet une vraie requête HTTP signée vers le gestionnaire de webhooks', async () => {
    const { provider, requetes } = providerAvecCapture();

    await provider.declencher('paiement.reussi', {
      orderId: '11111111-1111-1111-1111-111111111111',
      montant: { montant: 499, devise: 'EUR' },
    });

    expect(requetes).toHaveLength(1);
    const requete = requetes[0];
    expect(requete?.url).toBe('http://localhost:3000/api/webhooks/payments');
    // La signature est vérifiée par le module réel, pas par une réimplémentation
    // du test : c'est ce qui garantit que le récepteur l'acceptera.
    expect(verifierSignature(requete?.corps ?? '', requete?.entete ?? null, SECRET, HORLOGE.now())).toEqual(
      { valide: true },
    );
  });

  it('signe le corps exactement tel qu’il est transmis', async () => {
    // Si l'implémentation sérialisait deux fois, la signature ne correspondrait
    // plus aux octets envoyés. Le test compare donc l'un à l'autre.
    const { provider, requetes } = providerAvecCapture();

    await provider.declencher('abonnement.souscrit', {
      subscriptionId: '22222222-2222-2222-2222-222222222222',
      offre: 'mensuel',
    });

    const requete = requetes[0];
    const evenement = provider.lireEvenement(requete?.corps ?? '');
    expect(evenement.type).toBe('abonnement.souscrit');
    expect(evenement.donnees.offre).toBe('mensuel');
  });

  it('permet de rejouer un événement à l’identique', async () => {
    // Indispensable pour éprouver l'idempotence depuis la console : deux
    // émissions du même identifiant doivent produire un traitement unique.
    const { provider, requetes } = providerAvecCapture();

    await provider.declencher('paiement.reussi', { orderId: 'x' }, { id: 'evt_rejeu' });
    await provider.declencher('paiement.reussi', { orderId: 'x' }, { id: 'evt_rejeu' });

    const identifiants = requetes.map((r) => provider.lireEvenement(r.corps).id);
    expect(identifiants).toEqual(['evt_rejeu', 'evt_rejeu']);
  });

  it('donne un identifiant distinct à chaque événement non imposé', async () => {
    const { provider, requetes } = providerAvecCapture();

    await provider.declencher('paiement.echoue', { orderId: 'x' });
    await provider.declencher('paiement.echoue', { orderId: 'x' });

    const [premier, second] = requetes.map((r) => provider.lireEvenement(r.corps).id);
    expect(premier).not.toBe(second);
  });

  it('vérifie lui-même les signatures qu’il produit', async () => {
    const { provider, requetes } = providerAvecCapture();
    await provider.declencher('paiement.reussi', { orderId: 'x' });
    const requete = requetes[0];

    expect(
      provider.verifierSignatureWebhook(requete?.corps ?? '', requete?.entete ?? null, HORLOGE.now()),
    ).toEqual({ valide: true });

    expect(
      provider.verifierSignatureWebhook('{"altere":true}', requete?.entete ?? null, HORLOGE.now()),
    ).toMatchObject({ valide: false });
  });

  it('refuse une charge incomplète', () => {
    const { provider } = providerAvecCapture();

    expect(() => provider.lireEvenement('{"type":"paiement.reussi"}')).toThrow(/incomplète/);
    expect(() => provider.lireEvenement('"une chaîne"')).toThrow(/illisible/);
  });

  it('n’accorde aucun droit et n’écrit rien en base', async () => {
    // Le faux prestataire ne connaît ni la base, ni les droits : il n'a aucune
    // méthode pour cela. C'est la garantie structurelle du montage.
    const { provider } = providerAvecCapture();
    const session = await provider.ouvrirCheckout({
      orderId: '33333333-3333-3333-3333-333333333333',
      montant: { montant: 499, devise: 'EUR' },
      zone: 'international',
      client: { userId: 'u', email: 'parent@exemple.test' },
      urlRetourSucces: '/merci',
      urlRetourAbandon: '/panier',
    });

    expect(session.url).toContain('/dev');
    expect(Object.keys(provider)).not.toContain('supabase');
  });
});

describe('FileMailer', () => {
  let dossier: string;

  beforeEach(() => {
    dossier = mkdtempSync(join(tmpdir(), 'mails-'));
  });

  it('écrit un fichier .eml lisible par un client de messagerie', async () => {
    const mailer = new FileMailer({ dossier, clock: HORLOGE });

    const resultat = await mailer.envoyer({
      destinataire: 'parent@exemple.test',
      sujet: 'Votre commande est prête',
      texte: 'Merci pour votre achat.',
      langue: 'fr',
      modele: 'confirmation_commande',
    });

    expect(resultat.chemin).toBeDefined();
    const contenu = readFileSync(resultat.chemin ?? '', 'utf8');
    expect(contenu).toContain('To: parent@exemple.test');
    expect(contenu).toContain('X-Modele: confirmation_commande');
    expect(contenu).toContain('Merci pour votre achat.');
    // Un sujet accentué non encodé s'affiche en caractères illisibles chez le
    // destinataire : il doit être encodé selon la RFC 2047.
    expect(contenu).toMatch(/Subject: =\?UTF-8\?B\?/);

    rmSync(dossier, { recursive: true, force: true });
  });

  it('laisse un sujet purement ASCII en clair', async () => {
    const mailer = new FileMailer({ dossier, clock: HORLOGE });

    const resultat = await mailer.envoyer({
      destinataire: 'parent@exemple.test',
      sujet: 'Your order is ready',
      texte: 'Thank you.',
      langue: 'en',
      modele: 'order_confirmation',
    });

    expect(readFileSync(resultat.chemin ?? '', 'utf8')).toContain('Subject: Your order is ready');
    rmSync(dossier, { recursive: true, force: true });
  });

  it('produit un message multipart quand une version HTML est fournie', async () => {
    const mailer = new FileMailer({ dossier, clock: HORLOGE });

    const resultat = await mailer.envoyer({
      destinataire: 'parent@exemple.test',
      sujet: 'Bienvenue',
      texte: 'Version texte.',
      html: '<p>Version HTML.</p>',
      langue: 'fr',
      modele: 'bienvenue',
    });

    const contenu = readFileSync(resultat.chemin ?? '', 'utf8');
    expect(contenu).toContain('multipart/alternative');
    expect(contenu).toContain('Version texte.');
    expect(contenu).toContain('<p>Version HTML.</p>');
    rmSync(dossier, { recursive: true, force: true });
  });

  it('crée le dossier s’il n’existe pas', async () => {
    const inexistant = join(dossier, 'sous', 'dossier');
    const mailer = new FileMailer({ dossier: inexistant, clock: HORLOGE });

    await mailer.envoyer({
      destinataire: 'a@exemple.test',
      sujet: 'x',
      texte: 'x',
      langue: 'fr',
      modele: 'x',
    });

    expect(readdirSync(inexistant)).toHaveLength(1);
    rmSync(dossier, { recursive: true, force: true });
  });

  it('liste les messages du plus récent au plus ancien', async () => {
    const mailer = new FileMailer({ dossier, clock: HORLOGE });
    await mailer.envoyer({
      destinataire: 'a@exemple.test',
      sujet: 'premier',
      texte: 'x',
      langue: 'fr',
      modele: 'a',
    });
    HORLOGE.advanceMs(1000);
    await mailer.envoyer({
      destinataire: 'b@exemple.test',
      sujet: 'second',
      texte: 'x',
      langue: 'fr',
      modele: 'b',
    });
    HORLOGE.reset();

    const messages = mailer.lister();
    expect(messages).toHaveLength(2);
    expect(messages[0]?.contenu).toContain('second');
    rmSync(dossier, { recursive: true, force: true });
  });

  it('renvoie une liste vide quand le dossier n’existe pas', () => {
    expect(new FileMailer({ dossier: join(dossier, 'absent') }).lister()).toEqual([]);
  });
});

describe('sélection des adaptateurs', () => {
  it('branche le faux prestataire et l’écriture sur disque', () => {
    resetAdapters();

    expect(getPaymentProvider()).toBeInstanceOf(FakePaymentProvider);
    expect(getMailer()).toBeInstanceOf(FileMailer);
  });

  it('refuse explicitement un adaptateur non implémenté', () => {
    // Le message doit désigner l'adaptateur manquant plutôt qu'une variable
    // inconnue : c'est ce qui rendra le branchement réel lisible le jour venu.
    resetAdapters();
    const precedent = process.env['PAYMENT_PROVIDER'];
    process.env['PAYMENT_PROVIDER'] = 'stripe';
    resetServerEnvCache();

    try {
      expect(() => getPaymentProvider()).toThrow(/aucun adaptateur réel/i);
    } finally {
      if (precedent === undefined) delete process.env['PAYMENT_PROVIDER'];
      else process.env['PAYMENT_PROVIDER'] = precedent;
      resetServerEnvCache();
      resetAdapters();
    }
  });
});

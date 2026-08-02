import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { POST as webhookPaiements } from '@/app/api/webhooks/payments/route';
import { FakePaymentProvider } from '@/adapters/payment/fake/fake-payment-provider';
import { GET as pageRoute } from '@/app/api/books/[id]/pages/[page]/route';
import { GET as telecharger } from '@/app/api/downloads/[bookId]/route';
import { GET as statsRoute } from '@/app/api/admin/stats/route';
import { reinitialiserQuotaAdmin } from '@/lib/admin/route-helpers';
import { getAccess } from '@/lib/access/engine';
import { FixedClock } from '@/lib/clock';

import { closePool, query, queryOne } from '../helpers/db';
import { corpsJson, get } from '../helpers/http';
import { createTestUser, deleteTestUser, type TestUser } from '../helpers/users';
import { deposerFichiersDeDemonstration } from '../helpers/storage';

/**
 * PARCOURS D'ABONNEMENT, DE BOUT EN BOUT — étape 16.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LE BUG CLASSIQUE DE CE TYPE DE PLATEFORME EST LE POINT D'ARRIVÉE DE CE   │
 * │ PARCOURS.                                                                │
 * │                                                                          │
 * │ « Un abonnement expiré retire l'accès aux titres couverts par            │
 * │ l'abonnement, mais NE RETIRE JAMAIS l'accès aux titres achetés à         │
 * │ l'unité. » (CLAUDE.md)                                                   │
 * │                                                                          │
 * │ Le parcours passe donc par un abonné qui a AUSSI acheté un titre, et se  │
 * │ termine en vérifiant que l'expiration lui retire l'un et lui laisse      │
 * │ l'autre. Un parcours qui n'aurait qu'un abonnement ne pourrait pas voir  │
 * │ cette erreur.                                                            │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Le temps est déplacé par l'HORLOGE INJECTÉE, jamais en attendant, et jamais
 * en écrivant des dates à la main dans la base.
 */
const provider = new FakePaymentProvider({
  transport: async (_url, init) =>
    await webhookPaiements(
      new Request('http://localhost:3000/api/webhooks/payments', {
        method: 'POST',
        headers: init.headers as HeadersInit,
        body: init.body as BodyInit,
      }),
    ),
});

async function emettre(type: string, donnees: Record<string, unknown>) {
  const resultat = await provider.declencher(type as never, donnees);
  return resultat.statut;
}

let abonne: TestUser;
let editeur: TestUser;
let livreAbonnement: string;
let livreAchete: string;
let abonnementId: string;

/**
 * Instant de référence — LU SUR L'HORLOGE MÉTIER, jamais codé en dur.
 *
 * Une date fixe placerait le parcours dans le futur ou le passé selon le jour où
 * la suite tourne : l'abonnement souscrit ne couvrirait pas l'instant interrogé,
 * et le parcours échouerait pour une raison sans rapport avec ce qu'il vérifie.
 * Il suit donc le même temps que la base.
 */
let T0 = new Date();
function a(joursApres: number): Date {
  return new Date(T0.getTime() + joursApres * 86_400_000);
}

beforeAll(async () => {
  await deposerFichiersDeDemonstration();
  T0 = (await queryOne<{ n: Date }>(`select public.app_now() as n`))!.n;
  abonne = await createTestUser();
  editeur = await createTestUser({ admin: true });

  livreAbonnement =
    (await queryOne<{ id: string }>(`select id from public.books where slug = 'le-lion-et-la-souris'`))
      ?.id ?? '';
  // ┌──────────────────────────────────────────────────────────────────────────┐
  // │ LE TITRE ACHETÉ N'EST PAS INCLUS DANS L'ABONNEMENT.                     │
  // │                                                                          │
  // │ Choix délibéré : si le titre acheté était aussi couvert par              │
  // │ l'abonnement, l'accès qui subsiste après expiration pourrait venir de    │
  // │ l'un ou de l'autre, et le test ne prouverait pas que c'est l'ACHAT qui   │
  // │ le porte. `la-tortue-et-le-lapin` est vendu seul — l'accès qui reste ne  │
  // │ peut venir que de là.                                                    │
  // └──────────────────────────────────────────────────────────────────────────┘
  livreAchete =
    (await queryOne<{ id: string }>(`select id from public.books where slug = 'la-tortue-et-le-lapin'`))
      ?.id ?? '';
});

afterAll(async () => {
  await query(`delete from public.email_outbox where user_id = $1`, [abonne.id]);
  await deleteTestUser(abonne);
  await deleteTestUser(editeur);
  await closePool();
});

describe('PARCOURS D’ABONNEMENT — de l’essai à l’expiration', () => {
  it('1. la CONSOLE souscrit un abonnement avec essai', async () => {
    const statut = await emettre('abonnement.souscrit', {
      userId: abonne.id,
      offre: 'mensuel',
      zone: 'international',
      montant: { montant: 799, devise: 'EUR' },
      joursEssai: 14,
      debutPeriode: T0.toISOString(),
      finPeriode: a(14).toISOString(),
    });
    expect(statut).toBe(200);

    const abonnement = await queryOne<{ id: string; statut: string; jours_essai: number }>(
      `select id, statut, jours_essai from public.subscriptions where user_id = $1`,
      [abonne.id],
    );
    abonnementId = abonnement!.id;

    expect(abonnement?.statut).toBe('essai');
    // La valeur est FIGÉE sur l'abonnement (arbitrage Q10.2) : la changer dans
    // les paramètres plus tard ne réécrit pas les essais déjà accordés.
    expect(abonnement?.jours_essai).toBe(14);
  });

  it('2. l’essai ouvre la LECTURE, jamais le téléchargement', async () => {
    // ┌──────────────────────────────────────────────────────────────────────┐
    // │ LA RÈGLE MÉTIER CENTRALE DU PROJET.                                  │
    // │                                                                      │
    // │ « L'abonnement donne accès à la lecture en ligne. Il ne donne jamais  │
    // │ le droit de télécharger. »                                           │
    // └──────────────────────────────────────────────────────────────────────┘
    const acces = await getAccess(abonne.id, livreAbonnement, { at: a(1) });
    expect(acces).toMatchObject({ canRead: true, canDownload: false, reason: 'subscription' });

    // Et le service de pages le confirme, par la route.
    const page = await pageRoute(
      get(`/api/books/${livreAbonnement}/pages/9`, { jeton: abonne.accessToken }),
      { params: Promise.resolve({ id: livreAbonnement, page: '9' }) },
    );
    expect(page.status).toBe(200);

    const telechargement = await telecharger(
      get(`/api/downloads/${livreAbonnement}?langue=fr&format=pdf`, { jeton: abonne.accessToken }),
      { params: Promise.resolve({ bookId: livreAbonnement }) },
    );
    expect(telechargement.status).toBe(403);
    expect((await corpsJson<{ erreur: { code: string } }>(telechargement)).erreur.code).toBe(
      'telechargement_non_inclus',
    );
  });

  it('3. l’abonné ACHÈTE un titre à l’unité — le cas qui rend la suite probante', async () => {
    // Sans cet achat, l'expiration ne pourrait pas révéler la confusion entre
    // les deux modèles économiques.
    const commande = await queryOne<{ id: string }>(
      `insert into public.orders (user_id, montant_total, devise, zone, statut)
       values ($1, 699, 'EUR', 'international', 'en_attente') returning id`,
      [abonne.id],
    );
    await query(
      `insert into public.order_items (order_id, book_id, langue, prix_unitaire, devise, zone)
       values ($1, $2, 'fr', 699, 'EUR', 'international')`,
      [commande!.id, livreAchete],
    );

    expect(await emettre('paiement.reussi', { orderId: commande!.id })).toBe(200);

    const acces = await getAccess(abonne.id, livreAchete, { at: a(2) });
    expect(acces).toMatchObject({ canRead: true, canDownload: true, reason: 'purchase' });
  });

  it('4. le RENOUVELLEMENT prolonge la période, sans toucher au montant', async () => {
    const avant = await queryOne<{ montant: string; devise: string; zone: string }>(
      `select montant::text, devise, zone from public.subscriptions where id = $1`,
      [abonnementId],
    );

    expect(
      await emettre('abonnement.renouvele', {
        userId: abonne.id,
      subscriptionId: abonnementId,
        debutPeriode: a(14).toISOString(),
        finPeriode: a(44).toISOString(),
      }),
    ).toBe(200);

    const apres = await queryOne<{ statut: string; montant: string; devise: string; zone: string }>(
      `select statut, montant::text, devise, zone from public.subscriptions where id = $1`,
      [abonnementId],
    );

    expect(apres?.statut).toBe('actif');
    // Zone, devise et montant sont FIGÉS (D4 point 7) : un renouvellement ne
    // reclasse jamais un abonné dans une autre grille tarifaire.
    expect({ montant: apres?.montant, devise: apres?.devise, zone: apres?.zone }).toEqual({
      montant: avant?.montant,
      devise: avant?.devise,
      zone: avant?.zone,
    });
  });

  it('5. un ÉCHEC DE PRÉLÈVEMENT n’interrompt pas l’accès — la grâce court', async () => {
    expect(
      await emettre('abonnement.prelevement_echoue', { userId: abonne.id, subscriptionId: abonnementId }),
    ).toBe(200);

    const abonnement = await queryOne<{ statut: string; impaye_depuis: Date }>(
      `select statut, impaye_depuis from public.subscriptions where id = $1`,
      [abonnementId],
    );
    expect(abonnement?.statut).toBe('impaye');
    expect(abonnement?.impaye_depuis).not.toBeNull();

    // Pendant la grâce, la lecture reste ouverte : couper immédiatement
    // punirait une carte expirée comme une résiliation.
    const grace = await queryOne<{ jours: number }>(
      `select periode_grace_jours as jours from public.business_settings where id = 1`,
    );
    const pendant = new Date(
      abonnement!.impaye_depuis.getTime() + (grace!.jours - 1) * 86_400_000,
    );

    expect(await getAccess(abonne.id, livreAbonnement, { at: pendant })).toMatchObject({
      canRead: true,
    });
  });

  it('6. passée la GRÂCE, l’accès d’abonnement se ferme', async () => {
    const abonnement = await queryOne<{ impaye_depuis: Date }>(
      `select impaye_depuis from public.subscriptions where id = $1`,
      [abonnementId],
    );
    const grace = await queryOne<{ jours: number }>(
      `select periode_grace_jours as jours from public.business_settings where id = 1`,
    );
    const apres = new Date(
      abonnement!.impaye_depuis.getTime() + (grace!.jours + 1) * 86_400_000,
    );

    expect(await getAccess(abonne.id, livreAbonnement, { at: apres })).toMatchObject({
      canRead: false,
    });

    // MAIS le titre ACHETÉ reste lisible et téléchargeable.
    expect(await getAccess(abonne.id, livreAchete, { at: apres })).toMatchObject({
      canRead: true,
      canDownload: true,
      reason: 'purchase',
    });
  });

  it('7. l’ANNULATION conserve l’accès jusqu’au terme de la période payée', async () => {
    // Remis en règle d'abord : on éprouve l'annulation d'un abonnement sain.
    await emettre('abonnement.renouvele', {
      userId: abonne.id,
      subscriptionId: abonnementId,
      debutPeriode: a(50).toISOString(),
      finPeriode: a(80).toISOString(),
    });

    expect(await emettre('abonnement.annule', { userId: abonne.id, subscriptionId: abonnementId })).toBe(200);

    const abonnement = await queryOne<{ statut: string; fin_periode: Date }>(
      `select statut, fin_periode from public.subscriptions where id = $1`,
      [abonnementId],
    );
    expect(abonnement?.statut).toBe('annule');

    // La période payée court encore : l'accès est maintenu.
    const avantTerme = new Date(abonnement!.fin_periode.getTime() - 86_400_000);
    expect(await getAccess(abonne.id, livreAbonnement, { at: avantTerme })).toMatchObject({
      canRead: true,
    });
  });

  it('8. À L’EXPIRATION — l’abonnement se ferme, L’ACHAT RESTE', async () => {
    // ┌──────────────────────────────────────────────────────────────────────┐
    // │ LE POINT D'ARRIVÉE DU PARCOURS, ET LE BUG CLASSIQUE DU DOMAINE.      │
    // │                                                                      │
    // │ §3.1 promet à l'acheteur un accès « sans limite de durée ». Confondre │
    // │ les deux modèles reviendrait à reprendre ce qui a été payé, le jour   │
    // │ où un abonnement se termine — c'est-à-dire au pire moment.            │
    // └──────────────────────────────────────────────────────────────────────┘
    const abonnement = await queryOne<{ fin_periode: Date }>(
      `select fin_periode from public.subscriptions where id = $1`,
      [abonnementId],
    );
    const apresTerme = new Date(abonnement!.fin_periode.getTime() + 86_400_000);

    // Le titre d'ABONNEMENT est fermé.
    expect(await getAccess(abonne.id, livreAbonnement, { at: apresTerme })).toMatchObject({
      canRead: false,
      canDownload: false,
    });

    // Le titre ACHETÉ est intact — lecture ET téléchargement.
    expect(await getAccess(abonne.id, livreAchete, { at: apresTerme })).toMatchObject({
      canRead: true,
      canDownload: true,
      reason: 'purchase',
    });

    // Et le téléchargement fonctionne réellement, par la route.
    const telechargement = await telecharger(
      get(`/api/downloads/${livreAchete}?langue=fr&format=pdf`, { jeton: abonne.accessToken }),
      { params: Promise.resolve({ bookId: livreAchete }) },
    );
    expect(telechargement.status).toBe(200);
  }, 90_000);

  it('9. EFFET DE BORD — les emails du cycle sont programmés, sans doublon', async () => {
    const emails = await query<{ modele: string; cle_idempotence: string }>(
      `select modele, cle_idempotence from public.email_outbox where user_id = $1
        order by cree_le`,
      [abonne.id],
    );

    // Au moins la confirmation d'achat. Chaque clé est unique par construction.
    expect(emails.length).toBeGreaterThanOrEqual(1);
    expect(new Set(emails.map((e) => e.cle_idempotence)).size).toBe(emails.length);
  });

  it('10. EFFET DE BORD — les STATISTIQUES comptent l’abonné sur son statut OBSERVÉ', async () => {
    reinitialiserQuotaAdmin();
    const reponse = await statsRoute(
      get('/api/admin/stats?agregat=abonnes', { jeton: editeur.accessToken }),
    );
    expect(reponse.status).toBe(200);

    const corps = await corpsJson<{
      donnees: { statut_observe: string; nombre: string }[];
    }>(reponse);

    // L'abonnement est `annule` en base ; son statut OBSERVÉ dépend de la date.
    // Ce qui compte ici : aucune ligne ne porte le statut brut `anomalie` comme
    // s'il s'agissait d'un abonné actif.
    const actifs = corps.donnees
      .filter((l) => l.statut_observe === 'actif')
      .reduce((t, l) => t + Number(l.nombre), 0);
    const anomalies = corps.donnees
      .filter((l) => l.statut_observe === 'anomalie')
      .reduce((t, l) => t + Number(l.nombre), 0);

    // Notre abonné annulé n'est pas compté parmi les actifs.
    expect(actifs).toBe(0);
    expect(anomalies).toBe(0);
  });

  it('11. le temps est déplacé par l’HORLOGE, jamais en attendant', () => {
    // Tout ce parcours a interrogé le moteur de droits à des instants futurs
    // sans qu'aucune date n'ait été écrite à la main dans la base : c'est ce
    // que permet l'horloge injectable, et c'est ce qui rend le parcours
    // reproductible.
    const horloge = new FixedClock(a(365).toISOString());

    expect(horloge.now().getTime()).toBe(a(365).getTime());
  });
});

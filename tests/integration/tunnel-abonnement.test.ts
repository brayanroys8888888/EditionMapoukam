import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { POST as souscrireSimule } from '@/app/api/abonnement-simule/route';
import { POST as ouvrirSouscription } from '@/app/api/subscriptions/route';
import { POST as webhookPaiements } from '@/app/api/webhooks/payments/route';
import { abonnementCourant } from '@/lib/subscriptions/handlers';
import { preparerSouscription } from '@/lib/subscriptions/souscription';

import { closePool, query, queryOne } from '../helpers/db';
import { corpsJson, postJson } from '../helpers/http';
import { createTestUser, deleteTestUser, type TestUser } from '../helpers/users';

/**
 * TUNNEL D'ABONNEMENT — la route qui simule l'événement du prestataire.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ CE QUE CETTE ROUTE NE DOIT SURTOUT PAS DEVENIR.                         │
 * │                                                                          │
 * │ Elle crée des abonnements sans qu'aucun argent ne circule. C'est         │
 * │ acceptable tant que le faux prestataire est branché, et intenable une    │
 * │ seconde de plus. Les tests ci-dessous portent donc autant sur ce qu'elle │
 * │ REFUSE que sur ce qu'elle produit :                                      │
 * │                                                                          │
 * │   * aucun montant, aucune zone, aucune durée d'essai n'entre par le      │
 * │     corps — sinon le client choisirait son propre tarif ;                │
 * │   * un abonnement vivant interdit d'en ouvrir un second ;                │
 * │   * l'abonnement naît du WEBHOOK, jamais de la route.                    │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
let abonne: TestUser;

/**
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LE WEBHOOK EST APPELÉ EN PROCESSUS, ET LA SUITE N'EXIGE AUCUN SERVEUR.  │
 * │                                                                          │
 * │ Le faux prestataire émet un VRAI événement HTTP vers                     │
 * │ `NEXT_PUBLIC_APP_URL/api/webhooks/payments`. C'est tout son intérêt —     │
 * │ signature, idempotence et octroi atomique sont éprouvés pour de bon —     │
 * │ mais cela suppose que quelque chose écoute sur le port 3000.             │
 * │                                                                          │
 * │ Or `npm run verify` exige au contraire que RIEN n'y écoute :             │
 * │ `tests/unit/middleware.test.ts` simule une panne réseau, et un serveur   │
 * │ en marche la lui rendrait impossible. Les deux exigences sont            │
 * │ inconciliables tant qu'on passe par le réseau.                           │
 * │                                                                          │
 * │ `fetch` est donc dérouté vers le gestionnaire de webhooks IMPORTÉ. Ce    │
 * │ n'est pas un mock : c'est le vrai gestionnaire, avec sa vérification de  │
 * │ signature et son journal. Seul le transport est court-circuité — le      │
 * │ même parti pris que la suite de bout en bout, qui injecte un transport   │
 * │ dans son propre `FakePaymentProvider`.                                   │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
function deroulerFetchVersLeWebhook(): void {
  const reel = globalThis.fetch;

  vi.stubGlobal('fetch', async (entree: RequestInfo | URL, init?: RequestInit) => {
    // `Request` porte son adresse dans `url` ; une `URL` et une chaîne se
    // convertissent. Passer l'objet à `String()` sans distinguer les trois
    // rendrait « [object Object] » pour le premier — et le déroutage ne
    // s'appliquerait plus qu'aux deux autres, en silence.
    const url =
      typeof entree === 'string'
        ? entree
        : entree instanceof URL
          ? entree.href
          : entree.url;

    if (!url.includes('/api/webhooks/payments')) return await reel(entree, init);

    return await webhookPaiements(
      new Request('http://localhost:3000/api/webhooks/payments', {
        method: 'POST',
        headers: init?.headers as HeadersInit,
        body: init?.body as BodyInit,
      }),
    );
  });
}

async function effacerAbonnements(userId: string): Promise<void> {
  await query(`delete from public.payment_events where user_id = $1`, [userId]);
  await query(`delete from public.subscriptions where user_id = $1`, [userId]);
}

beforeAll(async () => {
  deroulerFetchVersLeWebhook();
  abonne = await createTestUser();
});

beforeEach(async () => {
  await effacerAbonnements(abonne.id);
});

afterAll(async () => {
  await effacerAbonnements(abonne.id);
  await deleteTestUser(abonne);
  // Rendu AVANT la fermeture du pool : `createTestUser` et `deleteTestUser`
  // passent par le réseau, et un `fetch` déjà rétabli ne gêne rien — mais un
  // `fetch` laissé dérouté déborderait sur les fichiers suivants.
  vi.unstubAllGlobals();
  await closePool();
});

describe('la préparation d’une souscription', () => {
  it('rend montant, devise, zone et essai — tous décidés par le SERVEUR', async () => {
    const preparation = await preparerSouscription({
      userId: abonne.id,
      email: abonne.email,
    });

    // La zone vient du pays que le PRESTATAIRE rapporte (§3.3), jamais d'un
    // champ soumis. Le faux prestataire simule « FR » par défaut.
    expect(preparation.zone).toBe('international');
    expect(preparation.devise).toBe('EUR');
    expect(preparation.montants.mensuel).toBeGreaterThan(0);
    expect(preparation.montants.annuel).toBeGreaterThan(preparation.montants.mensuel);
    expect(preparation.joursEssai).toBeGreaterThanOrEqual(0);
  });

  it('est la MÊME source que la route d’ouverture — pas une seconde grille', async () => {
    // ┌────────────────────────────────────────────────────────────────────┐
    // │ Trois fois dans ce projet, une règle écrite deux fois a rendu deux  │
    // │ verdicts opposés. Ici l'écart aurait été invisible : la             │
    // │ souscription se serait ouverte à un prix et l'abonnement aurait été │
    // │ créé à un autre, sans qu'aucun écran ne montre les deux.            │
    // └────────────────────────────────────────────────────────────────────┘
    const preparation = await preparerSouscription({
      userId: abonne.id,
      email: abonne.email,
    });

    await souscrireSimule(
      postJson('/api/abonnement-simule', { offre: 'annuel', issue: 'reussi' }, {
        jeton: abonne.accessToken,
      }),
    );

    const enBase = await queryOne<{ montant: string; devise: string; zone: string }>(
      `select montant, devise, zone from public.subscriptions where user_id = $1`,
      [abonne.id],
    );

    expect(Number(enBase?.montant)).toBe(preparation.montants.annuel);
    expect(enBase?.devise).toBe(preparation.devise);
    expect(enBase?.zone).toBe(preparation.zone);
  });
});

describe('le règlement simulé d’une souscription', () => {
  it('exige d’être connecté', async () => {
    const reponse = await souscrireSimule(
      postJson('/api/abonnement-simule', { offre: 'mensuel', issue: 'reussi' }),
    );

    expect(reponse.status).toBe(401);
  });

  it('crée l’abonnement — par le WEBHOOK, jamais par la route', async () => {
    const reponse = await souscrireSimule(
      postJson('/api/abonnement-simule', { offre: 'mensuel', issue: 'reussi' }, {
        jeton: abonne.accessToken,
      }),
    );

    expect(reponse.status).toBe(200);

    // ┌────────────────────────────────────────────────────────────────────┐
    // │ LA PREUVE QUE C'EST LE WEBHOOK QUI A AGI.                          │
    // │                                                                    │
    // │ Un événement `abonnement.souscrit` a été REÇU, sa signature         │
    // │ VÉRIFIÉE, et il est marqué TRAITÉ. Si la route avait écrit          │
    // │ directement en base, l'abonnement existerait sans cette ligne — et  │
    // │ tout le modèle de sécurité de §9.1 serait contourné en silence.     │
    // └────────────────────────────────────────────────────────────────────┘
    const evenement = await queryOne<{ signature_valide: boolean; traite_le: string | null }>(
      `select signature_valide, traite_le from public.webhook_events
        where type = 'abonnement.souscrit' order by recu_le desc limit 1`,
    );

    expect(evenement?.signature_valide).toBe(true);
    expect(evenement?.traite_le).not.toBeNull();

    const courant = await abonnementCourant(abonne.id);
    expect(courant).not.toBeNull();
    expect(courant?.offre).toBe('mensuel');
  });

  it('un ÉCHEC ne crée rien, et n’émet aucun événement', async () => {
    // ┌────────────────────────────────────────────────────────────────────┐
    // │ C'est le comportement RÉEL, pas un raccourci.                      │
    // │                                                                    │
    // │ Un prestataire dont le PREMIER prélèvement échoue n'envoie pas      │
    // │ `abonnement.souscrit` suivi d'un échec : il n'envoie rien, parce    │
    // │ qu'aucun abonnement n'a été créé chez lui. La machine à états le    │
    // │ confirmerait — `prelevement_echoue` sans abonnement courant est une │
    // │ transition refusée.                                                │
    // └────────────────────────────────────────────────────────────────────┘
    const avant = await queryOne<{ n: string }>(
      `select count(*) as n from public.webhook_events where type like 'abonnement.%'`,
    );

    const reponse = await souscrireSimule(
      postJson('/api/abonnement-simule', { offre: 'mensuel', issue: 'echoue' }, {
        jeton: abonne.accessToken,
      }),
    );

    expect(reponse.status).toBe(200);
    expect(await corpsJson<{ souscrit: boolean }>(reponse)).toEqual({
      souscrit: false,
      reception: null,
    });

    const apres = await queryOne<{ n: string }>(
      `select count(*) as n from public.webhook_events where type like 'abonnement.%'`,
    );

    expect(apres?.n).toBe(avant?.n);
    expect(await abonnementCourant(abonne.id)).toBeNull();
  });

  it('refuse un SECOND abonnement quand un premier est vivant', async () => {
    await souscrireSimule(
      postJson('/api/abonnement-simule', { offre: 'mensuel', issue: 'reussi' }, {
        jeton: abonne.accessToken,
      }),
    );

    const reponse = await souscrireSimule(
      postJson('/api/abonnement-simule', { offre: 'annuel', issue: 'reussi' }, {
        jeton: abonne.accessToken,
      }),
    );

    // Un double prélèvement, et l'index unique de la base le refuserait de
    // toute façon — mais un 409 explicite vaut mieux qu'une erreur de
    // contrainte remontée jusqu'à l'écran.
    expect(reponse.status).toBe(409);

    const nombre = await queryOne<{ n: string }>(
      `select count(*) as n from public.subscriptions where user_id = $1`,
      [abonne.id],
    );
    expect(nombre?.n).toBe('1');
  });

  it('la route d’OUVERTURE refuse elle aussi le doublon', async () => {
    // Les deux gardes existent, et aucune ne dépend de l'autre : l'écran
    // appelle les deux routes à la suite, et la première doit déjà refuser.
    await souscrireSimule(
      postJson('/api/abonnement-simule', { offre: 'mensuel', issue: 'reussi' }, {
        jeton: abonne.accessToken,
      }),
    );

    const reponse = await ouvrirSouscription(
      postJson('/api/subscriptions', { offre: 'mensuel' }, { jeton: abonne.accessToken }),
    );

    expect(reponse.status).toBe(409);
  });
});

describe('AUCUN TARIF NE VIENT DU CLIENT', () => {
  it('un montant, une zone ou un essai soumis sont IGNORÉS', async () => {
    // ┌────────────────────────────────────────────────────────────────────┐
    // │ Zod n'accepte que `offre` et `issue`. Les champs surnuméraires sont │
    // │ écartés du parsing, si bien qu'ils ne peuvent pas atteindre         │
    // │ l'événement. Ce test le prouve depuis l'extérieur plutôt que de     │
    // │ faire confiance au schéma : c'est la garantie qui vaut, pas le      │
    // │ moyen par lequel elle est obtenue.                                  │
    // └────────────────────────────────────────────────────────────────────┘
    const preparation = await preparerSouscription({
      userId: abonne.id,
      email: abonne.email,
    });

    await souscrireSimule(
      postJson(
        '/api/abonnement-simule',
        {
          offre: 'mensuel',
          issue: 'reussi',
          montant: { montant: 1, devise: 'XAF' },
          zone: 'afrique',
          joursEssai: 3650,
        },
        { jeton: abonne.accessToken },
      ),
    );

    const enBase = await queryOne<{ montant: string; devise: string; zone: string; jours_essai: number }>(
      `select montant, devise, zone, jours_essai from public.subscriptions where user_id = $1`,
      [abonne.id],
    );

    expect(Number(enBase?.montant)).toBe(preparation.montants.mensuel);
    expect(enBase?.devise).toBe('EUR');
    expect(enBase?.zone).toBe('international');
    expect(enBase?.jours_essai).not.toBe(3650);
  });

  it('refuse une offre inconnue', async () => {
    const reponse = await souscrireSimule(
      postJson('/api/abonnement-simule', { offre: 'a_vie', issue: 'reussi' }, {
        jeton: abonne.accessToken,
      }),
    );

    expect(reponse.status).toBe(400);
  });

  it('refuse une issue inconnue', async () => {
    const reponse = await souscrireSimule(
      postJson('/api/abonnement-simule', { offre: 'mensuel', issue: 'gratuit' }, {
        jeton: abonne.accessToken,
      }),
    );

    expect(reponse.status).toBe(400);
  });
});

describe('L’ABONNEMENT NE DONNE JAMAIS LE TÉLÉCHARGEMENT', () => {
  it('même fraîchement souscrit', async () => {
    // ┌────────────────────────────────────────────────────────────────────┐
    // │ LA RÈGLE MÉTIER CENTRALE, ÉPROUVÉE SUR LE NOUVEAU CHEMIN.          │
    // │                                                                    │
    // │ Le tunnel d'abonnement est une nouvelle porte vers `entitlements`.  │
    // │ Elle passe par le webhook, donc par le code déjà éprouvé — mais     │
    // │ c'est exactement le genre de certitude qui mérite d'être vérifiée   │
    // │ plutôt que déduite.                                                 │
    // └────────────────────────────────────────────────────────────────────┘
    await souscrireSimule(
      postJson('/api/abonnement-simule', { offre: 'annuel', issue: 'reussi' }, {
        jeton: abonne.accessToken,
      }),
    );

    const droits = await query<{ peut_telecharger: boolean }>(
      `select peut_telecharger from public.entitlements where user_id = $1`,
      [abonne.id],
    );

    // Un abonnement n'écrit aucun droit de téléchargement. S'il en écrivait un
    // jour, ce test tomberait avant que quiconque ne télécharge.
    expect(droits.filter((droit) => droit.peut_telecharger)).toEqual([]);
  });
});

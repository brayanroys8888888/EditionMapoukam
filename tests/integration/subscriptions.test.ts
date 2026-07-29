import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { appliquerEvenement, abonnementCourant } from '@/lib/subscriptions/handlers';
import { getAccess } from '@/lib/access/engine';
import { FixedClock } from '@/lib/clock';
import {
  GET as lireAbonnement,
  POST as souscrire,
  DELETE as annuler,
} from '@/app/api/subscriptions/route';

import { closePool, query, queryOne } from '../helpers/db';
import { corpsJson, get, postJson } from '../helpers/http';
import { createTestUser, deleteTestUser, type TestUser } from '../helpers/users';

/**
 * Cycle de vie de l'abonnement — §9.1.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ TOUS LES SCÉNARIOS TEMPORELS SONT JOUÉS EN DÉPLAÇANT L'HORLOGE.         │
 * │                                                                          │
 * │ CLAUDE.md : « les scénarios d'abonnement (fin de période, échec,        │
 * │ expiration) sont testés en avançant l'horloge injectée, jamais en        │
 * │ attendant. » Les transitions reçoivent une `FixedClock` ; les            │
 * │ vérifications d'accès reçoivent l'instant en paramètre, que la fonction  │
 * │ `access_for_books` accepte pour cette raison même.                      │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
let abonne: TestUser;

/** Titres du jeu de démonstration, résolus une fois. */
let livreAbonnement: string; // inclus_abonnement, publié il y a 8 mois → hors fenêtre
let livreAchat: string; // vente unitaire seule, jamais couvert par l'abonnement

const DEPART = new Date('2026-07-29T12:00:00Z');

/** Avance d'un nombre de jours depuis le départ. */
function jours(n: number): Date {
  return new Date(DEPART.getTime() + n * 86_400_000);
}

/** Souscrit avec essai, à l'instant de départ. */
async function souscrireAvecEssai(zone: 'international' | 'afrique' = 'international') {
  return await appliquerEvenement(
    {
      userId: abonne.id,
      evenement: 'souscrit',
      offre: 'mensuel',
      zone,
      devise: zone === 'afrique' ? 'XAF' : 'EUR',
      montant: zone === 'afrique' ? 2500 : 799,
      joursEssai: 7,
    },
    { clock: new FixedClock(DEPART) },
  );
}

beforeAll(async () => {
  abonne = await createTestUser();

  const abonnement = await queryOne<{ id: string }>(
    `select id from public.books where slug = 'le-lion-et-la-souris'`,
  );
  const achat = await queryOne<{ id: string }>(
    `select id from public.books where slug = 'la-tortue-et-le-lapin'`,
  );
  livreAbonnement = abonnement!.id;
  livreAchat = achat!.id;
});

beforeEach(async () => {
  // Chaque scénario part d'un compte sans abonnement ni droit : les statuts
  // vivants sont uniques par utilisateur, et un reliquat ferait échouer la
  // souscription suivante pour une raison sans rapport avec le test.
  await query(`delete from public.payment_events where user_id = $1`, [abonne.id]);
  await query(`delete from public.subscriptions where user_id = $1`, [abonne.id]);
  await query(`delete from public.entitlements where user_id = $1`, [abonne.id]);
});

afterAll(async () => {
  await deleteTestUser(abonne);
  await closePool();
});

describe('essai puis activation', () => {
  it('ouvre un essai de 7 jours qui donne accès immédiatement', async () => {
    // §3.4 — essai gratuit de 7 jours, moyen de paiement requis. L'accès est
    // ouvert dès la souscription.
    const resultat = await souscrireAvecEssai();

    expect(resultat.ok && resultat.statut).toBe('essai');

    const acces = await getAccess(abonne.id, livreAbonnement, { at: jours(1) });
    expect(acces.canRead).toBe(true);
    expect(acces.reason).toBe('subscription');
  });

  it('passe en actif au premier prélèvement', async () => {
    await souscrireAvecEssai();

    const resultat = await appliquerEvenement(
      { userId: abonne.id, evenement: 'renouvele' },
      { clock: new FixedClock(jours(7)) },
    );

    expect(resultat.ok && resultat.statut).toBe('actif');
  });

  it('N’ACCORDE JAMAIS le téléchargement', async () => {
    // §3.2, la règle métier centrale : « Le droit de téléchargement n'est
    // accordé que par un achat, jamais par un abonnement. »
    await souscrireAvecEssai();
    await appliquerEvenement(
      { userId: abonne.id, evenement: 'renouvele' },
      { clock: new FixedClock(jours(7)) },
    );

    const acces = await getAccess(abonne.id, livreAbonnement, { at: jours(10) });

    expect(acces.canRead).toBe(true);
    expect(acces.canDownload).toBe(false);
    expect(acces.reason).toBe('subscription');
  });
});

describe('échec de prélèvement et période de grâce', () => {
  it('maintient l’accès pendant la période de grâce', async () => {
    // §9.1 — « statut impaye, période de grâce ». Sept jours par défaut
    // (business_settings.periode_grace_jours).
    await souscrireAvecEssai();
    await appliquerEvenement(
      { userId: abonne.id, evenement: 'prelevement_echoue' },
      { clock: new FixedClock(jours(7)) },
    );

    const pendant = await getAccess(abonne.id, livreAbonnement, { at: jours(10) });
    expect(pendant.canRead).toBe(true);
  });

  it('RETIRE l’accès une fois la grâce écoulée', async () => {
    await souscrireAvecEssai();
    await appliquerEvenement(
      { userId: abonne.id, evenement: 'prelevement_echoue' },
      { clock: new FixedClock(jours(7)) },
    );

    // Grâce de 7 jours à compter de l'échec : au 20e jour, elle est passée.
    const apres = await getAccess(abonne.id, livreAbonnement, { at: jours(20) });

    expect(apres.canRead).toBe(false);
    expect(apres.reason).toBe('preview');
  });

  it('fait courir la grâce depuis le PREMIER échec, pas le dernier', async () => {
    // Un prestataire qui réessaie chaque jour prolongerait sinon la grâce
    // indéfiniment.
    await souscrireAvecEssai();
    await appliquerEvenement(
      { userId: abonne.id, evenement: 'prelevement_echoue' },
      { clock: new FixedClock(jours(7)) },
    );
    await appliquerEvenement(
      { userId: abonne.id, evenement: 'prelevement_echoue' },
      { clock: new FixedClock(jours(11)) },
    );

    const enBase = await queryOne<{ impaye_depuis: string }>(
      `select impaye_depuis from public.subscriptions where user_id = $1`,
      [abonne.id],
    );
    expect(new Date(enBase!.impaye_depuis).toISOString()).toBe(jours(7).toISOString());

    // Et l'accès est bien retiré au 20e jour, comme si le second échec
    // n'existait pas.
    const acces = await getAccess(abonne.id, livreAbonnement, { at: jours(20) });
    expect(acces.canRead).toBe(false);
  });

  it('referme la grâce quand le prélèvement finit par passer', async () => {
    await souscrireAvecEssai();
    await appliquerEvenement(
      { userId: abonne.id, evenement: 'prelevement_echoue' },
      { clock: new FixedClock(jours(7)) },
    );
    await appliquerEvenement(
      { userId: abonne.id, evenement: 'renouvele' },
      { clock: new FixedClock(jours(9)) },
    );

    const enBase = await queryOne<{ statut: string; impaye_depuis: string | null }>(
      `select statut, impaye_depuis from public.subscriptions where user_id = $1`,
      [abonne.id],
    );
    expect(enBase?.statut).toBe('actif');
    expect(enBase?.impaye_depuis).toBeNull();

    const acces = await getAccess(abonne.id, livreAbonnement, { at: jours(20) });
    expect(acces.canRead).toBe(true);
  });
});

describe('annulation', () => {
  it('maintient l’accès jusqu’à la fin de la période payée', async () => {
    // §9.1 — « annulations (accès maintenu jusqu'à la fin de la période
    // payée) ». C'est le contresens le plus fréquent : croire qu'annuler coupe
    // immédiatement.
    await souscrireAvecEssai();
    await appliquerEvenement(
      { userId: abonne.id, evenement: 'renouvele' },
      { clock: new FixedClock(jours(7)) },
    );
    await appliquerEvenement(
      { userId: abonne.id, evenement: 'annule' },
      { clock: new FixedClock(jours(10)) },
    );

    // La période court jusqu'au 7e jour + 1 mois.
    const pendant = await getAccess(abonne.id, livreAbonnement, { at: jours(20) });
    expect(pendant.canRead).toBe(true);
    expect(pendant.reason).toBe('subscription');
  });

  it('retire l’accès une fois la période échue', async () => {
    await souscrireAvecEssai();
    await appliquerEvenement(
      { userId: abonne.id, evenement: 'annule' },
      { clock: new FixedClock(jours(2)) },
    );

    // L'essai s'achevait au 7e jour : au 10e, plus rien.
    const apres = await getAccess(abonne.id, livreAbonnement, { at: jours(10) });
    expect(apres.canRead).toBe(false);
  });

  it('ne déplace pas la fin de période', async () => {
    await souscrireAvecEssai();
    const avant = await abonnementCourant(abonne.id);

    await appliquerEvenement(
      { userId: abonne.id, evenement: 'annule' },
      { clock: new FixedClock(jours(2)) },
    );
    const apres = await abonnementCourant(abonne.id);

    expect(apres?.finPeriode.toISOString()).toBe(avant?.finPeriode.toISOString());
  });
});

describe('expiration — LE BUG CLASSIQUE', () => {
  it('retire la lecture par abonnement MAIS LAISSE LES ACHATS INTACTS', async () => {
    // ┌──────────────────────────────────────────────────────────────────────┐
    // │ CLAUDE.md : « Un abonnement expiré retire l'accès en lecture aux     │
    // │ titres couverts par l'abonnement, mais NE RETIRE JAMAIS l'accès aux  │
    // │ titres achetés à l'unité. C'est le bug classique de ce type de       │
    // │ plateforme — il doit avoir un test dédié. »                          │
    // │                                                                      │
    // │ Le voici. Un seul utilisateur, deux titres, deux issues opposées.    │
    // └──────────────────────────────────────────────────────────────────────┘
    await souscrireAvecEssai();

    // Un achat à l'unité, sur un titre qui n'est PAS couvert par l'abonnement.
    const commande = await queryOne<{ id: string }>(
      `insert into public.orders (user_id, montant_total, devise, zone, statut, paye_le)
       values ($1, 499, 'EUR', 'international', 'paye', public.app_now()) returning id`,
      [abonne.id],
    );
    await query(
      `insert into public.entitlements (user_id, book_id, type, source_id, peut_telecharger)
       values ($1, $2, 'achat', $3, true)`,
      [abonne.id, livreAchat, commande!.id],
    );

    // Avant expiration : les deux titres sont accessibles, pour deux raisons
    // différentes.
    const abonnementAvant = await getAccess(abonne.id, livreAbonnement, { at: jours(1) });
    const achatAvant = await getAccess(abonne.id, livreAchat, { at: jours(1) });
    expect(abonnementAvant.reason).toBe('subscription');
    expect(achatAvant.reason).toBe('purchase');

    // Expiration.
    await appliquerEvenement(
      { userId: abonne.id, evenement: 'expire' },
      { clock: new FixedClock(jours(30)) },
    );

    const abonnementApres = await getAccess(abonne.id, livreAbonnement, { at: jours(31) });
    const achatApres = await getAccess(abonne.id, livreAchat, { at: jours(31) });

    // Le titre d'abonnement est perdu…
    expect(abonnementApres.canRead).toBe(false);
    expect(abonnementApres.reason).toBe('preview');

    // …et le titre ACHETÉ est toujours là, lecture ET téléchargement.
    expect(achatApres.canRead).toBe(true);
    expect(achatApres.canDownload).toBe(true);
    expect(achatApres.reason).toBe('purchase');
  });

  it('laisse l’achat intact même très longtemps après l’expiration', async () => {
    // §3.1 promet à l'acheteur un accès « sans limite de durée ».
    const commande = await queryOne<{ id: string }>(
      `insert into public.orders (user_id, montant_total, devise, zone, statut, paye_le)
       values ($1, 499, 'EUR', 'international', 'paye', public.app_now()) returning id`,
      [abonne.id],
    );
    await query(
      `insert into public.entitlements (user_id, book_id, type, source_id, peut_telecharger)
       values ($1, $2, 'achat', $3, true)`,
      [abonne.id, livreAchat, commande!.id],
    );

    await souscrireAvecEssai();
    await appliquerEvenement(
      { userId: abonne.id, evenement: 'expire' },
      { clock: new FixedClock(jours(30)) },
    );

    const dansCinqAns = await getAccess(abonne.id, livreAchat, { at: jours(365 * 5) });

    expect(dansCinqAns.canRead).toBe(true);
    expect(dansCinqAns.canDownload).toBe(true);
  });
});

describe('zone figée à la souscription — D4 point 7', () => {
  it('n’est pas recalculée au renouvellement', async () => {
    // « Un abonné qui souscrit en zone Afrique à 2 500 FCFA doit être reconduit
    // à 2 500 FCFA, même s'il renouvelle depuis un autre pays. »
    await souscrireAvecEssai('afrique');

    await appliquerEvenement(
      {
        userId: abonne.id,
        evenement: 'renouvele',
        // Le prestataire annonce une autre zone : elle doit être IGNORÉE.
        zone: 'international',
        devise: 'EUR',
        montant: 799,
      },
      { clock: new FixedClock(jours(7)) },
    );

    const apres = await abonnementCourant(abonne.id);

    expect(apres?.zone).toBe('afrique');
    expect(apres?.devise).toBe('XAF');
    expect(apres?.montant).toBe(2500);
  });

  it('conserve l’offre du contrat, pas celle de l’événement', async () => {
    await souscrireAvecEssai();

    await appliquerEvenement(
      { userId: abonne.id, evenement: 'renouvele', offre: 'annuel' },
      { clock: new FixedClock(jours(7)) },
    );

    const apres = await abonnementCourant(abonne.id);
    expect(apres?.offre).toBe('mensuel');
  });
});

describe('renouvellement et bornes de période', () => {
  it('repart de la fin de période quand elle est encore devant', async () => {
    // Repartir de « maintenant » offrirait des jours à qui renouvelle en avance.
    await souscrireAvecEssai();
    const avant = await abonnementCourant(abonne.id);

    await appliquerEvenement(
      { userId: abonne.id, evenement: 'renouvele' },
      { clock: new FixedClock(jours(3)) },
    );
    const apres = await abonnementCourant(abonne.id);

    // Nouvelle fin = ancienne fin + 1 mois, et non « maintenant + 1 mois ».
    const attendu = new Date(avant!.finPeriode.getTime());
    attendu.setUTCMonth(attendu.getUTCMonth() + 1);
    expect(apres?.finPeriode.toISOString()).toBe(attendu.toISOString());
  });

  it('repart de maintenant quand la période est déjà échue', async () => {
    // Repartir de `fin_periode` offrirait des jours à qui a laissé traîner un
    // impayé.
    await souscrireAvecEssai();

    await appliquerEvenement(
      { userId: abonne.id, evenement: 'renouvele' },
      { clock: new FixedClock(jours(40)) },
    );
    const apres = await abonnementCourant(abonne.id);

    const attendu = new Date(jours(40).getTime());
    attendu.setUTCMonth(attendu.getUTCMonth() + 1);
    expect(apres?.finPeriode.toISOString()).toBe(attendu.toISOString());
  });
});

describe('statut effectif — les dates repliées sur le statut rapporté', () => {
  /** Statut effectif de l'abonnement courant, à une date donnée. */
  async function effectif(at: Date): Promise<string | undefined> {
    const ligne = await queryOne<{ s: string }>(
      `select public.statut_effectif(s.statut, s.fin_periode, s.impaye_depuis, $2::timestamptz) as s
         from public.subscriptions s where s.user_id = $1`,
      [abonne.id, at.toISOString()],
    );
    return ligne?.s;
  }

  it('NE TOUCHE PAS `statut`, qui garde ce que le prestataire a rapporté', async () => {
    // « Annulé » et « impayé » ne racontent pas la même histoire : le premier
    // est un départ volontaire, le second un accident de paiement. Les replier
    // tous deux sur « expiré » en base détruirait la distinction dont l'analyse
    // de rétention (étape 14) a besoin.
    await souscrireAvecEssai();
    await appliquerEvenement(
      { userId: abonne.id, evenement: 'annule' },
      { clock: new FixedClock(jours(2)) },
    );

    const enBase = await queryOne<{ statut: string }>(
      `select statut from public.subscriptions where user_id = $1`,
      [abonne.id],
    );
    expect(enBase?.statut).toBe('annule');
  });

  it('replie « annulé » sur « expiré » une fois la période payée écoulée', async () => {
    await souscrireAvecEssai();
    await appliquerEvenement(
      { userId: abonne.id, evenement: 'annule' },
      { clock: new FixedClock(jours(2)) },
    );

    // L'essai s'achevait au 7e jour.
    expect(await effectif(jours(5))).toBe('annule');
    expect(await effectif(jours(10))).toBe('expire');
  });

  it('replie « impayé » sur « expiré » une fois la grâce écoulée', async () => {
    await souscrireAvecEssai();
    await appliquerEvenement(
      { userId: abonne.id, evenement: 'prelevement_echoue' },
      { clock: new FixedClock(jours(7)) },
    );

    // Grâce de 7 jours à compter de l'échec.
    expect(await effectif(jours(10))).toBe('impaye');
    expect(await effectif(jours(20))).toBe('expire');
  });

  it('signale « anomalie » un actif dont la période est échue', async () => {
    // ┌──────────────────────────────────────────────────────────────────────┐
    // │ UN `actif` À PÉRIODE ÉCHUE RESSEMBLE EXACTEMENT À UN ABONNEMENT SAIN.│
    // │                                                                      │
    // │ Dans la liste des abonnés, dans le tableau de bord, dans les         │
    // │ comptages, rien ne le distingue. Il ne se voit pas, il se fond dans  │
    // │ la masse — et il fausse les statistiques en comptant un abonné actif │
    // │ qui ne paie plus. `anomalie` le rend DÉTECTABLE.                     │
    // └──────────────────────────────────────────────────────────────────────┘
    await souscrireAvecEssai();
    await appliquerEvenement(
      { userId: abonne.id, evenement: 'renouvele' },
      { clock: new FixedClock(jours(7)) },
    );

    // La période court jusqu'au 7e jour + 1 mois, soit le 37e environ.
    expect(await effectif(jours(400))).toBe('anomalie');
  });

  it('laisse la tolérance au renouvellement en vol', async () => {
    // Un prestataire prélève, son événement met quelques minutes à arriver.
    // Sans tolérance, chaque abonnement clignoterait en anomalie à chaque
    // échéance, et le signal deviendrait du bruit — donc inutile.
    await souscrireAvecEssai();

    // L'essai s'achève au 7e jour ; la tolérance est de 48 heures.
    expect(await effectif(new Date(jours(7).getTime() + 3600_000))).toBe('essai');
    expect(await effectif(jours(8))).toBe('essai');
    expect(await effectif(jours(10))).toBe('anomalie');
  });

  it('signale aussi un essai qui s’achève sans premier prélèvement', async () => {
    // Même signal : un webhook qui n'est pas arrivé.
    await souscrireAvecEssai();

    expect(await effectif(jours(30))).toBe('anomalie');
  });

  it('N’EST PAS une anomalie quand le prestataire a parlé', async () => {
    // Annulé ou impayé, l'abonnement a une histoire connue : ce n'est pas le
    // silence qui pose problème, c'est l'absence de nouvelle.
    await souscrireAvecEssai();
    await appliquerEvenement(
      { userId: abonne.id, evenement: 'annule' },
      { clock: new FixedClock(jours(2)) },
    );

    expect(await effectif(jours(400))).toBe('expire');
  });

  it('apparaît dans la liste des anomalies, avec depuis quand', async () => {
    // Le back-office (étape 13) les affiche en évidence : c'est le signal
    // qu'un webhook a été perdu ou que l'intégration a un défaut.
    await souscrireAvecEssai();

    const anomalies = await query<{ subscription_id: string; depuis: string }>(
      `select subscription_id, depuis::text from public.abonnements_en_anomalie($1::timestamptz)`,
      [jours(30).toISOString()],
    );

    expect(anomalies).toHaveLength(1);
    expect(anomalies[0]?.depuis).toBeTruthy();
  });

  it('n’est comptée NI en actif NI en expiré', async () => {
    // La ranger avec les actifs gonflerait le nombre d'abonnés payants ; avec
    // les expirés, elle masquerait le défaut d'intégration. Les deux
    // fausseraient l'analyse de rétention, chacune dans un sens.
    await souscrireAvecEssai();

    const comptes = await query<{ statut: string; nombre: string }>(
      `select statut::text, nombre::text from public.compter_abonnements($1::timestamptz)`,
      [jours(30).toISOString()],
    );
    const par = new Map(comptes.map((c) => [c.statut, Number(c.nombre)]));

    expect(par.get('anomalie')).toBe(1);
    expect(par.get('actif')).toBe(0);
    expect(par.get('expire')).toBe(0);
  });

  it('est journalisée à l’observation', async () => {
    // Sans cette trace, l'abonnement passerait inaperçu jusqu'à ce que
    // quelqu'un s'étonne des comptages.
    await souscrireAvecEssai();
    // Les DEUX bornes reculent : la contrainte `subscriptions_periode_coherente`
    // exige `fin_periode > debut_periode`, et ne déplacer que la fin
    // produirait une période à l'envers.
    await query(
      `update public.subscriptions
          set debut_periode = public.app_now() - interval '60 days',
              fin_periode = public.app_now() - interval '30 days'
        where user_id = $1`,
      [abonne.id],
    );

    // Le logger du projet écrit ses avertissements sur la sortie d'erreur : on
    // l'intercepte le temps de l'observation, plutôt que d'ajouter au code de
    // production un point d'écoute qui n'existerait que pour ce test.
    const avertissements: string[] = [];
    const ecrire = process.stderr.write.bind(process.stderr);
    process.stderr.write = (ligne: string | Uint8Array) => {
      avertissements.push(ligne.toString());
      return true;
    };

    try {
      await abonnementCourant(abonne.id);
    } finally {
      process.stderr.write = ecrire;
    }

    expect(avertissements.join('')).toContain('Abonnement en anomalie');
  });

  it('concorde avec le droit d’accès réellement accordé', async () => {
    // Le moteur de droits comparait déjà les dates : cette fonction ne corrige
    // pas une faille, elle corrige un AFFICHAGE. Les deux doivent dire la même
    // chose, sans quoi l'écran mentirait sur ce que l'utilisateur peut lire.
    await souscrireAvecEssai();
    await appliquerEvenement(
      { userId: abonne.id, evenement: 'annule' },
      { clock: new FixedClock(jours(2)) },
    );

    const acces = await getAccess(abonne.id, livreAbonnement, { at: jours(10) });

    expect(await effectif(jours(10))).toBe('expire');
    expect(acces.canRead).toBe(false);
  });
});

describe('durée d’essai figée sur l’abonnement', () => {
  it('est recopiée à la souscription', async () => {
    await souscrireAvecEssai();

    const ligne = await queryOne<{ jours_essai: number }>(
      `select jours_essai from public.subscriptions where user_id = $1`,
      [abonne.id],
    );
    expect(ligne?.jours_essai).toBe(7);
  });

  it('NE SUIT PAS un changement du réglage global', async () => {
    // Même principe que `order_items.prix_unitaire` : sans cette copie, ramener
    // le réglage de 7 à 3 jours prélèverait au troisième jour un abonné à qui
    // sept ont été promis. C'est un bug de facturation, pas un changement de
    // configuration.
    await souscrireAvecEssai();

    await query(`update public.business_settings set jours_essai = 3 where id = 1`);
    try {
      const ligne = await queryOne<{ jours_essai: number }>(
        `select jours_essai from public.subscriptions where user_id = $1`,
        [abonne.id],
      );
      expect(ligne?.jours_essai).toBe(7);
    } finally {
      await query(`update public.business_settings set jours_essai = 7 where id = 1`);
    }
  });

  it('reste à zéro pour une souscription sans essai', async () => {
    await appliquerEvenement(
      {
        userId: abonne.id,
        evenement: 'souscrit',
        offre: 'mensuel',
        joursEssai: 0,
      },
      { clock: new FixedClock(DEPART) },
    );

    const ligne = await queryOne<{ statut: string; jours_essai: number }>(
      `select statut, jours_essai from public.subscriptions where user_id = $1`,
      [abonne.id],
    );
    expect(ligne?.statut).toBe('actif');
    expect(ligne?.jours_essai).toBe(0);
  });
});

describe('transitions refusées', () => {
  it('refuse une seconde souscription', async () => {
    await souscrireAvecEssai();
    const seconde = await souscrireAvecEssai();

    expect(seconde.ok).toBe(false);
    expect(!seconde.ok && seconde.raison).toBe('deja_souscrit');

    const nb = await query(`select 1 from public.subscriptions where user_id = $1`, [abonne.id]);
    expect(nb).toHaveLength(1);
  });

  it('refuse de renouveler un abonnement annulé', async () => {
    await souscrireAvecEssai();
    await appliquerEvenement(
      { userId: abonne.id, evenement: 'annule' },
      { clock: new FixedClock(jours(2)) },
    );

    const renouvellement = await appliquerEvenement(
      { userId: abonne.id, evenement: 'renouvele' },
      { clock: new FixedClock(jours(3)) },
    );

    expect(renouvellement.ok).toBe(false);
    expect(!renouvellement.ok && renouvellement.raison).toBe('annulation_definitive');
  });
});

describe('routes', () => {
  it('exigent un compte connecté', async () => {
    expect((await lireAbonnement(get('/api/subscriptions'))).status).toBe(401);
    expect((await souscrire(postJson('/api/subscriptions', { offre: 'mensuel' }))).status).toBe(401);
  });

  it('rendent l’état courant, et rappellent que le téléchargement n’est pas inclus', async () => {
    await souscrireAvecEssai();

    const corps = await corpsJson<{
      abonnement: { statut: string; zone: string } | null;
      donne_telechargement: boolean;
    }>(await lireAbonnement(get('/api/subscriptions', { jeton: abonne.accessToken })));

    expect(corps.abonnement?.statut).toBe('essai');
    // La confusion la plus coûteuse du projet, désamorcée dans la réponse même.
    expect(corps.donne_telechargement).toBe(false);
  });

  it('rendent `null` quand il n’y a pas d’abonnement', async () => {
    const corps = await corpsJson<{ abonnement: null }>(
      await lireAbonnement(get('/api/subscriptions', { jeton: abonne.accessToken })),
    );

    expect(corps.abonnement).toBeNull();
  });

  it('la souscription N’ACTIVE RIEN par elle-même', async () => {
    // §9.1 — « Ne jamais activer un abonnement sur la seule base d'une
    // redirection navigateur, qui peut être falsifiée. »
    const reponse = await souscrire(
      postJson('/api/subscriptions', { offre: 'mensuel' }, { jeton: abonne.accessToken }),
    );

    expect(reponse.status).toBe(200);
    const corps = await corpsJson<{ statut: string }>(reponse);
    expect(corps.statut).toBe('en_attente_paiement');

    // Rien en base : c'est le webhook signé qui créera la ligne.
    const lignes = await query(`select 1 from public.subscriptions where user_id = $1`, [abonne.id]);
    expect(lignes).toHaveLength(0);
  });

  it('refusent une souscription quand un abonnement est déjà en cours', async () => {
    await souscrireAvecEssai();

    const reponse = await souscrire(
      postJson('/api/subscriptions', { offre: 'mensuel' }, { jeton: abonne.accessToken }),
    );

    expect(reponse.status).toBe(409);
  });

  it('l’annulation ne change PAS le statut en base', async () => {
    // Elle demande au prestataire ; c'est l'événement signé qui suit qui
    // annule réellement.
    await souscrireAvecEssai();

    const reponse = await annuler(
      new Request('http://localhost:3000/api/subscriptions', {
        method: 'DELETE',
        headers: { authorization: `Bearer ${abonne.accessToken}` },
      }),
    );

    expect(reponse.status).toBe(200);
    const enBase = await queryOne<{ statut: string }>(
      `select statut from public.subscriptions where user_id = $1`,
      [abonne.id],
    );
    expect(enBase?.statut).toBe('essai');
  });

  it('l’annulation annonce jusqu’à quand l’accès est maintenu', async () => {
    await souscrireAvecEssai();

    const corps = await corpsJson<{ acces_maintenu_jusqu_au: string }>(
      await annuler(
        new Request('http://localhost:3000/api/subscriptions', {
          method: 'DELETE',
          headers: { authorization: `Bearer ${abonne.accessToken}` },
        }),
      ),
    );

    expect(new Date(corps.acces_maintenu_jusqu_au).getTime()).toBeGreaterThan(Date.now());
  });

  it('refusent d’annuler sans abonnement', async () => {
    const reponse = await annuler(
      new Request('http://localhost:3000/api/subscriptions', {
        method: 'DELETE',
        headers: { authorization: `Bearer ${abonne.accessToken}` },
      }),
    );

    expect(reponse.status).toBe(409);
  });
});

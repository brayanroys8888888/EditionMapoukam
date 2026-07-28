import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { closePool, query, queryOne } from '../helpers/db';
import { createTestUser, deleteTestUser, type TestUser } from '../helpers/users';

/**
 * MOTEUR DE DROITS D'ACCÈS — la matrice qui fait foi.
 *
 * Ce module concentre le risque du projet : une erreur ici, et le modèle
 * économique s'effondre dans un sens (contenu payant offert) ou dans l'autre
 * (client qui a payé et n'accède à rien).
 *
 * La séparation centrale, rappelée par CLAUDE.md : l'abonnement donne la
 * LECTURE EN LIGNE, jamais le TÉLÉCHARGEMENT. Toute confusion entre les deux
 * est un bug critique.
 *
 * Les cas temporels sont éprouvés en déplaçant l'instant passé à la fonction,
 * jamais en attendant.
 */
interface Acces {
  can_read: boolean;
  can_download: boolean;
  reason: string;
}

let abonneActif: TestUser;
let abonneExpire: TestUser;
let acheteur: TestUser;
let administrateur: TestUser;

/** Décision d'accès sur un titre du jeu de démonstration, désigné par son slug. */
async function acces(userId: string | null, slug: string, instant?: string): Promise<Acces> {
  const ligne = await queryOne<Acces>(
    `select (public.access_for($1, b.id, coalesce($3::timestamptz, public.app_now()))).*
     from public.books b where b.slug = $2`,
    [userId, slug, instant ?? null],
  );
  if (!ligne) throw new Error(`Titre introuvable dans le jeu de démonstration : ${slug}`);
  return ligne;
}

async function donnerAbonnement(
  user: TestUser,
  statut: string,
  options: { finDansJours?: number; impayeDepuisJours?: number } = {},
): Promise<void> {
  await query(
    `insert into public.subscriptions
       (user_id, offre, statut, debut_periode, fin_periode, zone, devise, montant, impaye_depuis)
     values (
       $1, 'mensuel', $2::public.subscription_status,
       public.app_now() - interval '30 days',
       public.app_now() + make_interval(days => $3::int),
       'international', 'EUR', 799,
       case when $4::int is null then null
            else public.app_now() - make_interval(days => $4::int) end
     )`,
    [user.id, statut, options.finDansJours ?? 30, options.impayeDepuisJours ?? null],
  );
}

async function donnerAchat(user: TestUser, slug: string): Promise<void> {
  const commande = await queryOne<{ id: string }>(
    `insert into public.orders (user_id, montant_total, devise, zone, statut, paye_le)
     values ($1, 499, 'EUR', 'international', 'paye', public.app_now()) returning id`,
    [user.id],
  );
  await query(
    `insert into public.entitlements (user_id, book_id, type, source_id, peut_telecharger)
     values ($1, (select id from public.books where slug = $2), 'achat', $3, true)`,
    [user.id, slug, commande?.id],
  );
}

async function donnerOctroi(user: TestUser, slug: string, telechargeable: boolean): Promise<void> {
  await query(
    `insert into public.entitlements (user_id, book_id, type, peut_telecharger)
     values ($1, (select id from public.books where slug = $2), 'offert', $3)`,
    [user.id, slug, telechargeable],
  );
}

beforeAll(async () => {
  [abonneActif, abonneExpire, acheteur, administrateur] = await Promise.all([
    createTestUser(),
    createTestUser(),
    createTestUser(),
    createTestUser({ admin: true }),
  ]);

  await donnerAbonnement(abonneActif, 'actif');
  await donnerAbonnement(abonneExpire, 'expire', { finDansJours: -10 });
  await donnerAchat(abonneExpire, 'le-lion-et-la-souris');
  await donnerAchat(acheteur, 'la-tortue-et-le-lapin');
});

afterAll(async () => {
  await deleteTestUser(abonneActif);
  await deleteTestUser(abonneExpire);
  await deleteTestUser(acheteur);
  await deleteTestUser(administrateur);
  await closePool();
});

// ---------------------------------------------------------------------------
// Les neuf cas obligatoires
// ---------------------------------------------------------------------------

describe('matrice obligatoire', () => {
  it('abonné actif + titre inclus dans l’abonnement → lecture OUI, téléchargement NON', async () => {
    // La règle centrale du projet : l'abonnement ne donne jamais le
    // téléchargement (§3.2).
    expect(await acces(abonneActif.id, 'le-lion-et-la-souris')).toEqual({
      can_read: true,
      can_download: false,
      reason: 'subscription',
    });
  });

  it('abonné actif + titre non inclus → lecture NON, téléchargement NON', async () => {
    expect(await acces(abonneActif.id, 'la-tortue-et-le-lapin')).toEqual({
      can_read: false,
      can_download: false,
      reason: 'preview',
    });
  });

  it('abonnement expiré + titre acheté → lecture OUI, téléchargement OUI', async () => {
    // LE BUG CLASSIQUE de ce type de plateforme : une expiration d'abonnement
    // qui emporterait les achats. Test dédié, exigé par CLAUDE.md.
    expect(await acces(abonneExpire.id, 'le-lion-et-la-souris')).toEqual({
      can_read: true,
      can_download: true,
      reason: 'purchase',
    });
  });

  it('abonnement expiré + titre non acheté → lecture NON, téléchargement NON', async () => {
    expect(await acces(abonneExpire.id, 'anansi-l-araignee-maligne')).toEqual({
      can_read: false,
      can_download: false,
      reason: 'preview',
    });
  });

  it('titre acheté, jamais abonné → lecture OUI, téléchargement OUI', async () => {
    expect(await acces(acheteur.id, 'la-tortue-et-le-lapin')).toEqual({
      can_read: true,
      can_download: true,
      reason: 'purchase',
    });
  });

  it('visiteur non connecté → extrait uniquement', async () => {
    expect(await acces(null, 'le-lion-et-la-souris')).toEqual({
      can_read: false,
      can_download: false,
      reason: 'preview',
    });
  });

  it('titre publié il y a moins de 3 mois → hors abonnement, même pour un abonné actif', async () => {
    // La fenêtre de vente exclusive (§3.2) : c'est elle qui donne une raison
    // d'acheter plutôt que d'attendre.
    expect(await acces(abonneActif.id, 'l-oiseau-de-feu')).toEqual({
      can_read: false,
      can_download: false,
      reason: 'preview',
    });
  });

  it('titre publié il y a plus de 3 mois → inclus dans l’abonnement', async () => {
    expect(await acces(abonneActif.id, 'anansi-l-araignee-maligne')).toEqual({
      can_read: true,
      can_download: false,
      reason: 'subscription',
    });
  });

  it('droit octroyé manuellement par un admin → lecture OUI', async () => {
    const beneficiaire = await createTestUser();
    try {
      await donnerOctroi(beneficiaire, 'anansi-l-araignee-maligne', false);

      expect(await acces(beneficiaire.id, 'anansi-l-araignee-maligne')).toEqual({
        can_read: true,
        can_download: false,
        reason: 'granted',
      });
    } finally {
      await deleteTestUser(beneficiaire);
    }
  });

  it('droit octroyé avec téléchargement → lecture ET téléchargement', async () => {
    const beneficiaire = await createTestUser();
    try {
      await donnerOctroi(beneficiaire, 'anansi-l-araignee-maligne', true);

      expect(await acces(beneficiaire.id, 'anansi-l-araignee-maligne')).toEqual({
        can_read: true,
        can_download: true,
        reason: 'granted',
      });
    } finally {
      await deleteTestUser(beneficiaire);
    }
  });
});

// ---------------------------------------------------------------------------
// Titres gratuits (docs/PLAN.md D3, D5)
// ---------------------------------------------------------------------------

describe('titres gratuits', () => {
  it('sont lisibles par un visiteur non connecté', async () => {
    expect(await acces(null, 'petit-baobab')).toEqual({
      can_read: true,
      can_download: false,
      reason: 'free',
    });
  });

  it('restent lisibles À L’INTÉRIEUR de leur fenêtre de vente de 3 mois', async () => {
    // `gratuit` prime sur les règles automatiques d'éligibilité (D3 point 1).
    // « la-riviere-qui-parlait » est publiée il y a 2 mois : sans ce
    // dépassement, elle serait hors abonnement ET illisible.
    expect(await acces(null, 'la-riviere-qui-parlait')).toEqual({
      can_read: true,
      can_download: false,
      reason: 'free',
    });
  });

  it('n’accordent jamais le téléchargement', async () => {
    const visiteur = await createTestUser();
    try {
      const decision = await acces(visiteur.id, 'petit-baobab');
      expect(decision.can_download).toBe(false);
    } finally {
      await deleteTestUser(visiteur);
    }
  });

  it('renvoient « purchase » et non « free » quand le titre a aussi été acheté', async () => {
    // Un acheteur ne doit JAMAIS voir « gratuit » : il a payé (D5).
    const client = await createTestUser();
    try {
      await donnerAchat(client, 'la-riviere-qui-parlait');

      expect(await acces(client.id, 'la-riviere-qui-parlait')).toEqual({
        can_read: true,
        can_download: true,
        reason: 'purchase',
      });
    } finally {
      await deleteTestUser(client);
    }
  });

  it('renvoient « subscription » quand l’abonnement ouvre aussi le droit', async () => {
    // « petit-baobab » est gratuit ET inclus ET hors fenêtre : l'abonnement est
    // un titre plus fort que la gratuité (D5).
    expect(await acces(abonneActif.id, 'petit-baobab')).toEqual({
      can_read: true,
      can_download: false,
      reason: 'subscription',
    });
  });

  it('renvoient « free » à un abonné quand l’abonnement n’ouvre pas le droit', async () => {
    // « la-riviere-qui-parlait » est encore dans sa fenêtre de vente : seule la
    // gratuité ouvre l'accès.
    expect(await acces(abonneActif.id, 'la-riviere-qui-parlait')).toEqual({
      can_read: true,
      can_download: false,
      reason: 'free',
    });
  });
});

// ---------------------------------------------------------------------------
// Cycle de vie de l'abonnement
// ---------------------------------------------------------------------------

describe('états de l’abonnement', () => {
  it('un essai en cours vaut un abonnement actif', async () => {
    const essayeur = await createTestUser();
    try {
      await donnerAbonnement(essayeur, 'essai', { finDansJours: 7 });

      expect(await acces(essayeur.id, 'le-lion-et-la-souris')).toMatchObject({
        can_read: true,
        can_download: false,
        reason: 'subscription',
      });
    } finally {
      await deleteTestUser(essayeur);
    }
  });

  it('un impayé conserve l’accès pendant la période de grâce', async () => {
    const impaye = await createTestUser();
    try {
      await donnerAbonnement(impaye, 'impaye', { finDansJours: -1, impayeDepuisJours: 3 });

      expect(await acces(impaye.id, 'le-lion-et-la-souris')).toMatchObject({
        can_read: true,
        reason: 'subscription',
      });
    } finally {
      await deleteTestUser(impaye);
    }
  });

  it('un impayé perd l’accès à l’issue de la période de grâce', async () => {
    const impaye = await createTestUser();
    try {
      await donnerAbonnement(impaye, 'impaye', { finDansJours: -1, impayeDepuisJours: 3 });

      // Sept jours de grâce : au huitième, l'accès tombe. Éprouvé en avançant
      // l'instant, jamais en attendant.
      const plusTard = await queryOne<{ t: string }>(
        `select (public.app_now() + interval '5 days')::text as t`,
      );
      expect(await acces(impaye.id, 'le-lion-et-la-souris', plusTard?.t)).toMatchObject({
        can_read: false,
        reason: 'preview',
      });
    } finally {
      await deleteTestUser(impaye);
    }
  });

  it('une annulation conserve l’accès jusqu’à la fin de la période payée', async () => {
    const annule = await createTestUser();
    try {
      await donnerAbonnement(annule, 'annule', { finDansJours: 10 });

      expect(await acces(annule.id, 'le-lion-et-la-souris')).toMatchObject({
        can_read: true,
        reason: 'subscription',
      });

      const apresPeriode = await queryOne<{ t: string }>(
        `select (public.app_now() + interval '11 days')::text as t`,
      );
      expect(await acces(annule.id, 'le-lion-et-la-souris', apresPeriode?.t)).toMatchObject({
        can_read: false,
        reason: 'preview',
      });
    } finally {
      await deleteTestUser(annule);
    }
  });

  it('un abonnement expiré n’ouvre aucun droit', async () => {
    expect(await acces(abonneExpire.id, 'anansi-l-araignee-maligne')).toMatchObject({
      can_read: false,
      reason: 'preview',
    });
  });

  it('un abonnement actif dont la période est échue n’ouvre plus rien', async () => {
    // Le renouvellement passe par un webhook. Tant qu'il n'est pas arrivé, la
    // période est échue et l'accès s'arrête, quel que soit le statut affiché.
    const lapse = await createTestUser();
    try {
      await donnerAbonnement(lapse, 'actif', { finDansJours: -1 });

      expect(await acces(lapse.id, 'le-lion-et-la-souris')).toMatchObject({ can_read: false });
    } finally {
      await deleteTestUser(lapse);
    }
  });
});

// ---------------------------------------------------------------------------
// Fenêtre de vente et déplacement du temps
// ---------------------------------------------------------------------------

describe('fenêtre de vente de 3 mois', () => {
  it('s’ouvre exactement au terme des 90 jours', async () => {
    // Abonnement de longue durée : déplacer l'instant au-delà de la fenêtre
    // dépasserait sinon la fin de période de l'abonné, et le test échouerait
    // pour une raison qui n'a rien à voir avec la fenêtre de vente.
    const abonneLongue = await createTestUser();
    try {
      await donnerAbonnement(abonneLongue, 'actif', { finDansJours: 3650 });

      const dans = async (jours: number) => {
        const instant = await queryOne<{ t: string }>(
          `select (public.app_now() + make_interval(days => $1::int))::text as t`,
          [jours],
        );
        return acces(abonneLongue.id, 'l-oiseau-de-feu', instant?.t);
      };

      // Publié il y a un mois : la fenêtre court encore une soixantaine de jours.
      expect((await dans(30)).can_read).toBe(false);
      expect((await dans(70)).can_read).toBe(true);
    } finally {
      await deleteTestUser(abonneLongue);
    }
  });

  it('ne s’applique pas à un titre non inclus dans l’abonnement', async () => {
    const loin = await queryOne<{ t: string }>(
      `select (public.app_now() + interval '5 years')::text as t`,
    );

    expect(await acces(abonneActif.id, 'la-tortue-et-le-lapin', loin?.t)).toMatchObject({
      can_read: false,
    });
  });
});

// ---------------------------------------------------------------------------
// Statut du titre
// ---------------------------------------------------------------------------

describe('titres hors catalogue', () => {
  it('un brouillon n’est lisible par personne, pas même en extrait', async () => {
    expect(await acces(abonneActif.id, 'le-lievre-et-la-tortue')).toEqual({
      can_read: false,
      can_download: false,
      reason: 'none',
    });
    expect(await acces(null, 'le-lievre-et-la-tortue')).toMatchObject({ reason: 'none' });
  });

  it('un titre archivé n’est plus offert à l’abonnement', async () => {
    expect(await acces(abonneActif.id, 'la-hyene-qui-voulait-changer')).toEqual({
      can_read: false,
      can_download: false,
      reason: 'none',
    });
  });

  it('un titre archivé RESTE accessible à qui l’a acheté', async () => {
    // §3.1 promet à l'acheteur un accès « sans limite de durée ». Retirer un
    // titre du catalogue est une décision éditoriale ; elle ne peut pas
    // révoquer un droit payé, ce serait un manquement au contrat de vente.
    const ancienClient = await createTestUser();
    try {
      await donnerAchat(ancienClient, 'la-hyene-qui-voulait-changer');

      expect(await acces(ancienClient.id, 'la-hyene-qui-voulait-changer')).toEqual({
        can_read: true,
        can_download: true,
        reason: 'purchase',
      });
    } finally {
      await deleteTestUser(ancienClient);
    }
  });

  it('un brouillon reste illisible même à qui détiendrait un droit', async () => {
    // Un titre en brouillon n'a jamais été vendu : un droit portant sur lui
    // serait une anomalie, et ne doit pas ouvrir l'accès.
    const curieux = await createTestUser();
    try {
      await donnerOctroi(curieux, 'le-lievre-et-la-tortue', true);

      expect(await acces(curieux.id, 'le-lievre-et-la-tortue')).toEqual({
        can_read: false,
        can_download: false,
        reason: 'none',
      });
    } finally {
      await deleteTestUser(curieux);
    }
  });

  it('un administrateur lit tout, y compris les brouillons (§2.2)', async () => {
    expect(await acces(administrateur.id, 'le-lievre-et-la-tortue')).toMatchObject({
      can_read: true,
      can_download: true,
      reason: 'granted',
    });
  });
});

// ---------------------------------------------------------------------------
// Droits expirés
// ---------------------------------------------------------------------------

describe('droits à durée limitée', () => {
  it('un droit expiré n’ouvre plus rien', async () => {
    const invite = await createTestUser();
    try {
      await query(
        `insert into public.entitlements (user_id, book_id, type, peut_telecharger, expire_le)
         values ($1, (select id from public.books where slug = 'anansi-l-araignee-maligne'),
                 'offert', true, public.app_now() - interval '1 day')`,
        [invite.id],
      );

      expect(await acces(invite.id, 'anansi-l-araignee-maligne')).toMatchObject({
        can_read: false,
        can_download: false,
      });
    } finally {
      await deleteTestUser(invite);
    }
  });

  it('un droit dont l’expiration approche reste valable', async () => {
    const invite = await createTestUser();
    try {
      await query(
        `insert into public.entitlements (user_id, book_id, type, peut_telecharger, expire_le)
         values ($1, (select id from public.books where slug = 'anansi-l-araignee-maligne'),
                 'offert', false, public.app_now() + interval '1 hour')`,
        [invite.id],
      );

      expect(await acces(invite.id, 'anansi-l-araignee-maligne')).toMatchObject({
        can_read: true,
        reason: 'granted',
      });
    } finally {
      await deleteTestUser(invite);
    }
  });
});

// ---------------------------------------------------------------------------
// Cohérence des deux formes de la fonction
// ---------------------------------------------------------------------------

describe('version unitaire et version par lot', () => {
  it('donnent exactement les mêmes réponses sur tout le catalogue', async () => {
    // `access_for` n'est qu'un raccourci sur `access_for_books` : s'ils
    // divergeaient, il existerait deux implémentations des règles.
    const lot = await query<{ slug: string; can_read: boolean; can_download: boolean; reason: string }>(
      `select b.slug, a.can_read, a.can_download, a.reason::text
       from public.books b
       join public.access_for_books($1, array(select id from public.books)) a on a.book_id = b.id
       order by b.slug`,
      [abonneActif.id],
    );

    for (const attendu of lot) {
      const unitaire = await acces(abonneActif.id, attendu.slug);
      expect({ slug: attendu.slug, ...unitaire }).toEqual({
        slug: attendu.slug,
        can_read: attendu.can_read,
        can_download: attendu.can_download,
        reason: attendu.reason,
      });
    }
    expect(lot.length).toBe(10);
  });

  it('résout un lot de quarante titres en une seule requête', async () => {
    // Sans version par lot, l'affichage d'un catalogue déclencherait autant de
    // requêtes que de titres.
    const ids = await query<{ id: string }>(`select id from public.books`);
    const quarante = Array.from({ length: 40 }, (_, i) => ids[i % ids.length]?.id ?? '');

    const resultat = await query<{ book_id: string }>(
      `select book_id from public.access_for_books($1, $2::uuid[])`,
      [abonneActif.id, quarante],
    );

    // Les doublons sont dédupliqués : une décision par titre distinct.
    expect(resultat.length).toBe(ids.length);
  });

  it('renvoie une table vide pour un lot vide', async () => {
    const resultat = await query(`select * from public.access_for_books($1, '{}'::uuid[])`, [
      abonneActif.id,
    ]);

    expect(resultat).toEqual([]);
  });

  it('ignore un identifiant de livre inconnu', async () => {
    const resultat = await query(
      `select * from public.access_for_books($1, array['00000000-0000-0000-0000-000000000000'::uuid])`,
      [abonneActif.id],
    );

    expect(resultat).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Paramètres métier
// ---------------------------------------------------------------------------

describe('paramètres métier', () => {
  it('la base porte les valeurs de la spécification', async () => {
    const parametres = await queryOne<{ fenetre: number; grace: number }>(
      `select fenetre_nouveaute_jours as fenetre, periode_grace_jours as grace
       from public.business_settings where id = 1`,
    );

    // §3.2 : trois mois de vente exclusive. §9.1 : période de grâce.
    expect(parametres).toEqual({ fenetre: 90, grace: 7 });
  });

  it('concordent avec la configuration de l’application', async () => {
    // La base est l'autorité, parce qu'une politique RLS ne peut pas lire
    // l'environnement du processus. Si les deux divergeaient, l'application et
    // la base n'appliqueraient pas la même règle.
    const parametres = await queryOne<{ fenetre: number; grace: number }>(
      `select fenetre_nouveaute_jours as fenetre, periode_grace_jours as grace
       from public.business_settings where id = 1`,
    );

    expect(parametres?.fenetre).toBe(Number(process.env['NEW_RELEASE_WINDOW_DAYS'] ?? 90));
    expect(parametres?.grace).toBe(Number(process.env['PAYMENT_GRACE_PERIOD_DAYS'] ?? 7));
  });
});

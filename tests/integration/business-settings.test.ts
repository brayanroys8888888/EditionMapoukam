import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import {
  getBusinessSettings,
  invaliderCache,
  updateBusinessSettings,
} from '@/lib/settings/business-settings';

import { closePool, query, queryOne } from '../helpers/db';
import { anonClient, createTestUser, deleteTestUser, type TestUser } from '../helpers/users';

/**
 * Paramètres métier — source unique, bornée et tracée.
 *
 * Ces réglages ne sont pas de la configuration technique : allonger la période
 * de grâce maintient l'accès de comptes impayés, à la seconde, sans
 * déploiement ni migration. C'est du chiffre d'affaires qui change de nature
 * par une écriture d'une ligne.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ CE FICHIER PORTE AUSSI LA PREUVE DU RETRAIT DE LA FENÊTRE DE VENTE.      │
 * │                                                                          │
 * │ La fenêtre de trois mois est partie avec la migration 0064. Un retrait   │
 * │ ne se prouve pas en effaçant les tests qui le contredisaient : effacés,  │
 * │ ils laisseraient la porte ouverte à une réintroduction silencieuse.      │
 * │ Le troisième `describe` retourne donc chacune des anciennes assertions   │
 * │ et exige l'inverse — la colonne absente, les fonctions absentes, et      │
 * │ l'accès accordé SANS délai.                                             │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
let administrateur: TestUser;

beforeAll(async () => {
  administrateur = await createTestUser({ admin: true });
});

afterEach(async () => {
  // Retour aux valeurs de la spécification, quoi qu'ait fait le test.
  //
  // `abonnement_ouvert` vaut FAUX : §3.3 ferme l'abonnement tant que le
  // catalogue n'a pas atteint son seuil, et `routes-frontend` l'éprouve sur
  // cette même ligne. Un `true` posé ici ferait tomber ce fichier-là, sur un
  // message qui ne parlerait pas de paramètres métier.
  await query(
    `update public.business_settings
     set periode_grace_jours = 7, jours_essai = 7, abonnement_ouvert = false, maj_par = null
     where id = 1`,
  );
  await query(`delete from public.business_settings_audit where true`);
  invaliderCache();
});

afterAll(async () => {
  await deleteTestUser(administrateur);
  await closePool();
});

describe('source unique', () => {
  it('porte les valeurs de la spécification', async () => {
    const parametres = await getBusinessSettings({ forcerRelecture: true });

    // §9.1 : période de grâce de sept jours sur un prélèvement en échec.
    expect(parametres.periodeGraceJours).toBe(7);
  });

  it('n’a aucune valeur de repli en cas d’illisibilité', async () => {
    // Appliquer une période de grâce inventée reviendrait à ouvrir ou fermer
    // l'accès de comptes impayés au hasard.
    const casse = {
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: () => Promise.resolve({ data: null, error: { message: 'panne simulée' } }),
          }),
        }),
      }),
    } as never;

    await expect(getBusinessSettings({ client: casse, forcerRelecture: true })).rejects.toThrow(
      /Paramètres métier illisibles/,
    );
  });
});

describe('bornes appliquées par la base', () => {
  it('refuse une période de grâce au-delà de quatre-vingt-dix jours', async () => {
    // La contrainte tient même face à un appel direct, un script de reprise ou
    // une console : un formulaire d'administration, lui, se contourne.
    await expect(
      query(`update public.business_settings set periode_grace_jours = 120 where id = 1`),
    ).rejects.toThrow(/business_settings_grace_bornee/);
  });

  it('refuse une période de grâce négative', async () => {
    // Une valeur négative ne serait pas refusée par le moteur de droits : elle
    // se lirait comme une grâce déjà expirée avant même l'impayé.
    await expect(
      query(`update public.business_settings set periode_grace_jours = -1 where id = 1`),
    ).rejects.toThrow(/business_settings_grace_bornee/);
  });
});

describe('la fenêtre de vente exclusive de trois mois est RETIRÉE', () => {
  it('le réglage n’existe plus en base', async () => {
    // Une colonne laissée en place serait relue un jour par quelqu'un qui la
    // croirait encore appliquée.
    const colonne = await queryOne<{ nombre: string }>(
      `select count(*)::text as nombre
         from information_schema.columns
        where table_schema = 'public'
          and table_name = 'business_settings'
          and column_name = 'fenetre_nouveaute_jours'`,
    );

    expect(colonne?.nombre).toBe('0');
  });

  it('les trois fonctions qui la calculaient n’existent plus', async () => {
    // `fenetre_de_vente_ecoulee` était l'implémentation UNIQUE de la règle
    // (migration 0033). Tant qu'elle existe, elle peut être rappelée — et une
    // règle rappelée à un seul endroit est exactement la divergence que la
    // 0033 avait été écrite pour empêcher.
    const restes = await query<{ proname: string }>(
      `select proname from pg_proc
        where pronamespace = 'public'::regnamespace
          and proname in (
            'fenetre_de_vente_ecoulee',
            'titres_impactes_par_fenetre',
            'abonnement_a_partir_du'
          )`,
    );

    expect(restes).toEqual([]);
  });

  it('un titre publié il y a un mois est LU par un abonné, sans délai', async () => {
    // ┌────────────────────────────────────────────────────────────────────┐
    // │ L'ASSERTION EXACTEMENT INVERSE DE CELLE QU'A PORTÉE CE FICHIER.    │
    // │                                                                    │
    // │ « l-oiseau-de-feu » est publié il y a un mois. Sous la fenêtre de   │
    // │ quatre-vingt-dix jours, l'abonné ne pouvait pas le lire ; il le     │
    // │ pouvait dès que l'administration abaissait le réglage. Il n'y a     │
    // │ plus de réglage : être publié et marqué `inclus_abonnement` suffit. │
    // └────────────────────────────────────────────────────────────────────┘
    const abonne = await createTestUser();
    try {
      await query(
        `insert into public.subscriptions
           (user_id, offre, statut, debut_periode, fin_periode, zone, devise, montant)
         values ($1, 'annuel', 'actif', public.app_now(), public.app_now() + interval '1 year',
                 'international', 'EUR', 6900)`,
        [abonne.id],
      );

      const decision = await queryOne<{ can_read: boolean; can_download: boolean; reason: string }>(
        `select (public.access_for($1, b.id)).*
           from public.books b where b.slug = 'l-oiseau-de-feu'`,
        [abonne.id],
      );

      expect(decision?.can_read).toBe(true);
      expect(decision?.reason).toBe('subscription');
      // Le retrait de la fenêtre ne donne pas le téléchargement : celui-ci
      // reste accordé par l'achat seul, et rien d'autre.
      expect(decision?.can_download).toBe(false);
    } finally {
      await deleteTestUser(abonne);
    }
  });

  it('un titre HORS abonnement le reste : c’était un délai, pas un interrupteur', async () => {
    // La lecture fausse la plus probable du retrait : « tout le catalogue est
    // désormais dans l'abonnement ». `la-tortue-et-le-lapin` est publié,
    // vendu à l'unité, et `inclus_abonnement` y vaut faux.
    const abonne = await createTestUser();
    try {
      await query(
        `insert into public.subscriptions
           (user_id, offre, statut, debut_periode, fin_periode, zone, devise, montant)
         values ($1, 'annuel', 'actif', public.app_now(), public.app_now() + interval '1 year',
                 'international', 'EUR', 6900)`,
        [abonne.id],
      );

      const decision = await queryOne<{ can_read: boolean }>(
        `select (public.access_for($1, b.id)).can_read
           from public.books b where b.slug = 'la-tortue-et-le-lapin'`,
        [abonne.id],
      );

      expect(decision?.can_read).toBe(false);
    } finally {
      await deleteTestUser(abonne);
    }
  });

  it('le moteur de droits et le catalogue s’accordent sur « inclus dans l’abonnement »', async () => {
    // Les deux fonctions ont été modifiées par la même migration, et c'est
    // précisément le moment où deux copies d'une règle divergent. Le filtre
    // `acces=abonnement` de `catalog_list` doit rendre EXACTEMENT les titres
    // que `access_for_books` ouvre à un abonné.
    //
    // Un titre gratuit ET inclus dans l'abonnement compte des deux côtés :
    // le moteur donne `subscription` avant `free` quand l'abonnement ouvre le
    // droit. C'est l'ordre d'origine, il n'appartient pas à ce chantier.
    const abonne = await createTestUser();
    try {
      await query(
        `insert into public.subscriptions
           (user_id, offre, statut, debut_periode, fin_periode, zone, devise, montant)
         values ($1, 'annuel', 'actif', public.app_now(), public.app_now() + interval '1 year',
                 'international', 'EUR', 6900)`,
        [abonne.id],
      );

      const parLeMoteur = await query<{ slug: string }>(
        `select b.slug
           from public.books b
          where b.statut = 'publie'
            and (public.access_for($1, b.id)).reason = 'subscription'
          order by b.slug`,
        [abonne.id],
      );

      const parLeCatalogue = await query<{ slug: string }>(
        `select b.slug
           from public.books b
          where b.statut = 'publie'
            and b.inclus_abonnement
          order by b.slug`,
      );

      expect(parLeMoteur.map((l) => l.slug)).toEqual(parLeCatalogue.map((l) => l.slug));
      expect(parLeMoteur.length).toBeGreaterThan(0);
    } finally {
      await deleteTestUser(abonne);
    }
  });
});

describe('trace des modifications', () => {
  it('enregistre l’auteur, l’instant et les valeurs avant et après', async () => {
    await updateBusinessSettings({ periodeGraceJours: 21 }, administrateur.id);

    const trace = await queryOne<{
      modifie_par: string;
      modifie_le: string;
      avant: { periode_grace_jours: number };
      apres: { periode_grace_jours: number };
    }>(
      `select modifie_par, modifie_le, avant, apres
         from public.business_settings_audit order by modifie_le desc limit 1`,
    );

    expect(trace?.modifie_par).toBe(administrateur.id);
    expect(trace?.modifie_le).not.toBeNull();
    expect(trace?.avant.periode_grace_jours).toBe(7);
    expect(trace?.apres.periode_grace_jours).toBe(21);
  });

  it('ne trace pas une écriture sans changement de valeur', async () => {
    await updateBusinessSettings({ periodeGraceJours: 7 }, administrateur.id);

    const traces = await query(`select 1 from public.business_settings_audit`);
    expect(traces).toEqual([]);
  });

  it('couvre aussi l’essai gratuit et l’ouverture commerciale', async () => {
    // La 0064 a élargi la clause `when` du déclencheur en même temps qu'elle
    // retirait la fenêtre : retirer un levier ne devait pas RÉDUIRE ce qui est
    // journalisé. Ces deux-là ne l'étaient pas.
    await query(
      `update public.business_settings
          set jours_essai = 14, abonnement_ouvert = true, maj_par = $1 where id = 1`,
      [administrateur.id],
    );

    const trace = await queryOne<{
      avant: { jours_essai: number; abonnement_ouvert: boolean };
      apres: { jours_essai: number; abonnement_ouvert: boolean };
    }>(`select avant, apres from public.business_settings_audit order by modifie_le desc limit 1`);

    expect(trace?.avant.jours_essai).toBe(7);
    expect(trace?.apres.jours_essai).toBe(14);
    expect(trace?.avant.abonnement_ouvert).toBe(false);
    expect(trace?.apres.abonnement_ouvert).toBe(true);
  });

  it('n’est pas lisible par un client', async () => {
    const { data, error } = await anonClient().from('business_settings_audit').select('*');

    expect(error).not.toBeNull();
    expect(data).toBeNull();
  });
});

describe('effet rétroactif', () => {
  it('modifie instantanément l’accès, sans migration', async () => {
    // Le cœur du risque, déplacé de la fenêtre vers le réglage qui reste :
    // un abonnement impayé depuis dix jours est hors grâce sous sept jours,
    // et y rentre dès que l'administration porte le réglage à trente.
    const impaye = await createTestUser();
    try {
      await query(
        `insert into public.subscriptions
           (user_id, offre, statut, debut_periode, fin_periode, zone, devise, montant,
            impaye_depuis)
         values ($1, 'annuel', 'impaye',
                 public.app_now() - interval '1 year',
                 public.app_now() - interval '10 days',
                 'international', 'EUR', 6900,
                 public.app_now() - interval '10 days')`,
        [impaye.id],
      );

      const lire = async () =>
        (
          await queryOne<{ can_read: boolean }>(
            `select (public.access_for($1, b.id)).can_read
             from public.books b where b.slug = 'l-oiseau-de-feu'`,
            [impaye.id],
          )
        )?.can_read;

      expect(await lire()).toBe(false);

      await updateBusinessSettings({ periodeGraceJours: 30 }, administrateur.id);

      expect(await lire()).toBe(true);
    } finally {
      await deleteTestUser(impaye);
    }
  });
});

describe('lecture par le moteur de droits', () => {
  it('fonctionne pour un appelant anonyme', async () => {
    // `access_for` est `security definer` : elle lit `business_settings` en tant
    // que propriétaire, quel que soit le rôle appelant. Sans cela, retirer un
    // jour le privilège de lecture publique casserait l'accès des visiteurs.
    const { data, error } = await anonClient().rpc('access_for_books', {
      p_user: null as unknown as string,
      p_books: [
        (await queryOne<{ id: string }>(`select id from public.books where slug = 'petit-baobab'`))
          ?.id ?? '',
      ],
    });

    expect(error).toBeNull();
    expect(data).toMatchObject([{ can_read: true, reason: 'free' }]);
  });
});

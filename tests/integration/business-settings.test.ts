import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import {
  getBusinessSettings,
  invaliderCache,
  simulerChangementDeFenetre,
  updateBusinessSettings,
} from '@/lib/settings/business-settings';

import { closePool, query, queryOne } from '../helpers/db';
import { anonClient, createTestUser, deleteTestUser, type TestUser } from '../helpers/users';

/**
 * Paramètres métier — source unique, bornée et tracée.
 *
 * Ces réglages ne sont pas de la configuration technique : réduire la fenêtre
 * de nouveauté fait basculer, à la seconde, des titres vendus à l'unité vers la
 * lecture incluse. C'est du chiffre d'affaires qui change de nature sans
 * déploiement ni migration.
 */
let administrateur: TestUser;

beforeAll(async () => {
  administrateur = await createTestUser({ admin: true });
});

afterEach(async () => {
  // Retour aux valeurs de la spécification, quoi qu'ait fait le test.
  await query(
    `update public.business_settings
     set fenetre_nouveaute_jours = 90, periode_grace_jours = 7, maj_par = null where id = 1`,
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

    // §3.2 : trois mois de vente exclusive. §9.1 : période de grâce.
    expect(parametres.fenetreNouveauteJours).toBe(90);
    expect(parametres.periodeGraceJours).toBe(7);
  });

  it('n’a aucune valeur de repli en cas d’illisibilité', async () => {
    // Appliquer une fenêtre inventée reviendrait à ouvrir ou fermer
    // l'abonnement sur des titres au hasard.
    const casse = {
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: () => Promise.resolve({ data: null, error: { message: 'panne simulée' } }),
          }),
        }),
      }),
    } as never;

    await expect(
      getBusinessSettings({ client: casse, forcerRelecture: true }),
    ).rejects.toThrow(/Paramètres métier illisibles/);
  });
});

describe('bornes appliquées par la base', () => {
  it('refuse une fenêtre au-delà de deux ans', async () => {
    // La contrainte tient même face à un appel direct, un script de reprise ou
    // une console : un formulaire d'administration, lui, se contourne.
    await expect(
      query(`update public.business_settings set fenetre_nouveaute_jours = 900 where id = 1`),
    ).rejects.toThrow(/business_settings_fenetre_bornee/);
  });

  it('refuse une fenêtre négative', async () => {
    await expect(
      query(`update public.business_settings set fenetre_nouveaute_jours = -1 where id = 1`),
    ).rejects.toThrow(/business_settings_fenetre_bornee/);
  });

  it('accepte une fenêtre nulle : tout titre entre immédiatement', async () => {
    await expect(
      query(`update public.business_settings set fenetre_nouveaute_jours = 0 where id = 1`),
    ).resolves.toBeDefined();
  });

  it('refuse une période de grâce au-delà de quatre-vingt-dix jours', async () => {
    await expect(
      query(`update public.business_settings set periode_grace_jours = 120 where id = 1`),
    ).rejects.toThrow(/business_settings_grace_bornee/);
  });
});

describe('trace des modifications', () => {
  it('enregistre l’auteur, l’instant et les valeurs avant et après', async () => {
    await updateBusinessSettings({ fenetreNouveauteJours: 60 }, administrateur.id);

    const trace = await queryOne<{
      modifie_par: string;
      avant: { fenetre_nouveaute_jours: number };
      apres: { fenetre_nouveaute_jours: number };
    }>(`select modifie_par, avant, apres from public.business_settings_audit order by modifie_le desc limit 1`);

    expect(trace?.modifie_par).toBe(administrateur.id);
    expect(trace?.avant.fenetre_nouveaute_jours).toBe(90);
    expect(trace?.apres.fenetre_nouveaute_jours).toBe(60);
  });

  it('ne trace pas une écriture sans changement de valeur', async () => {
    await updateBusinessSettings({ fenetreNouveauteJours: 90 }, administrateur.id);

    const traces = await query(`select 1 from public.business_settings_audit`);
    expect(traces).toEqual([]);
  });

  it('n’est pas lisible par un client', async () => {
    const { data, error } = await anonClient().from('business_settings_audit').select('*');

    expect(error).not.toBeNull();
    expect(data).toBeNull();
  });
});

describe('effet rétroactif', () => {
  it('modifie instantanément l’accès, sans migration', async () => {
    // Le cœur du risque : « l-oiseau-de-feu » est publié il y a un mois, donc
    // hors abonnement sous une fenêtre de 90 jours. Passer la fenêtre à 10
    // jours l'y fait entrer immédiatement.
    const abonne = await createTestUser();
    try {
      await query(
        `insert into public.subscriptions
           (user_id, offre, statut, debut_periode, fin_periode, zone, devise, montant)
         values ($1, 'annuel', 'actif', public.app_now(), public.app_now() + interval '1 year',
                 'international', 'EUR', 6900)`,
        [abonne.id],
      );

      const lire = async () =>
        (
          await queryOne<{ can_read: boolean }>(
            `select (public.access_for($1, b.id)).can_read
             from public.books b where b.slug = 'l-oiseau-de-feu'`,
            [abonne.id],
          )
        )?.can_read;

      expect(await lire()).toBe(false);

      await updateBusinessSettings({ fenetreNouveauteJours: 10 }, administrateur.id);

      expect(await lire()).toBe(true);
    } finally {
      await deleteTestUser(abonne);
    }
  });

  it('se chiffre AVANT validation', async () => {
    // Sans ce compte, l'administrateur modifie une règle commerciale à
    // l'aveugle. L'écran de confirmation (étape 13) doit l'afficher.
    const impact = await simulerChangementDeFenetre(10);

    expect(impact.entrentDansAbonnement).toBeGreaterThan(0);
    expect(impact.sortentDeLAbonnement).toBe(0);
  });

  it('chiffre aussi les titres qui sortiraient de l’abonnement', async () => {
    // Allonger la fenêtre retire des titres de l'abonnement : c'est le sens
    // inverse, tout aussi lourd de conséquences pour les abonnés en cours.
    const impact = await simulerChangementDeFenetre(400);

    expect(impact.sortentDeLAbonnement).toBeGreaterThan(0);
    expect(impact.entrentDansAbonnement).toBe(0);
  });

  it('ne compte aucun titre quand la valeur ne change pas', async () => {
    const impact = await simulerChangementDeFenetre(90);

    expect(impact).toEqual({ entrentDansAbonnement: 0, sortentDeLAbonnement: 0 });
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

import { afterAll, describe, expect, it } from 'vitest';

import { closePool, getPool } from '../helpers/db';
import { anonClient } from '../helpers/users';
import { FixedClock } from '@/lib/clock/fixed-clock';
import { applyDevClock, clearDevClock, readDatabaseNow } from '@/lib/supabase/dev-clock-session';

/**
 * Horloge de la base — docs/PLAN.md §2.5.
 *
 * Le décalage d'horloge est le mécanisme qui permet de tester les fins de
 * période d'abonnement et la fenêtre de 3 mois sans attendre. C'est aussi, s'il
 * était mal gardé, un moyen de faire croire à la base qu'un abonnement expiré
 * est encore valide. Ces tests vérifient les deux faces.
 */
afterAll(async () => {
  await closePool();
});

describe('app_now() avec l’artefact d’activation', () => {
  it('honore le décalage demandé par le serveur', async () => {
    const client = await getPool().connect();
    try {
      const horloge = new FixedClock('2027-03-15T12:00:00.000Z');
      await applyDevClock(client, horloge);

      const vuParLaBase = await readDatabaseNow(client);

      expect(vuParLaBase.toISOString()).toBe('2027-03-15T12:00:00.000Z');
    } finally {
      await clearDevClock(client);
      client.release();
    }
  });

  it('revient à l’heure réelle quand le décalage est retiré', async () => {
    const client = await getPool().connect();
    try {
      await applyDevClock(client, new FixedClock('2027-03-15T12:00:00.000Z'));
      await clearDevClock(client);

      const ecart = Math.abs((await readDatabaseNow(client)).getTime() - Date.now());

      expect(ecart).toBeLessThan(5_000);
    } finally {
      client.release();
    }
  });

  it('ne fuit pas d’une connexion à l’autre', async () => {
    // Le décalage vaut pour une session. Deux requêtes HTTP concurrentes ne
    // doivent pas se contaminer.
    const decalee = await getPool().connect();
    const normale = await getPool().connect();
    try {
      await applyDevClock(decalee, new FixedClock('2028-01-01T00:00:00.000Z'));

      const ecart = Math.abs((await readDatabaseNow(normale)).getTime() - Date.now());

      expect(ecart).toBeLessThan(5_000);
    } finally {
      await clearDevClock(decalee);
      decalee.release();
      normale.release();
    }
  });
});

describe('app_now() SANS l’artefact d’activation (docs/PLAN.md §2.5 c)', () => {
  it('ignore le décalage et renvoie l’heure réelle', async () => {
    // Le durcissement central : en production, la table dev_clock_activation
    // est vide parce que les seeds n'y sont pas joués. L'override doit alors
    // être inopérant, quel que soit l'état du code applicatif.
    //
    // La suppression est faite dans une transaction annulée à la fin : la base
    // de développement en ressort intacte.
    const client = await getPool().connect();
    try {
      await client.query('begin');
      await client.query('delete from public.dev_clock_activation');
      await applyDevClock(client, new FixedClock('2029-06-01T00:00:00.000Z'));

      const vuParLaBase = await readDatabaseNow(client);
      const ecart = Math.abs(vuParLaBase.getTime() - Date.now());

      expect(vuParLaBase.getFullYear()).not.toBe(2029);
      expect(ecart).toBeLessThan(5_000);
    } finally {
      await client.query('rollback');
      await clearDevClock(client);
      client.release();
    }
  });

  it('honore de nouveau le décalage dès que l’artefact est présent', async () => {
    // Contre-épreuve : sans elle, le test précédent passerait même si le
    // mécanisme d'override était globalement cassé.
    const client = await getPool().connect();
    try {
      await applyDevClock(client, new FixedClock('2029-06-01T00:00:00.000Z'));

      expect((await readDatabaseNow(client)).getFullYear()).toBe(2029);
    } finally {
      await clearDevClock(client);
      client.release();
    }
  });

  it('laisse l’artefact en place après le test', async () => {
    const client = await getPool().connect();
    try {
      const { rows } = await client.query<{ n: string }>(
        'select count(*)::text as n from public.dev_clock_activation',
      );

      expect(rows[0]?.n).toBe('1');
    } finally {
      client.release();
    }
  });
});

describe('un client ne peut pas influencer app_now()', () => {
  it('renvoie l’heure réelle à un visiteur anonyme, malgré une session décalée ailleurs', async () => {
    const decalee = await getPool().connect();
    try {
      await applyDevClock(decalee, new FixedClock('2030-01-01T00:00:00.000Z'));

      const { data, error } = await anonClient().rpc('app_now');

      expect(error).toBeNull();
      const ecart = Math.abs(new Date(data as string).getTime() - Date.now());
      expect(ecart).toBeLessThan(60_000);
    } finally {
      await clearDevClock(decalee);
      decalee.release();
    }
  });
});

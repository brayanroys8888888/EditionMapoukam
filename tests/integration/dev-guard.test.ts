import { afterAll, afterEach, describe, expect, it } from 'vitest';

import { GET as etat } from '@/app/api/dev/state/route';
import { GET as horlogeLire, POST as horlogeAvancer, DELETE as horlogeReset } from '@/app/api/dev/clock/route';
import { GET as emails } from '@/app/api/dev/emails/route';
import { POST as evenements } from '@/app/api/dev/events/route';
import { POST as remiseAZero } from '@/app/api/dev/reset/route';
import PageDev from '@/app/dev/page';
import { consoleDisponible } from '@/lib/dev/guard';

import { closePool, query } from '../helpers/db';
import { postJson } from '../helpers/http';

/**
 * Garde-fou de la console de simulation.
 *
 * CLAUDE.md : « toutes les routes sous /dev sont inaccessibles si
 * NODE_ENV === 'production'. Un test doit le prouver. »
 *
 * Le refus est un 404 et non un 403 : en production, ces routes ne doivent pas
 * seulement être interdites, elles ne doivent pas exister. Un 403 confirmerait
 * à un visiteur qu'une console de simulation est déployée.
 */
const ENV_INITIAL = process.env['NODE_ENV'];

// `NODE_ENV` est déclaré en lecture seule par les types de Node. Le garde-fou,
// lui, lit `process.env` à l'exécution — c'est précisément ce qui le rend
// testable. La conversion assume cet écart entre le type et le comportement.
const environnement = process.env as Record<string, string | undefined>;

function simulerProduction(): void {
  environnement['NODE_ENV'] = 'production';
}

function retablirEnvironnement(): void {
  if (ENV_INITIAL === undefined) delete environnement['NODE_ENV'];
  else environnement['NODE_ENV'] = ENV_INITIAL;
}

afterEach(() => {
  retablirEnvironnement();
});

describe('en production', () => {
  it('rend toutes les routes d’API introuvables', async () => {
    simulerProduction();

    const reponses = await Promise.all([
      etat(),
      Promise.resolve(horlogeLire()),
      horlogeAvancer(postJson('/api/dev/clock', { jours: 1 })),
      Promise.resolve(horlogeReset()),
      Promise.resolve(emails()),
      evenements(postJson('/api/dev/events', { type: 'paiement.reussi', donnees: {} })),
      remiseAZero(),
    ]);

    expect(reponses.map((r) => r.status)).toEqual([404, 404, 404, 404, 404, 404, 404]);
  });

  it('ne divulgue rien dans le corps du refus', async () => {
    simulerProduction();

    const corps = await (await etat()).text();

    expect(corps).not.toMatch(/dev|simulation|console/i);
  });

  it('rend la page de la console introuvable', () => {
    simulerProduction();

    // `notFound()` interrompt le rendu en levant : c'est le mécanisme de Next
    // pour produire une 404, et le comportement attendu ici.
    expect(() => PageDev()).toThrow();
  });

  it('refuse même l’avance de l’horloge, qui fausserait les expirations', async () => {
    simulerProduction();

    const reponse = await horlogeAvancer(postJson('/api/dev/clock', { jours: 400 }));

    expect(reponse.status).toBe(404);
  });
});

describe('hors production', () => {
  it('déclare la console disponible', () => {
    expect(consoleDisponible()).toBe(true);
  });

  it('rend la page sans lever', () => {
    expect(() => PageDev()).not.toThrow();
  });

  it('expose l’état courant en lecture', async () => {
    const reponse = await etat();

    expect(reponse.status).toBe(200);
    const corps = (await reponse.json()) as { commandes: unknown[]; maintenant: string };
    expect(Array.isArray(corps.commandes)).toBe(true);
    expect(corps.maintenant).toMatch(/^\d{4}-/);
  });

  it('avance puis réinitialise l’horloge', async () => {
    const avant = (await (horlogeLire()).json()) as { maintenant: string };

    const apres = (await (
      await horlogeAvancer(postJson('/api/dev/clock', { jours: 30 }))
    ).json()) as { maintenant: string; decalageMs: number };

    expect(apres.decalageMs).toBe(30 * 86_400_000);
    expect(new Date(apres.maintenant).getTime()).toBeGreaterThan(
      new Date(avant.maintenant).getTime(),
    );

    const remis = (await (await Promise.resolve(horlogeReset())).json()) as { decalageMs: number };
    expect(remis.decalageMs).toBe(0);
  });

  it('refuse une avance d’horloge invalide', async () => {
    const reponse = await horlogeAvancer(postJson('/api/dev/clock', { jours: 'beaucoup' }));

    expect(reponse.status).toBe(400);
  });

  it('refuse un type d’événement inconnu', async () => {
    const reponse = await evenements(
      postJson('/api/dev/events', { type: 'paiement.magique', donnees: {} }),
    );

    expect(reponse.status).toBe(400);
  });

  it('liste les emails écrits sur disque', async () => {
    const reponse = await Promise.resolve(emails());

    expect(reponse.status).toBe(200);
    const corps = (await reponse.json()) as { emails: unknown[] };
    expect(Array.isArray(corps.emails)).toBe(true);
  });
});

describe('remise à zéro', () => {
  it('efface les données transactionnelles sans toucher au catalogue', async () => {
    const avant = await query<{ n: string }>(`select count(*)::text as n from public.books`);

    const reponse = await remiseAZero();

    expect(reponse.status).toBe(200);
    const apres = await query<{ n: string }>(`select count(*)::text as n from public.books`);
    expect(apres[0]?.n).toBe(avant[0]?.n);
  });

  it('refuse de s’exécuter si l’artefact de développement est absent', async () => {
    // Le garde-fou qui empêche cette fonction d'exister utilement sur une base
    // de production, où les seeds de développement ne sont pas joués.
    const client = await (await import('../helpers/db')).getPool().connect();
    try {
      await client.query('begin');
      await client.query('delete from public.dev_clock_activation');

      await expect(client.query('select public.dev_reset_demo_state()')).rejects.toThrow(
        /artefact d'activation de développement est absent/,
      );
    } finally {
      await client.query('rollback');
      client.release();
    }
  });
});

afterAll(async () => {
  await closePool();
});

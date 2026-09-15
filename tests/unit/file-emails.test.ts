import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Mailer, MessageMail } from '@/adapters/mail/types';
import { resetServerEnvCache } from '@/lib/config/env';

/**
 * LA FILE D'EMAILS EN PRODUCTION — le mailer configuré, et un envoi mené à terme.
 *
 * Constaté en production : la confirmation d'une commande payée a échoué sur
 * `ENOENT: mkdir '/var/task/.mails'`. `viderFile` prenait `new FileMailer()`
 * par défaut, sans jamais consulter `MAILER` — et `FileMailer` écrit sur un
 * disque qu'une fonction serverless n'a pas le droit d'écrire.
 *
 * Tout ce qui sort de la fonction est remplacé : le registre, `after()`, le
 * rendu des modèles, le client de base. Ce fichier n'éprouve que le câblage.
 */

const temoins = vi.hoisted(() => ({
  envois: [] as MessageMail[],
  marquages: [] as Record<string, unknown>[],
  afterRecu: null as null | (() => unknown),
  afterLeve: false,
}));

const mailerConfigure: Mailer = {
  nom: 'configure',
  envoyer: (message) => {
    temoins.envois.push(message);
    return Promise.resolve({ id: 'e1', envoyeLe: new Date(0) });
  },
};

vi.mock('@/adapters/registry', () => ({ getMailer: () => mailerConfigure }));

vi.mock('next/server', () => ({
  after: (tache: () => unknown) => {
    if (temoins.afterLeve) throw new Error('`after` was called outside a request scope');
    temoins.afterRecu = tache;
  },
}));

vi.mock('@/domain/emails/templates', () => ({
  rendre: () => ({ sujet: 'Votre commande', texte: 'Merci.', lien: '/fr/compte' }),
}));

vi.mock('@/lib/emails/html', () => ({ rendreHtml: () => Promise.resolve('<p>Merci.</p>') }));

const { viderFile, viderFileEnArrierePlan } = await import('@/lib/emails/file');

/** Un client qui sert UNE ligne en attente, et note les marquages. */
const client = {
  rpc: (nom: string, args: Record<string, unknown>) => {
    if (nom === 'emails_a_envoyer') {
      return Promise.resolve({
        data: [
          {
            id: 'ligne-1',
            modele: 'commande_confirmee',
            destinataire: 'parent@exemple.test',
            langue: 'fr',
            variables: {},
            user_id: null,
          },
        ],
        error: null,
      });
    }
    temoins.marquages.push({ nom, ...args });
    return Promise.resolve({ data: null, error: null });
  },
} as unknown as NonNullable<Parameters<typeof viderFile>[0]>['client'];

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://127.0.0.1:54321');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'cle-anonyme-de-test');
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'cle-de-service-de-test');
  vi.stubEnv('FAKE_WEBHOOK_SECRET', 'secret-de-test');
  vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://site.exemple');
  resetServerEnvCache();
  temoins.envois.length = 0;
  temoins.marquages.length = 0;
  temoins.afterRecu = null;
  temoins.afterLeve = false;
});

afterEach(() => {
  vi.unstubAllEnvs();
  resetServerEnvCache();
});

describe('viderFile — le mailer vient du registre', () => {
  it('sans mailer injecté, envoie par l’adaptateur CONFIGURÉ, jamais par FileMailer', async () => {
    const rapport = await viderFile({ client });

    expect(rapport).toEqual({ envoyes: 1, echoues: 0 });
    expect(temoins.envois.map((m) => m.destinataire)).toEqual(['parent@exemple.test']);
    expect(temoins.marquages).toEqual([
      { nom: 'marquer_email', p_id: 'ligne-1', p_envoye: true, p_erreur: null },
    ]);
  });
});

describe('viderFileEnArrierePlan — un envoi que l’hébergeur attend', () => {
  it('confie le vidage à `after()`, qui le mène à terme après la réponse', async () => {
    viderFileEnArrierePlan({ client });

    // Rien n'est parti tant que la réponse n'est pas envoyée…
    expect(temoins.afterRecu).not.toBeNull();
    expect(temoins.envois).toHaveLength(0);

    // …puis l'hébergeur exécute la tâche déclarée, jusqu'au bout.
    await temoins.afterRecu?.();
    expect(temoins.envois).toHaveLength(1);
  });

  it('hors d’une requête, `after()` lève : l’envoi part quand même, sans lever', async () => {
    temoins.afterLeve = true;

    expect(() => viderFileEnArrierePlan({ client })).not.toThrow();
    await vi.waitFor(() => expect(temoins.envois).toHaveLength(1));
  });
});

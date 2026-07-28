import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  getServerEnv,
  resetServerEnvCache,
  SIGNED_URL_TTL_FREE_MAX_SECONDS,
  SIGNED_URL_TTL_MAX_SECONDS,
} from '@/lib/config/env';

const MINIMAL_ENV: Record<string, string> = {
  NODE_ENV: 'test',
  NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321',
  NEXT_PUBLIC_SUPABASE_ANON_KEY: 'cle-anon-de-test',
  SUPABASE_SERVICE_ROLE_KEY: 'cle-service-role-de-test',
  DATABASE_URL: 'postgresql://postgres:postgres@127.0.0.1:54322/postgres',
  FAKE_WEBHOOK_SECRET: 'dev_local_webhook_secret',
  NEXT_PUBLIC_APP_URL: 'http://localhost:3000',
};

let saved: NodeJS.ProcessEnv;

/** Repart d'un environnement nu, pour que les tests ne dépendent pas du poste. */
function useEnv(overrides: Record<string, string | undefined> = {}): void {
  for (const key of Object.keys(process.env)) {
    if (key.startsWith('NEXT_PUBLIC_') || key in MINIMAL_ENV) {
      delete process.env[key];
    }
  }
  for (const [key, value] of Object.entries({ ...MINIMAL_ENV, ...overrides })) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
  resetServerEnvCache();
}

beforeEach(() => {
  saved = { ...process.env };
});

afterEach(() => {
  process.env = saved;
  resetServerEnvCache();
});

describe('getServerEnv', () => {
  it('accepte un environnement local complet', () => {
    useEnv();

    const env = getServerEnv();

    expect(env.PAYMENT_PROVIDER).toBe('fake');
    expect(env.MAILER).toBe('file');
    expect(env.MAIL_OUTPUT_DIR).toBe('.mails');
  });

  it('échoue franchement quand une variable obligatoire manque', () => {
    useEnv({ SUPABASE_SERVICE_ROLE_KEY: undefined });

    expect(() => getServerEnv()).toThrow(/SUPABASE_SERVICE_ROLE_KEY/);
  });

  it('échoue quand une URL est malformée', () => {
    useEnv({ NEXT_PUBLIC_SUPABASE_URL: 'ceci-n-est-pas-une-url' });

    expect(() => getServerEnv()).toThrow(/NEXT_PUBLIC_SUPABASE_URL/);
  });

  it('refuse un prestataire de paiement inconnu', () => {
    useEnv({ PAYMENT_PROVIDER: 'paypal' });

    expect(() => getServerEnv()).toThrow(/PAYMENT_PROVIDER/);
  });

  it('refuse un secret de webhook trop court', () => {
    useEnv({ FAKE_WEBHOOK_SECRET: 'court' });

    expect(() => getServerEnv()).toThrow(/FAKE_WEBHOOK_SECRET/);
  });

  it('applique les valeurs par défaut du métier', () => {
    useEnv();

    const env = getServerEnv();

    expect(env.NEW_RELEASE_WINDOW_DAYS).toBe(90);
    expect(env.PAYMENT_GRACE_PERIOD_DAYS).toBe(7);
  });
});

describe('plafonds des URL signées (CLAUDE.md règle 3, docs/PLAN.md D6)', () => {
  it('ramène la durée d’un contenu payant à 300 secondes', () => {
    useEnv({ SIGNED_URL_TTL: '86400' });

    expect(getServerEnv().SIGNED_URL_TTL).toBe(SIGNED_URL_TTL_MAX_SECONDS);
  });

  it('laisse passer une durée plus courte que le plafond', () => {
    useEnv({ SIGNED_URL_TTL: '60' });

    expect(getServerEnv().SIGNED_URL_TTL).toBe(60);
  });

  it('ramène la durée d’un titre gratuit à 3600 secondes', () => {
    useEnv({ SIGNED_URL_TTL_FREE: '999999' });

    expect(getServerEnv().SIGNED_URL_TTL_FREE).toBe(SIGNED_URL_TTL_FREE_MAX_SECONDS);
  });

  it('refuse une durée nulle ou négative', () => {
    useEnv({ SIGNED_URL_TTL: '0' });

    expect(() => getServerEnv()).toThrow(/SIGNED_URL_TTL/);
  });
});

describe('protection de la clé service_role (CLAUDE.md règle 2)', () => {
  it('refuse de démarrer si une variable NEXT_PUBLIC_* contient la clé de service', () => {
    useEnv({ NEXT_PUBLIC_LEAK: MINIMAL_ENV['SUPABASE_SERVICE_ROLE_KEY'] });

    expect(() => getServerEnv()).toThrow(/NEXT_PUBLIC_LEAK/);
  });
});

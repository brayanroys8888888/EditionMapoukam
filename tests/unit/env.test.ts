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

  it('applique les valeurs par défaut', () => {
    useEnv();

    const env = getServerEnv();

    expect(env.EXCERPT_PAGES_DEFAULT).toBe(3);
    expect(env.INVOICE_RETENTION_YEARS).toBe(10);
  });

  it('ne porte aucun réglage métier, même proposé par l’environnement', () => {
    // Source unique : la table `business_settings`. Les garder ici en aurait
    // fait une seconde source, vouée à diverger — et un test de concordance
    // n'aurait fait que constater la divergence une fois installée.
    useEnv({ NEW_RELEASE_WINDOW_DAYS: '30', PAYMENT_GRACE_PERIOD_DAYS: '1' });

    const cles = Object.keys(getServerEnv());

    expect(cles).not.toContain('NEW_RELEASE_WINDOW_DAYS');
    expect(cles).not.toContain('PAYMENT_GRACE_PERIOD_DAYS');
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

describe('interrupteur de connexion par Google', () => {
  it('est éteint par défaut', () => {
    // La pile locale doit tourner sans compte chez qui que ce soit : un défaut
    // qui exigerait des clés Google ferait échouer le démarrage de quiconque
    // clone le dépôt.
    useEnv({ AUTH_GOOGLE: undefined });

    expect(getServerEnv().AUTH_GOOGLE).toBe('desactive');
  });

  it('accepte `supabase` SANS exiger les clés Google', () => {
    // ┌────────────────────────────────────────────────────────────────────┐
    // │ Sous ce mode, le secret vit chez Supabase. L'exiger une seconde    │
    // │ fois ici ne protégerait rien et multiplierait les endroits d'où il │
    // │ peut fuiter.                                                        │
    // └────────────────────────────────────────────────────────────────────┘
    useEnv({ AUTH_GOOGLE: 'supabase' });

    expect(getServerEnv().AUTH_GOOGLE).toBe('supabase');
  });

  it('refuse `better-auth` quand un secret manque', () => {
    useEnv({ AUTH_GOOGLE: 'better-auth' });

    expect(() => getServerEnv()).toThrow(/GOOGLE_CLIENT_ID/);
  });

  it('refuse un secret de signature trop court', () => {
    // Sans base de données, l'état de l'échange voyage dans un cookie signé
    // par ce secret : court, il est falsifiable.
    useEnv({
      AUTH_GOOGLE: 'better-auth',
      GOOGLE_CLIENT_ID: 'un-client',
      GOOGLE_CLIENT_SECRET: 'un-secret',
      BETTER_AUTH_SECRET: 'trop-court',
    });

    expect(() => getServerEnv()).toThrow(/BETTER_AUTH_SECRET/);
  });

  it('accepte `better-auth` complet', () => {
    useEnv({
      AUTH_GOOGLE: 'better-auth',
      GOOGLE_CLIENT_ID: 'un-client',
      GOOGLE_CLIENT_SECRET: 'un-secret',
      BETTER_AUTH_SECRET: 'a'.repeat(32),
    });

    expect(getServerEnv().AUTH_GOOGLE).toBe('better-auth');
  });

  it('refuse une valeur inconnue', () => {
    useEnv({ AUTH_GOOGLE: 'google-one-tap' });

    expect(() => getServerEnv()).toThrow(/AUTH_GOOGLE/);
  });
});

describe('une variable VIDE vaut une variable ABSENTE', () => {
  /*
   * ┌──────────────────────────────────────────────────────────────────────┐
   * │ LE DÉFAUT QUI A FAIT SERVIR UNE PAGE D'ERREUR, PILE DOCKER MONTÉE.   │
   * │                                                                      │
   * │ Tous les hébergeurs transmettent des variables vides : un `.env` qui │
   * │ porte `CLE=` sans valeur, une console web au champ resté blanc, une  │
   * │ composition Docker qui recopie la ligne. Or `optional()` accepte     │
   * │ l'absence, jamais le vide — et une clé FACULTATIVE laissée vide      │
   * │ faisait échouer le démarrage, en se plaignant d'une longueur de      │
   * │ chaîne, alors que l'adaptateur concerné était éteint.                │
   * └──────────────────────────────────────────────────────────────────────┘
   */
  it('accepte les secrets facultatifs laissés vides', () => {
    useEnv({
      NOTCHPAY_PUBLIC_KEY: '',
      NOTCHPAY_PRIVATE_KEY: '',
      NOTCHPAY_HASH_KEY: '',
      GOOGLE_CLIENT_ID: '',
      GOOGLE_CLIENT_SECRET: '',
      RESEND_API_KEY: '',
      DATABASE_URL: '',
    });

    const env = getServerEnv();

    expect(env.NOTCHPAY_PUBLIC_KEY).toBeUndefined();
    expect(env.GOOGLE_CLIENT_ID).toBeUndefined();
    expect(env.RESEND_API_KEY).toBeUndefined();
    expect(env.DATABASE_URL).toBeUndefined();
  });

  it('traite une valeur faite d’espaces comme une absence', () => {
    useEnv({ NOTCHPAY_HASH_KEY: '   ' });

    expect(getServerEnv().NOTCHPAY_HASH_KEY).toBeUndefined();
  });

  it('REFUSE toujours une variable obligatoire laissée vide', () => {
    // Le contre-test : la tolérance ne vaut que pour le facultatif. Sans lui,
    // une clé de service effacée démarrerait comme si de rien n'était.
    useEnv({ SUPABASE_SERVICE_ROLE_KEY: '' });

    expect(() => getServerEnv()).toThrow(/SUPABASE_SERVICE_ROLE_KEY/);
  });

  it('sous `better-auth`, des clés vides donnent le message qui les NOMME', () => {
    // Avant, une clé vide produisait « Too small: expected string to have >=1
    // characters », qui n'oriente vers rien. Le refus explicite, lui, dit quoi
    // renseigner.
    useEnv({
      AUTH_GOOGLE: 'better-auth',
      GOOGLE_CLIENT_ID: '',
      GOOGLE_CLIENT_SECRET: '',
      BETTER_AUTH_SECRET: '',
    });

    expect(() => getServerEnv()).toThrow(/AUTH_GOOGLE=better-auth exige/);
  });

  it('distingue un secret de signature VIDE d’un secret trop COURT', () => {
    useEnv({
      AUTH_GOOGLE: 'better-auth',
      GOOGLE_CLIENT_ID: 'un-client',
      GOOGLE_CLIENT_SECRET: 'un-secret',
      BETTER_AUTH_SECRET: '',
    });

    // Vide : c'est le contrôle explicite qui parle, et il nomme la variable.
    expect(() => getServerEnv()).toThrow(/AUTH_GOOGLE=better-auth exige/);

    // Court mais présent : c'est le schéma qui refuse, sur la longueur.
    useEnv({
      AUTH_GOOGLE: 'better-auth',
      GOOGLE_CLIENT_ID: 'un-client',
      GOOGLE_CLIENT_SECRET: 'un-secret',
      BETTER_AUTH_SECRET: 'trop-court',
    });

    expect(() => getServerEnv()).toThrow(/BETTER_AUTH_SECRET/);
  });
});

describe('protection de la clé service_role (CLAUDE.md règle 2)', () => {
  it('refuse de démarrer si une variable NEXT_PUBLIC_* contient la clé de service', () => {
    useEnv({ NEXT_PUBLIC_LEAK: MINIMAL_ENV['SUPABASE_SERVICE_ROLE_KEY'] });

    expect(() => getServerEnv()).toThrow(/NEXT_PUBLIC_LEAK/);
  });
});

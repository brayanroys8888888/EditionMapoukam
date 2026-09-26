import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { NotchPayPaymentProvider } from '@/adapters/payment/notchpay/notchpay-payment-provider';

/**
 * ╔═══════════════════════════════════════════════════════════════════════════╗
 * ║ L'ADMINISTRATION LOCALE — un site relié à la base de PRODUCTION.          ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 *
 * `admin-local/lanceur.mjs` démarre le site sur un poste, relié à la vraie
 * base, pour déposer les contes que Vercel refuse (plus de 4,5 Mo). Ce qu'il
 * impose n'est pas du confort : chaque ligne ferme une porte sur de vrais
 * clients. Ces tests lisent le lanceur tel qu'il est écrit, et échouent si
 * l'une d'elles disparaît.
 */
const RACINE = process.cwd();
const lanceur = readFileSync(join(RACINE, 'admin-local', 'lanceur.mjs'), 'utf8');

describe('le lanceur de l’administration locale', () => {
  it('démarre en mode PRODUCTION — la console /dev y est fermée', () => {
    // En développement, `/dev` simule des paiements et déplace l'horloge :
    // reliée à la vraie base, elle toucherait de vrais clients.
    expect(lanceur).toContain("NODE_ENV: 'production'");
    expect(lanceur).toContain("lancer(['start'");
    expect(lanceur).not.toMatch(/lancer\(\[\s*'dev'/);
  });

  it('n’emploie JAMAIS le faux prestataire', () => {
    // Avec lui, `/api/paiement-simule` offrirait des contes dans la base
    // réelle à n'importe quel compte connecté sur ce poste.
    expect(lanceur).toContain("PAYMENT_PROVIDER: 'notchpay'");
    expect(lanceur).not.toMatch(/PAYMENT_PROVIDER:\s*'fake'/);
  });

  it('pose des clés Notch Pay factices, reconnues comme clés de TEST', () => {
    const cle = (nom: string): string => {
      const trouve = new RegExp(`${nom}: '([^']+)'`).exec(lanceur)?.[1];
      if (!trouve) throw new Error(`${nom} absente du lanceur`);
      return trouve;
    };

    // L'adaptateur refuse de démarrer sur une clé de production : s'il
    // accepte celles-ci, c'est qu'aucun paiement réel ne peut partir d'ici.
    expect(
      () =>
        new NotchPayPaymentProvider({
          clePublique: cle('NOTCHPAY_PUBLIC_KEY'),
          clePrivee: cle('NOTCHPAY_PRIVATE_KEY'),
          cleHachage: cle('NOTCHPAY_HASH_KEY'),
        }),
    ).not.toThrow();
    expect(lanceur).toContain("NOTCHPAY_AUTORISER_PRODUCTION: 'false'");
  });

  it('n’écoute que sur la boucle locale — le réseau du bureau n’y accède pas', () => {
    expect(lanceur).toContain("'-H', '127.0.0.1'");
  });

  it('ne parle à aucun service hors de Supabase', () => {
    expect(lanceur).toContain("MAILER: 'file'");
    expect(lanceur).toContain("AUTH_GOOGLE: 'desactive'");
  });

  it('relève le délai d’envoi, sans lequel un conte de 25 Mo échoue en fin de course', () => {
    expect(lanceur).toContain('delai-fetch.cjs');
    expect(lanceur).toContain('NODE_OPTIONS');
  });
});

describe('la construction séparée', () => {
  it('vit sous son propre dossier, jamais dans le `.next` d’un `next start` ordinaire', () => {
    const config = readFileSync(join(RACINE, 'next.config.ts'), 'utf8');
    expect(config).toContain("distDir: process.env['ADMIN_LOCAL_DIST_DIR'] || '.next'");
    expect(lanceur).toContain("ADMIN_LOCAL_DIST_DIR: DOSSIER_CONSTRUCTION");
  });

  it('ne réécrit pas `tsconfig.json`, qui reste celui de `npm run typecheck`', () => {
    const tsconfig = readFileSync(join(RACINE, 'tsconfig.json'), 'utf8');
    expect(tsconfig).not.toContain('admin-local');
  });
});

describe('le modèle de configuration versionné', () => {
  it('ne contient aucune clé réelle', () => {
    const modele = readFileSync(join(RACINE, 'admin-local', 'configuration.exemple.env'), 'utf8');
    // Les clés Supabase sont des JWT : elles commencent par `eyJ`.
    expect(modele).not.toMatch(/eyJ[A-Za-z0-9_-]{10,}/);
    expect(modele).not.toMatch(/sb_secret_/);
  });
});

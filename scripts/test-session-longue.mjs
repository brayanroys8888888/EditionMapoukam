#!/usr/bin/env node
/**
 * Éprouve une expiration RÉELLE de jeton d'accès.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ POURQUOI CETTE EXÉCUTION EST SÉPARÉE, ET POURQUOI CE N'EST PAS UN       │
 * │ CONTOURNEMENT DE LA PORTE.                                              │
 * │                                                                          │
 * │ `jwt_expiry` est un réglage de la PILE, pas du test : l'abaisser vaut    │
 * │ pour toute la base locale. À soixante secondes, les fichiers            │
 * │ d'intégration qui tiennent un même jeton pendant plusieurs minutes       │
 * │ échoueraient tous — et pour une raison qui n'a rien à voir avec ce       │
 * │ qu'ils vérifient.                                                        │
 * │                                                                          │
 * │ La suite ordinaire éprouve donc la REPRISE (tests/e2e/session-longue),   │
 * │ en rendant un jeton inacceptable sans attendre. Ce script éprouve        │
 * │ l'EXPIRATION elle-même, qui est l'hypothèse sur laquelle la reprise      │
 * │ repose.                                                                  │
 * │                                                                          │
 * │ Il est inscrit en §5 quater (S6) : à lancer avant une mise en            │
 * │ production, comme `npm run audit:epub`. Une dette assumée et écrite,     │
 * │ pas un oubli.                                                            │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const RACINE = process.cwd();
const CONFIG = join(RACINE, 'supabase', 'config.toml');

/** Durée de vie imposée pendant l'épreuve. GoTrue refuse en deçà d'une minute. */
const EXPIRATION_COURTE = 60;

const original = readFileSync(CONFIG, 'utf8');

function supabase(...args) {
  execFileSync(process.execPath, [join(RACINE, 'node_modules', 'supabase', 'bin', 'supabase'), ...args], {
    stdio: 'inherit',
  });
}

function restaurer() {
  writeFileSync(CONFIG, original, 'utf8');
  console.log('\nconfig.toml restauré.');
}

process.on('SIGINT', () => {
  restaurer();
  process.exit(130);
});

let code = 0;
try {
  const trouve = /^jwt_expiry\s*=\s*(\d+)/m.exec(original);
  if (!trouve) {
    throw new Error('jwt_expiry introuvable dans supabase/config.toml.');
  }
  console.log(`jwt_expiry : ${trouve[1]} s → ${String(EXPIRATION_COURTE)} s`);

  writeFileSync(
    CONFIG,
    original.replace(/^jwt_expiry\s*=\s*\d+/m, `jwt_expiry = ${String(EXPIRATION_COURTE)}`),
    'utf8',
  );

  console.log('Redémarrage de la pile locale…');
  supabase('stop');
  supabase('start');

  execFileSync(
    process.execPath,
    [
      join(RACINE, 'node_modules', 'vitest', 'vitest.mjs'),
      'run',
      '--config',
      'vitest.session.config.ts',
    ],
    { stdio: 'inherit', env: { ...process.env, EXPIRATION_JETON_SECONDES: String(EXPIRATION_COURTE) } },
  );
} catch (erreur) {
  code = 1;
  console.error(`\nÉchec : ${erreur instanceof Error ? erreur.message : String(erreur)}`);
} finally {
  restaurer();
  try {
    console.log('Redémarrage avec la configuration d’origine…');
    supabase('stop');
    supabase('start');
  } catch {
    console.error(
      'ATTENTION : la pile n’a pas pu être redémarrée. Lancez `supabase start` avant `npm run verify`.',
    );
    code = 1;
  }
}

process.exit(code);

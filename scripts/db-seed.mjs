#!/usr/bin/env node
/**
 * Rejoue `supabase/seed.sql` sur la base locale.
 *
 * `npm run db:reset` réinitialise la base et rejoue les seeds. Ce script sert
 * au cas plus courant : réappliquer le jeu de démonstration sans détruire la
 * base. Il utilise `pg` plutôt que `psql`, qui n'est pas installé partout.
 */
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { config } from 'dotenv';
import pg from 'pg';

const root = process.cwd();
const envPath = join(root, '.env.local');

if (!existsSync(envPath)) {
  console.error(
    '.env.local est absent. Lancez `npm run supabase:start`, puis copiez .env.example en .env.local.',
  );
  process.exit(1);
}

config({ path: envPath, quiet: true });

const seedPath = join(root, 'supabase', 'seed.sql');
if (!existsSync(seedPath)) {
  console.log('Aucun fichier supabase/seed.sql : rien à faire (il arrive à l’étape 1).');
  process.exit(0);
}

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('DATABASE_URL est absent de .env.local.');
  process.exit(1);
}

const client = new pg.Client({ connectionString });

try {
  await client.connect();
  await client.query(readFileSync(seedPath, 'utf8'));
  console.log('Jeu de démonstration appliqué.');
} catch (error) {
  console.error(`Échec de l’application des seeds : ${error.message}`);
  process.exitCode = 1;
} finally {
  await client.end();
}

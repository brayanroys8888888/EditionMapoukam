#!/usr/bin/env node
/**
 * Purge des pièces comptables dont la durée de conservation est échue.
 *
 * Conserver indéfiniment est une infraction au même titre que ne pas
 * conserver assez longtemps. Cette tâche est destinée à être planifiée
 * (quotidiennement suffit) ; elle est aussi déclenchable à la main depuis la
 * console de simulation, qui pourra avancer l'horloge pour l'éprouver.
 *
 * Ordre imposé par les dépendances : la facture, puis la commande devenue sans
 * facture, puis le compte anonymisé devenu orphelin.
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { config } from 'dotenv';
import pg from 'pg';

const envPath = join(process.cwd(), '.env.local');
if (!existsSync(envPath)) {
  console.error('.env.local est absent.');
  process.exit(1);
}
config({ path: envPath, quiet: true });

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('DATABASE_URL est absent de .env.local.');
  process.exit(1);
}

const client = new pg.Client({ connectionString });

try {
  await client.connect();
  const { rows } = await client.query('select * from public.purge_expired_invoices()');
  const rapport = rows[0] ?? {};
  console.log(
    `Purge terminée — factures : ${rapport.factures_supprimees ?? 0}, ` +
      `commandes : ${rapport.commandes_supprimees ?? 0}, ` +
      `comptes anonymisés devenus orphelins : ${rapport.comptes_supprimes ?? 0}.`,
  );
} catch (error) {
  console.error(`Échec de la purge : ${error.message}`);
  process.exitCode = 1;
} finally {
  await client.end();
}

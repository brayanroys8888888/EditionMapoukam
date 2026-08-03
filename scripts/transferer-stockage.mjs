#!/usr/bin/env node
/**
 * TRANSFERT DU STOCKAGE — de la pile locale vers un projet hébergé.
 *
 * ┌────────────────────────────────────────────────────────────────────────────┐
 * │ POURQUOI CE SCRIPT EXISTE.                                                 │
 * │                                                                            │
 * │ `supabase db push` transporte le SCHÉMA, et `seed.sql` les MÉTADONNÉES.    │
 * │ Ni l'un ni l'autre ne transporte un seul octet de contenu : les pages de   │
 * │ contes et les fichiers téléchargeables vivent dans le stockage, que rien   │
 * │ ne synchronise.                                                            │
 * │                                                                            │
 * │ Sans lui, un déploiement affiche un catalogue dont aucune page ne s'ouvre  │
 * │ et aucun fichier ne se télécharge — la base dit que le conte existe, le    │
 * │ stockage dit le contraire.                                                 │
 * └────────────────────────────────────────────────────────────────────────────┘
 *
 * Il est IDEMPOTENT : un objet déjà présent à destination est ignoré, ce qui
 * permet de relancer après une coupure sans tout retransférer.
 *
 * Le bucket `book-sources` n'est PAS transféré : il contient les PDF d'origine,
 * qui n'ont aucune raison de quitter la machine d'ingestion.
 *
 *     node scripts/transferer-stockage.mjs [--sec]
 *
 *         --sec   n'écrit rien, énumère seulement ce qui serait transféré
 */
import { Buffer } from 'node:buffer';

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';

config({ path: '.env.local', quiet: true });
const SOURCE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SOURCE_CLE = process.env.SUPABASE_SERVICE_ROLE_KEY;

config({ path: '.env.production.local', override: true, quiet: true });
const CIBLE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const CIBLE_CLE = process.env.SUPABASE_SERVICE_ROLE_KEY;

const secheresse = process.argv.includes('--sec');

/** Les deux buckets de contenu. `covers` est public et se régénère ; `book-sources` reste ici. */
const BUCKETS = ['book-pages', 'book-downloads'];

if (!SOURCE_URL || !SOURCE_CLE) {
  console.error('.env.local incomplet : la pile locale doit être démarrée.');
  process.exit(1);
}
if (!CIBLE_URL || !CIBLE_CLE) {
  console.error('.env.production.local incomplet : URL et clé de service du projet hébergé.');
  process.exit(1);
}
if (SOURCE_URL === CIBLE_URL) {
  // Garde-fou : sans elle, une erreur de fichier ferait recopier la source sur
  // elle-même, ce qui passerait pour un succès.
  console.error('Source et cible sont identiques. Rien à transférer.');
  process.exit(1);
}

const source = createClient(SOURCE_URL, SOURCE_CLE, { auth: { persistSession: false } });
const cible = createClient(CIBLE_URL, CIBLE_CLE, { auth: { persistSession: false } });

/**
 * Énumère RÉCURSIVEMENT les objets d'un bucket.
 *
 * L'API ne liste qu'un niveau à la fois : sans récursion, on ne verrait que les
 * dossiers de premier rang — et le transfert rendrait « 8 objets » là où il y
 * en a 348.
 */
async function lister(client, bucket, prefixe = '') {
  const trouves = [];
  let decalage = 0;

  for (;;) {
    const { data, error } = await client.storage
      .from(bucket)
      .list(prefixe, { limit: 100, offset: decalage });

    if (error) throw new Error(`Lecture de ${bucket}/${prefixe} : ${error.message}`);
    if (!data || data.length === 0) break;

    for (const entree of data) {
      const chemin = prefixe ? `${prefixe}/${entree.name}` : entree.name;
      // Un dossier n'a pas de métadonnées ; un fichier en a toujours.
      if (entree.id === null || entree.metadata === null) {
        trouves.push(...(await lister(client, bucket, chemin)));
      } else {
        trouves.push({ chemin, taille: entree.metadata?.size ?? 0 });
      }
    }

    if (data.length < 100) break;
    decalage += data.length;
  }

  return trouves;
}

let transferes = 0;
let ignores = 0;
let echecs = 0;

for (const bucket of BUCKETS) {
  const aTransferer = await lister(source, bucket);
  const dejaLa = new Set((await lister(cible, bucket)).map((o) => o.chemin));

  console.log(
    `\n${bucket} : ${String(aTransferer.length)} objets à la source, ` +
      `${String(dejaLa.size)} déjà à destination`,
  );

  for (const [index, objet] of aTransferer.entries()) {
    if (dejaLa.has(objet.chemin)) {
      ignores += 1;
      continue;
    }
    if (secheresse) {
      console.log(`  [sec] ${objet.chemin}`);
      transferes += 1;
      continue;
    }

    const lu = await source.storage.from(bucket).download(objet.chemin);
    if (lu.error) {
      console.error(`  ÉCHEC lecture ${objet.chemin} : ${lu.error.message}`);
      echecs += 1;
      continue;
    }

    const contenu = Buffer.from(await lu.data.arrayBuffer());
    const ecrit = await cible.storage.from(bucket).upload(objet.chemin, contenu, {
      contentType: lu.data.type || 'application/octet-stream',
      upsert: true,
    });

    if (ecrit.error) {
      console.error(`  ÉCHEC écriture ${objet.chemin} : ${ecrit.error.message}`);
      echecs += 1;
      continue;
    }

    transferes += 1;
    if (transferes % 25 === 0) {
      console.log(`  ${String(index + 1)}/${String(aTransferer.length)} — ${objet.chemin}`);
    }
  }
}

console.log(
  `\ntransférés : ${String(transferes)}   déjà présents : ${String(ignores)}   échecs : ${String(echecs)}`,
);
process.exitCode = echecs > 0 ? 1 : 0;

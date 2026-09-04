#!/usr/bin/env node
/**
 * DÉPÔT DES COUVERTURES DEPUIS LES PDF D'ORIGINE.
 *
 * ┌────────────────────────────────────────────────────────────────────────────┐
 * │ POURQUOI CE SCRIPT EXISTE À CÔTÉ DE `produire-couvertures.mjs`.            │
 * │                                                                            │
 * │ Son jumeau repart de la première page DÉJÀ RENDUE, dans `book-pages`.      │
 * │ C'est le bon chemin quand les pages sont là. Sur la base de démonstration  │
 * │ elles ne le sont pas : les 348 pages sont des images de substitution de    │
 * │ 1 × 1 pixel, et le jumeau refuse à juste titre d'en tirer une couverture.  │
 * │                                                                            │
 * │ Les PDF d'origine, eux, existent sur le disque. On en rend la première     │
 * │ page — c'est la définition même de la couverture dans ce projet            │
 * │ (`src/lib/ingestion/cover.ts`), et le résultat est celui que la chaîne     │
 * │ d'ingestion aurait produit.                                                │
 * └────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌────────────────────────────────────────────────────────────────────────────┐
 * │ ET POURQUOI PAS LE DOSSIER `couvertures/`, QUI PORTE DÉJÀ DES PNG ?        │
 * │                                                                            │
 * │ Parce qu'ils font 268 px de large, quand la plus petite taille servie en   │
 * │ vaut 320. Les agrandir donnerait une image floue servie en HTTP 200 —      │
 * │ pire qu'une couverture absente, puisque le substitut « Couverture à venir »│
 * │ dit au moins la vérité. Le PDF, lui, se rend à la résolution qu'on veut.   │
 * └────────────────────────────────────────────────────────────────────────────┘
 *
 * Il est IDEMPOTENT : un titre dont la vignette existe déjà est ignoré.
 *
 *     node scripts/deposer-couvertures.mjs [--sec] [--force] [--dossier=<chemin>]
 *
 *         --sec       n'écrit rien, énumère seulement
 *         --force     refait les couvertures déjà présentes
 *         --dossier   où trouver les PDF (défaut : « conte d'afrique/contes_pdf »)
 *
 * Local UNIQUEMENT : ce script ne connaît pas `--distant`. Déposer des images
 * en production se fait par la chaîne d'ingestion, qui trace ce qu'elle écrit.
 */
import { Buffer } from 'node:buffer';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import sharp from 'sharp';
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';

import TAILLES from '../src/lib/storage/tailles-couverture.json' with { type: 'json' };

const secheresse = process.argv.includes('--sec');
const force = process.argv.includes('--force');
const dossierDemande = process.argv
  .find((argument) => argument.startsWith('--dossier='))
  ?.slice('--dossier='.length);

const DOSSIER_PDF = dossierDemande ?? "conte d'afrique/contes_pdf";

config({ path: '.env.local', quiet: true });

const URL_BASE = process.env.NEXT_PUBLIC_SUPABASE_URL;
const CLE = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!URL_BASE || !CLE) {
  console.error('.env.local incomplet : URL et clé de service attendues.');
  process.exit(1);
}

/*
 * La pile DOIT être locale.
 *
 * La même garde que `creer-admin.mjs` : une clé de service pointée sur le
 * projet hébergé écrirait dans le bucket public de production, et un bucket
 * public est indexable. On refuse plutôt que de faire confiance au fichier
 * d'environnement chargé.
 */
if (!/127\.0\.0\.1|localhost/.test(URL_BASE)) {
  console.error(`Ce script est LOCAL. Cible refusée : ${URL_BASE}`);
  process.exit(1);
}

const client = createClient(URL_BASE, CLE, { auth: { persistSession: false } });

const BUCKET_COUVERTURES = 'covers';
/** La même qualité que `declinerCouverture` et que le script jumeau. */
const QUALITE = 82;
/*
 * 200 points par pouce : une page A5 rend alors ~1150 px de large, soit
 * au-dessus de la plus grande taille servie (1600 px de haut, ~1100 de large).
 * Monter plus haut ne ferait qu'allonger le rendu pour des pixels que
 * personne ne verra.
 */
const RESOLUTION = 200;

/**
 * Le nom de fichier ramené à la forme d'un slug.
 *
 * « Anansi l'araignée maligne.pdf » et le slug `anansi-l-araignee-maligne`
 * doivent se rejoindre : on retire les accents, on abaisse la casse, et tout
 * ce qui n'est ni lettre ni chiffre devient un tiret.
 */
function enSlug(nom) {
  return nom
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

console.log(`cible : pile locale — ${URL_BASE}`);
console.log(`PDF lus dans : ${DOSSIER_PDF}\n`);

// ── Les PDF disponibles, indexés par slug ──────────────────────────────────
let fichiers;
try {
  fichiers = readdirSync(DOSSIER_PDF).filter((nom) => nom.toLowerCase().endsWith('.pdf'));
} catch (erreur) {
  console.error(`Dossier illisible : ${erreur.message}`);
  process.exit(1);
}

const parSlug = new Map(fichiers.map((nom) => [enSlug(nom.replace(/\.pdf$/i, '')), nom]));
console.log(`${String(fichiers.length)} PDF trouvé(s).`);

// ── Les titres publiés qui attendent une couverture ────────────────────────
const { data: livres, error: erreurLivres } = await client
  .from('books')
  .select('id, slug, couverture_jeton, statut')
  .eq('statut', 'publie')
  .not('couverture_jeton', 'is', null);

if (erreurLivres) {
  console.error(`Livres illisibles : ${erreurLivres.message}`);
  process.exit(1);
}

console.log(`${String(livres.length)} titre(s) publié(s) avec un jeton de couverture.\n`);

let produites = 0;
let ignorees = 0;
let echecs = 0;

const travail = mkdtempSync(join(tmpdir(), 'couvertures-'));

try {
  for (const livre of livres) {
    const jeton = livre.couverture_jeton;

    if (!force) {
      const existant = await client.storage.from(BUCKET_COUVERTURES).list(jeton, { limit: 5 });
      if (!existant.error && (existant.data ?? []).some((o) => o.name === 'vignette.webp')) {
        ignorees += 1;
        continue;
      }
    }

    const fichier = parSlug.get(livre.slug);
    if (!fichier) {
      console.error(`  ${livre.slug} : aucun PDF de ce nom`);
      echecs += 1;
      continue;
    }

    if (secheresse) {
      console.log(`  [sec] ${livre.slug} <- ${fichier}`);
      produites += 1;
      continue;
    }

    // ── La première page, rendue par poppler ────────────────────────────────
    const prefixe = join(travail, livre.slug);
    try {
      execFileSync('pdftoppm', [
        '-f', '1', '-l', '1',
        '-r', String(RESOLUTION),
        '-png',
        join(DOSSIER_PDF, fichier),
        prefixe,
      ]);
    } catch (erreur) {
      console.error(`  ${livre.slug} : rendu impossible — ${erreur.message.split('\n')[0]}`);
      echecs += 1;
      continue;
    }

    // poppler suffixe le numéro de page, sur une largeur qu'il choisit seul
    // selon le nombre total de pages : « -1 », « -01 », « -001 ». On ne devine
    // pas, on relit le dossier.
    const rendu = readdirSync(travail).find((nom) => nom.startsWith(`${livre.slug}-`));
    if (!rendu) {
      console.error(`  ${livre.slug} : poppler n'a rien écrit`);
      echecs += 1;
      continue;
    }

    const source = Buffer.from(readFileSync(join(travail, rendu)));

    // La même garde que le script jumeau : une source trop étroite produirait
    // des couvertures floues servies en HTTP 200, ce qui est pire qu'absent.
    const plusPetiteCible = Math.min(...Object.values(TAILLES));
    const dimensions = await sharp(source).metadata();

    if ((dimensions.width ?? 0) < plusPetiteCible) {
      console.error(
        `  ${livre.slug} : rendu de ${String(dimensions.width ?? 0)} px de large, ` +
          `sous la plus petite couverture (${String(plusPetiteCible)} px).`,
      );
      echecs += 1;
      continue;
    }

    let posees = 0;

    for (const [taille, largeur] of Object.entries(TAILLES)) {
      const contenu = await sharp(source)
        .resize({ width: largeur, withoutEnlargement: true })
        .webp({ quality: QUALITE })
        .toBuffer();

      const ecrite = await client.storage
        .from(BUCKET_COUVERTURES)
        .upload(`${jeton}/${taille}.webp`, contenu, {
          contentType: 'image/webp',
          upsert: true,
        });

      if (ecrite.error) {
        console.error(`  ${livre.slug} (${taille}) : ${ecrite.error.message}`);
        echecs += 1;
      } else {
        posees += 1;
      }
    }

    if (posees === Object.keys(TAILLES).length) {
      produites += 1;
      console.log(`  ✓ ${livre.slug} (${String(dimensions.width ?? 0)} px de source)`);
    }
  }
} finally {
  rmSync(travail, { recursive: true, force: true });
}

console.log(
  `\ndéposées : ${String(produites)}   déjà présentes : ${String(ignorees)}   échecs : ${String(echecs)}`,
);
process.exitCode = echecs > 0 ? 1 : 0;

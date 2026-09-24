/**
 * DÉPÔT D'UN CONTE DEPUIS CE POSTE — pour les fichiers que Vercel refuse.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ POURQUOI CE SCRIPT EXISTE.                                              │
 * │                                                                          │
 * │ Vercel borne le corps d'une requête à 4,5 Mo, sans réglage possible, et  │
 * │ la durée d'une fonction à 60 s sur le palier Hobby. Un export Canva de   │
 * │ 33 pages pèse 25 Mo et demande plus de deux minutes de rendu : l'écran   │
 * │ de dépôt en ligne ne peut PAS l'accepter, quoi qu'on règle dans le code. │
 * │                                                                          │
 * │ Ce script exécute la MÊME chaîne d'ingestion (`ingerer`), sur ce poste,  │
 * │ et écrit dans la base désignée. Aucune règle n'est réécrite : il         │
 * │ transporte un chemin et quatre champs, exactement comme la route.        │
 * │                                                                          │
 * │ Il devient inutile sur le VPS, où ni l'un ni l'autre plafond n'existe.   │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * usage :
 *   node scripts/deposer-conte-distant.mjs <fichier.pdf> [--distant] [--titre "…"]
 *
 *   --distant   écrit dans le projet HÉBERGÉ (.env.production.local).
 *               Sans lui, la pile locale.
 *
 *   TYPE_DOCUMENT=conte|livret_pedagogique   (défaut : conte)
 *   ORIENTATION=portrait|paysage             (défaut : portrait)
 *   LANGUE=fr|en                             (défaut : fr)
 *
 * Le conte naît BROUILLON : auteur, âge, prix et publication se règlent
 * ensuite dans l'administration, comme après un dépôt par l'écran.
 */
import { copyFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { config } from 'dotenv';
import { createJiti } from 'jiti';

const args = process.argv.slice(2);
const distant = args.includes('--distant');
const iTitre = args.indexOf('--titre');
const titre = iTitre >= 0 ? args[iTitre + 1]?.trim() : undefined;
const chemin = args.find((a, i) => !a.startsWith('--') && (iTitre < 0 || i !== iTitre + 1));

if (!chemin) {
  console.error('usage : node scripts/deposer-conte-distant.mjs <fichier.pdf> [--distant] [--titre "…"]');
  process.exit(1);
}

const typeDocument = process.env.TYPE_DOCUMENT ?? 'conte';
const orientation = process.env.ORIENTATION ?? 'portrait';
const langue = process.env.LANGUE ?? 'fr';
if (!['conte', 'livret_pedagogique'].includes(typeDocument)) {
  console.error(`TYPE_DOCUMENT invalide : « ${typeDocument} ».`);
  process.exit(1);
}
if (!['portrait', 'paysage'].includes(orientation)) {
  console.error(`ORIENTATION invalide : « ${orientation} ».`);
  process.exit(1);
}
if (!['fr', 'en'].includes(langue)) {
  console.error(`LANGUE invalide : « ${langue} ».`);
  process.exit(1);
}

/*
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ DEUX FICHIERS, DANS CET ORDRE — ET LE SECOND L'EMPORTE.                 │
 * │                                                                          │
 * │ `.env.production.local` ne porte que l'URL et la clé de service. Le      │
 * │ schéma d'environnement en exige d'autres, qui ne servent pas à           │
 * │ l'ingestion : `.env.local` les fournit. Seules l'URL et la clé comptent  │
 * │ pour savoir OÙ l'on écrit, et ce sont celles du fichier distant.         │
 * │                                                                          │
 * │ `NODE_ENV=production` en distant : l'horloge de développement lit un     │
 * │ décalage local, et il n'a rien à faire dans une date de la vraie base.   │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
config({ path: '.env.local', quiet: true });
if (distant) {
  config({ path: '.env.production.local', override: true, quiet: true });
  process.env.NODE_ENV = 'production';
}

const cible = process.env.NEXT_PUBLIC_SUPABASE_URL;
if (!cible || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error('URL Supabase ou clé de service absente.');
  process.exit(1);
}
if (distant && /localhost|127\.0\.0\.1/.test(cible)) {
  console.error(`--distant, mais la cible est locale (${cible}) : .env.production.local incomplet.`);
  process.exit(1);
}

/*
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LE DÉLAI DE 300 s DE `fetch` — CE QUI A FAIT ÉCHOUER DEUX DÉPÔTS.       │
 * │                                                                          │
 * │ Le `fetch` de Node abandonne une requête au bout de 300 secondes. Sur    │
 * │ une connexion montante de 90 Ko/s, le PDF (25 Mo) et l'EPUB, envoyés en  │
 * │ parallèle, en demandent davantage : « fetch failed », à la dernière      │
 * │ étape, après dix minutes de travail. Le même PDF seul, au début, tenait  │
 * │ tout juste dans le délai.                                                │
 * │                                                                          │
 * │ Node n'exporte pas la classe de son répartiteur, mais l'installe sous un │
 * │ symbole connu après le premier appel. On en reconstruit un aux délais    │
 * │ relevés, pour ce processus seulement. Aucune dépendance ajoutée.         │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
const DELAI_ENVOI_MS = 60 * 60 * 1000;
const SYMBOLE_REPARTITEUR = Symbol.for('undici.globalDispatcher.1');
await fetch('http://127.0.0.1:1').catch(() => undefined);
const Repartiteur = globalThis[SYMBOLE_REPARTITEUR]?.constructor;
if (!Repartiteur) {
  console.error('Répartiteur de fetch introuvable : délai d’envoi non relevé, dépôt annulé.');
  process.exit(1);
}
globalThis[SYMBOLE_REPARTITEUR] = new Repartiteur({
  headersTimeout: DELAI_ENVOI_MS,
  bodyTimeout: DELAI_ENVOI_MS,
});

console.log(`cible : ${distant ? 'PROJET HÉBERGÉ' : 'pile locale'} — ${cible}`);
console.log(`dépôt : ${typeDocument}, ${orientation}, ${langue}${titre ? `, « ${titre} »` : ''}`);

const racine = resolve(fileURLToPath(new URL('..', import.meta.url)));
const jiti = createJiti(import.meta.url, { alias: { '@': join(racine, 'src') } });
const { ingerer } = await jiti.import(join(racine, 'src/lib/ingestion/pipeline.ts'));

// Même précaution que la route : la chaîne ne voit qu'une copie au nom fixe.
const dossier = await mkdtemp(join(tmpdir(), 'ingest-depot-'));
const cheminPdf = join(dossier, 'source.pdf');

try {
  await copyFile(chemin, cheminPdf);
  console.log('conversion des pages — compter quelques minutes…');

  const debut = globalThis.performance.now();
  const resultat = await ingerer({
    cheminPdf,
    langue,
    typeDocument,
    orientation,
    ...(titre ? { titre } : {}),
  });
  const secondes = Math.round((globalThis.performance.now() - debut) / 1000);

  console.log(`\nterminé en ${String(secondes)} s`);
  console.log(JSON.stringify(resultat, null, 2));
  if (resultat.dejaIngere) {
    console.log('\nCe fichier était DÉJÀ déposé : rien n’a été recréé.');
  }
} catch (erreur) {
  console.error('\nÉCHEC :', erreur instanceof Error ? erreur.message : erreur);
  process.exitCode = 1;
} finally {
  await rm(dossier, { recursive: true, force: true });
}

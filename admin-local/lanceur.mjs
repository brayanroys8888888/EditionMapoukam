/**
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║ L'ADMINISTRATION LOCALE — le site, sur ce poste, relié à la vraie base.  ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ POURQUOI.                                                               │
 * │                                                                          │
 * │ Vercel refuse tout envoi de plus de 4,5 Mo et coupe un traitement à      │
 * │ 60 s. Un conte exporté de Canva pèse 25 Mo et demande trois minutes de   │
 * │ rendu : l'écran de dépôt EN LIGNE ne peut pas l'accepter. Ici, le même   │
 * │ écran tourne sur ce poste — le poste fait le rendu, et n'envoie à        │
 * │ Supabase que le résultat. REPRISE.md §0 duodecies.                       │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ CE QUE LE LANCEUR IMPOSE, ET POURQUOI CHAQUE LIGNE COMPTE.              │
 * │                                                                          │
 * │ · Mode PRODUCTION (`next build` + `next start`) : la console `/dev`,     │
 * │   qui simule des paiements et déplace l'horloge, y est fermée. Reliée à  │
 * │   la vraie base, elle toucherait de vrais clients.                       │
 * │ · Notch Pay avec des clés FACTICES : aucun paiement possible depuis ce   │
 * │   poste, ni réel ni simulé. Le faux prestataire est exclu — avec lui,    │
 * │   `/api/paiement-simule` offrirait des contes dans la base réelle à      │
 * │   n'importe quel compte connecté ici.                                    │
 * │ · Écoute sur 127.0.0.1 seulement : le réseau local n'y accède pas.       │
 * │ · Emails écrits sur le disque, connexion Google éteinte : ce poste ne    │
 * │   parle à aucun service en dehors de Supabase.                           │
 * │ · Délai d'envoi relevé (`delai-fetch.cjs`) : sans lui, un conte de       │
 * │   25 Mo échoue à la dernière étape sur une connexion lente.              │
 * │ · Chaque variable est posée EXPLICITEMENT : sur un poste de              │
 * │   développement, Next compléterait sinon avec `.env.local`.              │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * usage :
 *   node admin-local/lanceur.mjs                démarre (construit si besoin)
 *   node admin-local/lanceur.mjs --verifier     contrôle le poste, ne lance rien
 *   node admin-local/lanceur.mjs --construire   reconstruit, puis démarre
 *   node admin-local/lanceur.mjs --construire-seulement   reconstruit, et s'arrête
 *   options : --config <fichier>   (défaut : admin-local/.env)
 *             --sans-navigateur
 */
import { spawn } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import {
  existsSync,
  lstatSync,
  readdirSync,
  readFileSync,
  rmdirSync,
  rmSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { parse } from 'dotenv';
import { createJiti } from 'jiti';

const RACINE = resolve(fileURLToPath(new URL('..', import.meta.url)));
const DOSSIER_CONSTRUCTION = '.next/admin-local';
const EMPREINTE = join(RACINE, DOSSIER_CONSTRUCTION, 'empreinte-admin-local.txt');

const args = process.argv.slice(2);
const iConfig = args.indexOf('--config');
const cheminConfig = resolve(
  RACINE,
  iConfig >= 0 && args[iConfig + 1] ? args[iConfig + 1] : 'admin-local/.env',
);
const verifierSeulement = args.includes('--verifier');
const construireSeulement = args.includes('--construire-seulement');
const forcerConstruction = args.includes('--construire') || construireSeulement;
const sansNavigateur = args.includes('--sans-navigateur');

const vert = (t) => `\u001b[32m${t}\u001b[0m`;
const rouge = (t) => `\u001b[31m${t}\u001b[0m`;
const gras = (t) => `\u001b[1m${t}\u001b[0m`;

function arreter(message) {
  console.error(`\n${rouge('✗')} ${message}\n`);
  process.exit(1);
}

// ── 1. Le poste ─────────────────────────────────────────────────────────────

const [majeure] = process.versions.node.split('.').map(Number);
if (!majeure || majeure < 20) {
  arreter(`Node ${process.versions.node} est trop ancien : il faut Node 20 ou plus.`);
}
console.log(`${vert('✓')} Node ${process.versions.node}`);

if (!existsSync(join(RACINE, 'node_modules', 'next'))) {
  arreter('Les dépendances ne sont pas installées. Lancez d’abord Installer.cmd (ou `npm ci`).');
}

const jiti = createJiti(import.meta.url, { alias: { '@': join(RACINE, 'src') } });
const { resoudreOutil } = await jiti.import(join(RACINE, 'src/lib/ingestion/poppler.ts'));
try {
  for (const outil of ['pdfinfo', 'pdftotext', 'pdftoppm']) await resoudreOutil(outil);
  console.log(`${vert('✓')} poppler (pdfinfo, pdftotext, pdftoppm)`);
} catch (erreur) {
  arreter(
    `poppler est introuvable — sans lui, aucun PDF ne se lit.\n  ${erreur instanceof Error ? erreur.message : String(erreur)}\n` +
      '  Sous Windows : winget install -e --id oschwartz10612.Poppler, puis rouvrez la fenêtre.',
  );
}

// ── 2. La configuration ─────────────────────────────────────────────────────

if (!existsSync(cheminConfig)) {
  arreter(
    `Configuration absente : ${cheminConfig}\n` +
      '  Lancez Installer.cmd, ou recopiez admin-local/configuration.exemple.env en admin-local/.env.',
  );
}
const config = parse(readFileSync(cheminConfig));

const url = (config.NEXT_PUBLIC_SUPABASE_URL ?? '').trim().replace(/\/+$/, '');
const anon = (config.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '').trim();
const service = (config.SUPABASE_SERVICE_ROLE_KEY ?? '').trim();
const port = Number(config.ADMIN_LOCAL_PORT ?? 3700);
const design = (config.NEXT_PUBLIC_DESIGN_VERSION ?? 'v3').trim();

const manquants = [
  !/^https?:\/\/[^\s]+$/.test(url) || url.includes('xxxxxxxx') ? 'NEXT_PUBLIC_SUPABASE_URL' : null,
  anon ? null : 'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  service ? null : 'SUPABASE_SERVICE_ROLE_KEY',
].filter(Boolean);
if (manquants.length > 0) arreter(`À compléter dans ${cheminConfig} : ${manquants.join(', ')}.`);
if (anon === service) {
  arreter('La clé anon et la clé service_role sont identiques : l’une des deux a été mal recopiée.');
}
if (!Number.isInteger(port) || port < 1024 || port > 65535 || port === 3000) {
  arreter(`ADMIN_LOCAL_PORT=${String(config.ADMIN_LOCAL_PORT)} : choisissez un port entre 1024 et 65535, autre que 3000.`);
}
if (!['v1', 'v2', 'v3'].includes(design)) arreter(`NEXT_PUBLIC_DESIGN_VERSION=${design} : v1, v2 ou v3.`);

// Les deux clés sont ÉPROUVÉES, pas seulement présentes : une clé mal
// recopiée se découvrirait sinon au premier dépôt, après la construction.
async function sonder(chemin, cle) {
  try {
    const reponse = await fetch(`${url}${chemin}`, {
      headers: { apikey: cle, authorization: `Bearer ${cle}` },
      signal: globalThis.AbortSignal.timeout(20_000),
    });
    return reponse.status;
  } catch {
    return null;
  }
}
const [etatService, etatAnon] = await Promise.all([
  sonder('/rest/v1/books?select=id&limit=1', service),
  sonder('/auth/v1/settings', anon),
]);
if (etatService === null) arreter(`Supabase ne répond pas à ${url} — connexion internet, ou adresse erronée.`);
if (etatService !== 200) arreter(`La clé service_role est refusée par Supabase (HTTP ${String(etatService)}).`);
if (etatAnon !== 200) arreter(`La clé anon est refusée par Supabase (HTTP ${String(etatAnon)}).`);
console.log(`${vert('✓')} Supabase joignable, les deux clés acceptées — ${url}`);

if (verifierSeulement) {
  console.log(`\n${vert('Le poste est prêt.')}\n`);
  process.exit(0);
}

// ── 3. L'environnement du serveur ───────────────────────────────────────────

const adresse = `http://localhost:${String(port)}`;
// Barres OBLIQUES, même sous Windows : `NODE_OPTIONS` traite la barre
// inverse comme un échappement, et `C:\projets\…` y devient `C:projets…`.
const delaiFetch = join(RACINE, 'admin-local', 'delai-fetch.cjs').replaceAll('\\', '/');

const environnement = {
  ...process.env,
  NODE_ENV: 'production',
  NEXT_TELEMETRY_DISABLED: '1',
  ADMIN_LOCAL_DIST_DIR: DOSSIER_CONSTRUCTION,
  NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ''} --require "${delaiFetch}"`.trim(),

  NEXT_PUBLIC_SUPABASE_URL: url,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: anon,
  SUPABASE_SERVICE_ROLE_KEY: service,
  NEXT_PUBLIC_APP_URL: adresse,
  NEXT_PUBLIC_DESIGN_VERSION: design,

  // Aucun paiement depuis ce poste — voir l'encadré en tête.
  PAYMENT_PROVIDER: 'notchpay',
  NOTCHPAY_PUBLIC_KEY: 'pk_test.admin-local-aucun-paiement',
  NOTCHPAY_PRIVATE_KEY: 'sk_test.admin-local-aucun-paiement',
  NOTCHPAY_HASH_KEY: 'hsk_test.admin-local-aucun-paiement',
  NOTCHPAY_AUTORISER_PRODUCTION: 'false',
  FAKE_WEBHOOK_SECRET: randomBytes(24).toString('hex'),

  MAILER: 'file',
  MAIL_OUTPUT_DIR: '.mails-admin-local',
  RESEND_API_KEY: '',
  RESEND_FROM_EMAIL: '',

  AUTH_GOOGLE: 'desactive',
  GOOGLE_CLIENT_ID: '',
  GOOGLE_CLIENT_SECRET: '',
  BETTER_AUTH_SECRET: '',
  AUTH_CONFIRMATION_AUTOMATIQUE: 'false',

  DATABASE_URL: '',
  SUPABASE_MAIL_URL: '',
};

function lancer(argumentsNext, options = {}) {
  return spawn(process.execPath, [join(RACINE, 'node_modules', 'next', 'dist', 'bin', 'next'), ...argumentsNext], {
    cwd: RACINE,
    env: environnement,
    stdio: options.stdio ?? 'inherit',
  });
}

// ── 4. La construction — seulement si le code ou la cible a changé ─────────

/*
 * Next GRAVE les variables `NEXT_PUBLIC_*` dans le paquet construit. Changer
 * de projet Supabase sans reconstruire donnerait une page de connexion qui
 * parle à l'ancien. L'empreinte couvre donc la cible, en plus du code.
 */
function empreinte() {
  const hachage = createHash('sha256');
  hachage.update(JSON.stringify({ url, anon, port, design }));
  for (const fichier of ['package-lock.json', 'next.config.ts']) {
    const chemin = join(RACINE, fichier);
    if (existsSync(chemin)) hachage.update(readFileSync(chemin));
  }
  // Une copie téléchargée en ZIP n'a pas de `.git` : c'est alors la date de
  // chaque source qui dit si le code a changé depuis la dernière construction.
  const pile = ['src', 'public'].map((d) => join(RACINE, d));
  while (pile.length > 0) {
    const dossier = pile.pop();
    if (!dossier || !existsSync(dossier)) continue;
    for (const entree of readdirSync(dossier, { withFileTypes: true })) {
      const chemin = join(dossier, entree.name);
      if (entree.isDirectory()) pile.push(chemin);
      else hachage.update(`${chemin}:${String(statSync(chemin).mtimeMs)}`);
    }
  }
  const tete = join(RACINE, '.git', 'HEAD');
  if (existsSync(tete)) {
    const ref = readFileSync(tete, 'utf8').trim();
    hachage.update(ref);
    const cheminRef = ref.startsWith('ref: ') ? join(RACINE, '.git', ref.slice(5)) : null;
    if (cheminRef && existsSync(cheminRef)) hachage.update(readFileSync(cheminRef));
  }
  return hachage.digest('hex');
}

/**
 * Vide le dossier de construction SANS SUIVRE ses liens.
 *
 * Ses `node_modules` contiennent des jonctions vers ceux du projet : les
 * parcourir en les suivant effacerait les VRAIES dépendances. Chaque lien est
 * donc retiré pour lui-même avant l'effacement du reste.
 */
function viderConstruction() {
  const dossier = join(RACINE, DOSSIER_CONSTRUCTION);
  const pile = [join(dossier, 'node_modules')];
  while (pile.length > 0) {
    const courant = pile.pop();
    if (!courant || !existsSync(courant)) continue;
    for (const entree of readdirSync(courant, { withFileTypes: true })) {
      const chemin = join(courant, entree.name);
      if (lstatSync(chemin).isSymbolicLink()) {
        try {
          unlinkSync(chemin);
        } catch {
          rmdirSync(chemin);
        }
      } else if (entree.isDirectory()) {
        pile.push(chemin);
      }
    }
  }
  rmSync(dossier, { recursive: true, force: true });
}

const attendue = empreinte();
const actuelle = existsSync(EMPREINTE) ? readFileSync(EMPREINTE, 'utf8').trim() : null;
const construit = existsSync(join(RACINE, DOSSIER_CONSTRUCTION, 'BUILD_ID'));

if (forcerConstruction || !construit || actuelle !== attendue) {
  console.log(`\n${gras('Construction du site')} — cinq minutes environ, seulement la première fois.\n`);
  const construire = () => new Promise((fin) => lancer(['build']).on('exit', fin));
  let code = await construire();
  if (code !== 0) {
    /*
     * UNE SECONDE CHANCE, SUR UN DOSSIER PROPRE.
     *
     * Constaté le 26 septembre 2026 : une reconstruction a échoué sur
     * « failed to create junction point … Accès refusé », puis les deux
     * suivantes ont réussi sans rien changer. Turbopack pose sous
     * `node_modules` du dossier de construction des LIENS vers les paquets
     * externes, et Windows refuse parfois de les recréer par-dessus. Repartir
     * d'un dossier vide lève ce cas ; une erreur de code, elle, échouera de
     * nouveau, et son message restera affiché.
     */
    console.log(`
${gras('Nouvel essai')} sur un dossier de construction vide.
`);
    viderConstruction();
    code = await construire();
  }
  if (code !== 0) arreter(`La construction a échoué (code ${String(code)}). Le détail est au-dessus.`);
  writeFileSync(EMPREINTE, attendue);
}

if (construireSeulement) {
  console.log(`
${vert('✓')} Site construit.
`);
  process.exit(0);
}

// ── 5. Le démarrage ─────────────────────────────────────────────────────────

console.log(`\n${gras('Administration locale')} — ${adresse}`);
console.log(`  base   : ${url}  ${rouge('(PRODUCTION)')}`);
console.log('  arrêt  : fermez cette fenêtre, ou Ctrl+C\n');

const serveur = lancer(['start', '-H', '127.0.0.1', '-p', String(port)]);

const arretPropre = () => serveur.kill('SIGINT');
process.on('SIGINT', arretPropre);
process.on('SIGTERM', arretPropre);
serveur.on('exit', (code) => process.exit(code ?? 0));

if (!sansNavigateur) {
  const destination = `${adresse}/fr/admin/contes/nouveau`;
  for (let essai = 0; essai < 120; essai += 1) {
    await new Promise((r) => globalThis.setTimeout(r, 1000));
    const pret = await fetch(`${adresse}/fr/connexion`, { signal: globalThis.AbortSignal.timeout(5000) })
      .then((r) => r.status < 500)
      .catch(() => false);
    if (!pret) continue;

    const [commande, ...options] =
      process.platform === 'win32'
        ? ['cmd', '/c', 'start', '', destination]
        : process.platform === 'darwin'
          ? ['open', destination]
          : ['xdg-open', destination];
    spawn(commande, options, { stdio: 'ignore', detached: true }).unref();
    console.log(`${vert('✓')} Ouvert dans le navigateur : ${destination}\n`);
    break;
  }
}

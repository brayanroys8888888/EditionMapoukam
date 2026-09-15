#!/usr/bin/env node
/**
 * Crée — ou promeut — un compte administrateur sur la base HÉBERGÉE Supabase.
 *
 * Ce script cible explicitement la base en ligne. Il est réservé à une
 * utilisation ponctuelle et manuelle par le propriétaire du projet.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ AUCUN IDENTIFIANT DANS CE FICHIER (CLAUDE.md, règle 6).                 │
 * │                                                                          │
 * │ Il a longtemps porté l'URL et la clé `service_role` du projet en dur, et │
 * │ le dépôt est public : la clé a donc été exposée. Elles se lisent         │
 * │ désormais dans `.env.production.local`, non versionné — ou dans          │
 * │ l'environnement du shell, qui a la priorité.                             │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Variables lues :
 *   NEXT_PUBLIC_SUPABASE_URL    https://<ref>.supabase.co
 *   SUPABASE_SERVICE_ROLE_KEY   la clé `service_role` du même projet
 *   NEXT_PUBLIC_APP_URL         facultative — sert à afficher les liens
 *
 * Usage :
 *   node scripts/creer-admin-prod.mjs
 *   node scripts/creer-admin-prod.mjs mon.adresse@exemple.fr MonMotDePasse123
 */
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';

// ── Identifiants ────────────────────────────────────────────────────────────

// dotenv n'écrase pas une variable déjà posée : le shell garde la main.
config({ path: join(process.cwd(), '.env.production.local'), quiet: true });

const urlSupabase = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const cleService = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

if (!urlSupabase || !cleService) {
  console.error(
    'NEXT_PUBLIC_SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY manque.\n' +
      'Renseignez-les dans .env.production.local (Supabase → Project Settings → API).',
  );
  process.exit(1);
}

// La garde inverse de `creer-admin.mjs` : une base locale a son propre script.
const estLocale = /^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])(:\d+)?/i.test(urlSupabase);
if (estLocale) {
  console.error(
    `Refus : ${urlSupabase} est une base locale.\n` +
      'Utilisez `npm run admin:creer` pour la pile de développement.',
  );
  process.exit(1);
}

const urlApp = process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/$/, '');

// ── Arguments ───────────────────────────────────────────────────────────────

const [emailDemande, motDePasseDemande] = process.argv.slice(2);

const email = emailDemande ?? 'admin@editionmapoukam.com';
const motDePasse = motDePasseDemande ?? `Adm-${randomBytes(9).toString('base64url')}-7`;

// ── Client service ──────────────────────────────────────────────────────────

const service = createClient(urlSupabase, cleService, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// ── Création ou promotion ───────────────────────────────────────────────────

console.log(`\n  Connexion à la base hébergée...`);
console.log(`  Projet : ${new URL(urlSupabase).host}`);
console.log(`  Email  : ${email}\n`);

const { data: usersData, error: errList } = await service.auth.admin.listUsers({
  page: 1,
  perPage: 1000,
});
if (errList) {
  console.error(`Erreur lecture des comptes : ${errList.message}`);
  process.exit(1);
}

const existant = usersData?.users.find(
  (u) => u.email?.toLowerCase() === email.toLowerCase(),
);

let id;
let cree = false;

if (existant) {
  id = existant.id;
  const { error } = await service.auth.admin.updateUserById(id, {
    password: motDePasse,
    email_confirm: true,
  });
  if (error) {
    console.error(`Mise à jour du compte impossible : ${error.message}`);
    process.exit(1);
  }
} else {
  const { data, error } = await service.auth.admin.createUser({
    email,
    password: motDePasse,
    email_confirm: true,
    user_metadata: { nom_complet: 'Administration' },
  });
  if (error || !data.user) {
    console.error(`Création du compte impossible : ${error?.message ?? 'raison inconnue'}`);
    process.exit(1);
  }
  id = data.user.id;
  cree = true;
}

// Le rôle est posé par la clé de service.
const { error: erreurRole } = await service
  .from('users')
  .update({ role: 'admin' })
  .eq('id', id);

if (erreurRole) {
  console.error(`Promotion en administrateur impossible : ${erreurRole.message}`);
  process.exit(1);
}

// ── Compte rendu ────────────────────────────────────────────────────────────

console.log('');
console.log(cree ? '  Compte administrateur CRÉÉ (production).' : '  Compte existant PROMU administrateur (production).');
console.log('');
console.log(`    Adresse       ${email}`);
console.log(`    Mot de passe  ${motDePasse}`);
console.log(`    Identifiant   ${id}`);
console.log('');
if (urlApp) {
  console.log(`    Connexion     ${urlApp}/fr/connexion`);
  console.log(`    Admin         ${urlApp}/fr/admin`);
  console.log('');
}
console.log("  Notez ce mot de passe — relancer le script avec la même adresse le remplacera.");
console.log('');

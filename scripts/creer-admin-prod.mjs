#!/usr/bin/env node
/**
 * Crée — ou promeut — un compte administrateur sur la base PRODUCTION Supabase.
 *
 * Ce script cible explicitement la base en ligne. Il est réservé à une
 * utilisation ponctuelle et manuelle par le propriétaire du projet.
 *
 * Usage :
 *   node scripts/creer-admin-prod.mjs
 *   node scripts/creer-admin-prod.mjs mon.adresse@exemple.fr MonMotDePasse123
 */
import { randomBytes } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

// ── Identifiants production ─────────────────────────────────────────────────

const urlSupabase = 'https://peejevfgbwjprggwclga.supabase.co';
const cleService =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBlZWpldmZnYndqcHJnZ3djbGdhIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NTc3ODg4NCwiZXhwIjoyMTAxMzU0ODg0fQ.yXJ7cjjgny5BzdwjQB0GfmkbPBXEqfWYFa6Ke3V4AR8';

// ── Arguments ───────────────────────────────────────────────────────────────

const [emailDemande, motDePasseDemande] = process.argv.slice(2);

const email = emailDemande ?? 'admin@editionmapoukam.com';
const motDePasse = motDePasseDemande ?? `Adm-${randomBytes(9).toString('base64url')}-7`;

// ── Client service ──────────────────────────────────────────────────────────

const service = createClient(urlSupabase, cleService, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// ── Création ou promotion ───────────────────────────────────────────────────

console.log(`\n  Connexion à la base de production...`);
console.log(`  Projet : ${urlSupabase}`);
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
console.log(`    Connexion     https://editionmapoukam.com/fr/connexion`);
console.log(`    Admin         https://editionmapoukam.com/fr/admin`);
console.log('');
console.log("  Notez ce mot de passe — relancer le script avec la même adresse le remplacera.");
console.log('');

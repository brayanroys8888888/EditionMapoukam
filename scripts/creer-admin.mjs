#!/usr/bin/env node
/**
 * Crée — ou remet à niveau — un compte sur la base LOCALE, avec son RÔLE.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ UN SEUL SCRIPT POUR LES DEUX RÔLES, ET C'EST DÉLIBÉRÉ.                  │
 * │                                                                          │
 * │ Il ne faisait que des administrateurs. Un second script pour les comptes │
 * │ ordinaires aurait recopié les deux garde-fous qui comptent — le refus en │
 * │ production et le refus sur une base distante — et c'est précisément la   │
 * │ copie qui finit par diverger : celle qu'on oublie de durcir.             │
 * │                                                                          │
 * │ Le rôle est donc un ARGUMENT, `admin` par défaut pour que la commande    │
 * │ historique `npm run admin:creer` continue de faire ce qu'elle a toujours │
 * │ fait.                                                                    │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LE MÊME CHEMIN QUE L'APPLICATION, JAMAIS UNE INSERTION DIRECTE.         │
 * │                                                                          │
 * │ Le compte est créé par l'API d'administration de Supabase Auth, comme le │
 * │ fait l'inscription réelle. Une insertion directe dans `auth.users`       │
 * │ contournerait le déclencheur qui crée le profil dans `public.users` — et │
 * │ produirait un compte capable de se connecter mais dépourvu de rôle, donc │
 * │ un compte qui échoue de façon incompréhensible.                          │
 * │                                                                          │
 * │ Le rôle, lui, est posé par la clé de SERVICE. Il n'est jamais accordé    │
 * │ par le client : c'est la règle 2 de CLAUDE.md, et elle vaut aussi pour   │
 * │ un script de commodité.                                                  │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ CE SCRIPT REFUSE DE S'EXÉCUTER EN PRODUCTION.                           │
 * │                                                                          │
 * │ Il fabrique un compte à tous les droits depuis une ligne de commande. En │
 * │ développement c'est une commodité ; ailleurs ce serait une porte         │
 * │ dérobée. Le garde-fou est le même que celui de la console `/dev`.        │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Usage :
 *   node scripts/creer-admin.mjs
 *   node scripts/creer-admin.mjs mon.adresse@exemple.fr
 *   node scripts/creer-admin.mjs mon.adresse@exemple.fr MonMotDePasse123
 *   node scripts/creer-admin.mjs parent@exemple.fr MonMotDePasse123 user
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';

const racine = process.cwd();
const cheminEnv = join(racine, '.env.local');

if (!existsSync(cheminEnv)) {
  console.error(
    '.env.local est absent. Lancez `npm run supabase:start`, puis copiez .env.example en .env.local.',
  );
  process.exit(1);
}

config({ path: cheminEnv, quiet: true });

if (process.env.NODE_ENV === 'production') {
  console.error(
    'Refus : ce script crée un compte à tous les droits et ne doit jamais tourner en production.',
  );
  process.exit(1);
}

const urlSupabase = process.env.NEXT_PUBLIC_SUPABASE_URL;
const cleService = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!urlSupabase || !cleService) {
  console.error('NEXT_PUBLIC_SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY manque dans .env.local.');
  process.exit(1);
}

/*
 * Une seconde garde, sur l'ADRESSE de la base.
 *
 * `NODE_ENV` se pose à la main et se trompe : quelqu'un qui lance ce script
 * avec un `.env.local` pointant sur la base hébergée créerait un compte
 * administrateur en production sans qu'aucune variable ne le signale. On
 * vérifie donc que la base est bien locale.
 */
const estLocale = /^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])(:\d+)?/i.test(urlSupabase);
if (!estLocale) {
  console.error(
    `Refus : ${urlSupabase} n'est pas une base locale.\n` +
      'Ce script ne crée des administrateurs que sur la pile de développement.',
  );
  process.exit(1);
}

// ── Arguments ──────────────────────────────────────────────────────────────

const [emailDemande, motDePasseDemande, roleDemande] = process.argv.slice(2);

/**
 * Le rôle, borné à ce que la base accepte.
 *
 * Une valeur libre ferait échouer la mise à jour plus loin, sur un message de
 * contrainte SQL que personne ne relie à une faute de frappe en ligne de
 * commande. On refuse ici, où l'on peut encore dire ce qui était attendu.
 */
const ROLES = ['admin', 'user'];
const role = roleDemande ?? 'admin';

if (!ROLES.includes(role)) {
  console.error(`Rôle inconnu : ${role}. Attendu : ${ROLES.join(' ou ')}.`);
  process.exit(1);
}

const email = emailDemande ?? (role === 'admin' ? 'admin@editionmapoukam.test' : 'parent@editionmapoukam.test');

/**
 * Un mot de passe ALÉATOIRE par défaut, jamais une valeur écrite dans le code.
 *
 * Un défaut du genre « admin1234 » finit toujours par être réutilisé ailleurs,
 * et par survivre au développement. Celui-ci est affiché une fois et n'existe
 * nulle part dans le dépôt.
 *
 * Les règles du projet exigent dix caractères, une lettre et un chiffre : la
 * forme ci-dessous les tient par construction.
 */
const prefixe = role === 'admin' ? 'Adm' : 'Usr';
const motDePasse = motDePasseDemande ?? `${prefixe}-${randomBytes(9).toString('base64url')}-7`;

const service = createClient(urlSupabase, cleService, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// ── Création, ou promotion ─────────────────────────────────────────────────

async function trouverParEmail(adresse) {
  // `listUsers` pagine ; une base de développement tient largement dans la
  // première page, mais on cherche explicitement plutôt que de supposer.
  const { data, error } = await service.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) throw new Error(`Lecture des comptes impossible : ${error.message}`);
  return data.users.find((compte) => compte.email?.toLowerCase() === adresse.toLowerCase()) ?? null;
}

const existant = await trouverParEmail(email);
let id;
let cree = false;

if (existant) {
  id = existant.id;

  // Le compte existe : on ne recrée rien, on remet le mot de passe demandé et
  // on s'assure que l'adresse est confirmée. Relancer le script deux fois doit
  // donner le même résultat, jamais une erreur.
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
    // Confirmée d'emblée : sans cela, la connexion échouerait sur
    // `email_non_verifie` et il faudrait aller relever le code dans `.mails/`.
    email_confirm: true,
    user_metadata: { nom_complet: role === 'admin' ? 'Administration' : 'Compte de démonstration' },
  });

  if (error || !data.user) {
    console.error(`Création du compte impossible : ${error?.message ?? 'raison inconnue'}`);
    process.exit(1);
  }

  id = data.user.id;
  cree = true;
}

// Le rôle est posé par la clé de service, jamais par le client.
const { error: erreurRole } = await service.from('users').update({ role }).eq('id', id);
if (erreurRole) {
  console.error(`Pose du rôle « ${role} » impossible : ${erreurRole.message}`);
  process.exit(1);
}

// ── Compte rendu ───────────────────────────────────────────────────────────

const langue = 'fr';
console.log('');
console.log(
  cree ? `  Compte CRÉÉ, rôle « ${role} ».` : `  Compte existant MIS À JOUR, rôle « ${role} ».`,
);
console.log('');
console.log(`    Adresse       ${email}`);
console.log(`    Mot de passe  ${motDePasse}`);
console.log(`    Identifiant   ${id}`);
console.log('');
console.log(`    Rôle          ${role}`);
console.log('');
console.log(`    Connexion     http://localhost:3000/${langue}/connexion`);
if (role === 'admin') {
  console.log(`    Administration http://localhost:3000/${langue}/admin`);
}
console.log('');
console.log(
  "  Ce mot de passe n'est écrit nulle part dans le dépôt : notez-le maintenant.\n" +
    '  Relancer ce script avec la même adresse le remplacera.',
);
console.log('');

#!/usr/bin/env node
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';

const racine = process.cwd();
const cheminEnv = join(racine, '.env.local');

if (!existsSync(cheminEnv)) {
  console.error('.env.local est absent.');
  process.exit(1);
}

config({ path: cheminEnv, quiet: true });

const urlSupabase = process.env.NEXT_PUBLIC_SUPABASE_URL;
const cleService = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!urlSupabase || !cleService) {
  console.error('NEXT_PUBLIC_SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY manque.');
  process.exit(1);
}

const [emailDemande, motDePasseDemande, nomDemande] = process.argv.slice(2);

const email = emailDemande ?? 'utilisateur@mapoukam.fr';
const motDePasse = motDePasseDemande ?? 'User123456!';
const nomComplet = nomDemande ?? 'Utilisateur Test';

const service = createClient(urlSupabase, cleService, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { data: usersData, error: errList } = await service.auth.admin.listUsers({ page: 1, perPage: 1000 });
if (errList) {
  console.error(`Erreur lecture des comptes : ${errList.message}`);
  process.exit(1);
}

const existant = usersData?.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());

if (existant) {
  const { error } = await service.auth.admin.updateUserById(existant.id, {
    password: motDePasse,
    email_confirm: true,
  });
  if (error) {
    console.error(`Mise à jour échouée : ${error.message}`);
    process.exit(1);
  }
  console.log('');
  console.log('  Compte utilisateur normal MIS À JOUR.');
  console.log(`  Email : ${email}`);
  console.log(`  Mot de passe : ${motDePasse}`);
  console.log('');
} else {
  const { data, error } = await service.auth.admin.createUser({
    email,
    password: motDePasse,
    email_confirm: true,
    user_metadata: { nom_complet: nomComplet },
  });
  if (error || !data.user) {
    console.error(`Création échouée : ${error?.message}`);
    process.exit(1);
  }
  console.log('');
  console.log('  Compte utilisateur normal CRÉÉ.');
  console.log(`  Email : ${email}`);
  console.log(`  Mot de passe : ${motDePasse}`);
  console.log('');
}

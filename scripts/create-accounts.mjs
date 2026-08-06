import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://127.0.0.1:54321';
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!serviceKey) {
  console.error('SUPABASE_SERVICE_ROLE_KEY is missing');
  process.exit(1);
}

const supabase = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function createOrUpdateUser(email, password, role = 'user', name = 'Utilisateur') {
  // Check if auth user exists
  const { data: usersData } = await supabase.auth.admin.listUsers();
  const existingAuth = usersData?.users?.find(u => u.email === email);

  let userId;
  if (existingAuth) {
    console.log(`Utilisateur existant dans auth.users: ${email}`);
    userId = existingAuth.id;
    // Update password
    await supabase.auth.admin.updateUserById(userId, {
      password,
      email_confirm: true,
      user_metadata: { nom_complet: name }
    });
  } else {
    console.log(`Création du compte auth pour: ${email}`);
    const { data: created, error } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { nom_complet: name }
    });

    if (error) {
      console.error(`Erreur création ${email}:`, error.message);
      return null;
    }
    userId = created.user.id;
  }

  // Update role in public.users
  const { error: roleError } = await supabase
    .from('users')
    .update({ role })
    .eq('id', userId);

  if (roleError) {
    console.error(`Erreur rôle pour ${email}:`, roleError.message);
  } else {
    console.log(`Rôle '${role}' appliqué pour ${email}`);
  }

  return { id: userId, email, password, role };
}

async function main() {
  console.log('--- Création des comptes ---\n');

  const adminUser = await createOrUpdateUser(
    'admin@editionmapoukam.com',
    'AdminMapoukam2026!',
    'admin',
    'Administrateur Mapoukam'
  );

  const standardUser = await createOrUpdateUser(
    'utilisateur@editionmapoukam.com',
    'UserMapoukam2026!',
    'user',
    'Lecteur Mapoukam'
  );

  console.log('\n--- Comptes créés avec succès ---');
  console.log('Admin:', adminUser);
  console.log('Utilisateur:', standardUser);
}

main().catch(console.error);

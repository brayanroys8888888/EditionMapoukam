import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';

import type { AppSupabaseClient } from '@/lib/supabase/clients';
import type { Database } from '@/lib/supabase/database.types';

/**
 * Création de comptes de test.
 *
 * Les utilisateurs sont créés par l'API d'administration de Supabase Auth, et
 * non par insertion directe dans `auth.users` : c'est le chemin réel, et il
 * déclenche le trigger qui crée le profil dans `public.users`. Un test qui
 * court-circuiterait ce chemin ne prouverait rien sur le comportement réel.
 */
export interface TestUser {
  id: string;
  email: string;
  password: string;
  accessToken: string;
  /** Client soumis à RLS, agissant au nom de cet utilisateur. */
  client: AppSupabaseClient;
}

function env(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} absent : .env.local n’a pas été chargé.`);
  return value;
}

export function serviceClient(): AppSupabaseClient {
  return createClient<Database>(env('NEXT_PUBLIC_SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function anonClient(): AppSupabaseClient {
  return createClient<Database>(env('NEXT_PUBLIC_SUPABASE_URL'), env('NEXT_PUBLIC_SUPABASE_ANON_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function createTestUser(options: { admin?: boolean } = {}): Promise<TestUser> {
  const service = serviceClient();
  const email = `test-${randomUUID()}@exemple.test`;
  const password = `Mdp-${randomUUID()}`;

  const created = await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { nom_complet: 'Parent de test' },
  });
  if (created.error || !created.data.user) {
    throw new Error(`Création du compte de test impossible : ${created.error?.message ?? 'inconnu'}`);
  }
  const id = created.data.user.id;

  if (options.admin) {
    // Le rôle n'est jamais accordé par le client : il l'est ici par le rôle de
    // service, comme le ferait l'API d'administration de l'étape 13.
    const promoted = await service.from('users').update({ role: 'admin' }).eq('id', id);
    if (promoted.error) {
      throw new Error(`Promotion en admin impossible : ${promoted.error.message}`);
    }
  }

  const session = await anonClient().auth.signInWithPassword({ email, password });
  if (session.error || !session.data.session) {
    throw new Error(`Connexion du compte de test impossible : ${session.error?.message ?? 'inconnu'}`);
  }
  const accessToken = session.data.session.access_token;

  const client = createClient<Database>(
    env('NEXT_PUBLIC_SUPABASE_URL'),
    env('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
    {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
    },
  );

  return { id, email, password, accessToken, client };
}

export async function deleteTestUser(user: Pick<TestUser, 'id'>): Promise<void> {
  await serviceClient().auth.admin.deleteUser(user.id);
}

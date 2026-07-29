import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';

import type { AppSupabaseClient } from '@/lib/supabase/clients';
import type { Database } from '@/lib/supabase/database.types';
import { query } from './db';

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

/**
 * Nettoyage complet d'un compte de test.
 *
 * Depuis la migration 0012, plus aucune clé étrangère ne cascade depuis
 * `users` : supprimer l'identité d'authentification ne suffit plus, et la
 * ligne métier resterait derrière. Les tests doivent donc effacer eux-mêmes
 * leurs dépendances, dans l'ordre imposé par les contraintes.
 *
 * Ce nettoyage est une commodité de test, et non le chemin de production : en
 * production, un compte n'est jamais supprimé, il est anonymisé
 * (`anonymize_user`), puis purgé à l'échéance de conservation de ses factures.
 */
/** Nettoyage par adresse, pour les comptes créés via la route d'inscription. */
export async function deleteTestUserByEmail(email: string): Promise<void> {
  const lignes = await query<{ id: string }>(
    `select id from public.users where email = $1
     union select id from auth.users where email = $1`,
    [email],
  );
  for (const ligne of lignes) {
    await deleteTestUser({ id: ligne.id });
  }
}

export async function deleteTestUser(user: Pick<TestUser, 'id'>): Promise<void> {
  await query(`delete from public.favorites where user_id = $1`, [user.id]);
  await query(
    `delete from public.cart_items where cart_id in (select id from public.carts where user_id = $1)`,
    [user.id],
  );
  await query(`delete from public.carts where user_id = $1`, [user.id]);
  await query(`delete from public.entitlements where user_id = $1`, [user.id]);
  await query(`delete from public.reading_progress where user_id = $1`, [user.id]);
  await query(`delete from public.download_logs where user_id = $1`, [user.id]);
  // `download_copies` référence `users` en `on delete restrict` : sans cette
  // ligne, la suppression du compte de test échoue sur une violation de clé
  // étrangère. Les FICHIERS du stockage, eux, restent — c'est une commodité de
  // test, pas le chemin de production, qui passe par `effacerCopiesDe`.
  await query(`delete from public.download_copies where user_id = $1`, [user.id]);
  await query(`delete from public.promo_redemptions where user_id = $1`, [user.id]);
  await query(`delete from public.payment_events where user_id = $1`, [user.id]);
  await query(`delete from public.invoices where user_id = $1`, [user.id]);
  await query(`delete from public.orders where user_id = $1`, [user.id]);
  await query(`delete from public.subscriptions where user_id = $1`, [user.id]);
  await query(`update public.email_log set user_id = null where user_id = $1`, [user.id]);
  await query(`delete from public.users where id = $1`, [user.id]);
  await serviceClient().auth.admin.deleteUser(user.id);
}

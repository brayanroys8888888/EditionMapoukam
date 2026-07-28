import { createClient } from '@supabase/supabase-js';
import { getServerEnv } from '@/lib/config/env';
import type { Database } from './database.types';

/**
 * Client typé sur le schéma réel de la base.
 *
 * Les types sont générés par `npm run db:types` à partir de la base locale.
 * Toute requête mal orthographiée devient une erreur de compilation, et non
 * une réponse vide découverte à l'exécution.
 */
export type AppSupabaseClient = ReturnType<typeof createClient<Database>>;

/**
 * Fabriques de clients Supabase.
 *
 * Trois clients, trois niveaux de privilège, à ne jamais confondre :
 *
 *  - `anon`         — ce que voit un visiteur non connecté. Soumis à RLS.
 *  - `utilisateur`  — un client anon porteur du jeton d'un utilisateur.
 *                     Soumis à RLS, `auth.uid()` renseigné.
 *  - `service_role` — le serveur. CONTOURNE RLS, et vérifie donc lui-même les
 *                     droits contre `entitlements` avant chaque réponse
 *                     (CLAUDE.md règle 4).
 *
 * CLAUDE.md règle 2 : la clé `service_role` ne quitte jamais le serveur.
 */

const NO_PERSIST = {
  auth: { persistSession: false, autoRefreshToken: false },
} as const;

/** Client anonyme : les droits d'un visiteur non connecté. */
export function createAnonClient(): AppSupabaseClient {
  const env = getServerEnv();
  return createClient<Database>(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, NO_PERSIST);
}

/**
 * Client agissant au nom d'un utilisateur, à partir de son jeton d'accès.
 *
 * Il reste soumis à RLS : c'est précisément ce qui rend les politiques
 * testables de bout en bout.
 */
export function createUserClient(accessToken: string): AppSupabaseClient {
  if (!accessToken) {
    throw new Error('createUserClient : jeton d’accès vide.');
  }
  const env = getServerEnv();
  return createClient<Database>(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    ...NO_PERSIST,
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
}

/**
 * Client de service. Contourne RLS.
 *
 * À n'utiliser que dans du code serveur qui a lui-même vérifié les droits.
 * L'appel échoue franchement s'il est évalué dans un navigateur : mieux vaut
 * une erreur immédiate qu'une clé de service livrée au client.
 */
export function createServiceClient(): AppSupabaseClient {
  if (typeof window !== 'undefined') {
    throw new Error(
      'createServiceClient() a été appelée côté client. La clé service_role ne doit jamais quitter le serveur (CLAUDE.md règle 2).',
    );
  }
  const env = getServerEnv();
  return createClient<Database>(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, NO_PERSIST);
}

import { createServiceClient, createUserClient } from '@/lib/supabase/clients';
import { errors } from '@/lib/http/responses';
import { logger } from '@/lib/logger';
import { ACCESS_TOKEN_COOKIE, lireCookie } from './cookies';

/**
 * Identification de l'appelant et gardes de rôle.
 *
 * CLAUDE.md règle 4 : « Les droits sont toujours vérifiés côté serveur, à
 * chaque requête. Jamais de confiance accordée à un état transmis par le
 * client. » Le jeton présenté n'est donc pas décodé localement : il est
 * soumis à Supabase Auth, qui seul peut confirmer sa validité et sa
 * non-révocation.
 */

export interface Appelant {
  id: string;
  email: string;
  role: 'user' | 'admin';
  langue_preferee: string;
  suspendu: boolean;
  accessToken: string;
}

/**
 * Jeton d'accès de la requête.
 *
 * L'en-tête prime sur le cookie : un appel programmatique explicite doit
 * pouvoir agir au nom d'un autre compte que celui de la session du navigateur.
 */
export function extraireJeton(request: Request): string | null {
  const autorisation = request.headers.get('authorization');
  if (autorisation?.toLowerCase().startsWith('bearer ')) {
    const jeton = autorisation.slice('bearer '.length).trim();
    if (jeton) return jeton;
  }
  return lireCookie(request, ACCESS_TOKEN_COOKIE);
}

/**
 * Appelant authentifié, ou `null`.
 *
 * Deux allers-retours : l'un pour valider le jeton, l'autre pour lire le
 * profil métier. Le profil est lu avec le rôle de service afin que le rôle et
 * l'état de suspension proviennent de la base et non de ce que le client
 * voudrait bien laisser lire.
 */
export async function identifierAppelant(request: Request): Promise<Appelant | null> {
  const jeton = extraireJeton(request);
  if (!jeton) return null;

  const { data, error } = await createUserClient(jeton).auth.getUser();
  if (error || !data.user) return null;

  const profil = await createServiceClient()
    .from('users')
    .select('id, email, role, langue_preferee, suspendu')
    .eq('id', data.user.id)
    .maybeSingle();

  if (profil.error) {
    logger.error('Lecture du profil impossible', { detail: profil.error.message });
    return null;
  }
  if (!profil.data) {
    // Un compte d'authentification sans profil métier signale un déclencheur
    // en échec : à tracer, jamais à ignorer silencieusement.
    logger.error('Compte authentifié sans profil métier', { userId: data.user.id });
    return null;
  }

  return {
    id: profil.data.id,
    email: profil.data.email,
    role: profil.data.role,
    langue_preferee: profil.data.langue_preferee,
    suspendu: profil.data.suspendu,
    accessToken: jeton,
  };
}

export type GardeResultat =
  | { ok: true; appelant: Appelant }
  | { ok: false; response: Response };

/** Exige un utilisateur connecté et non suspendu. */
export async function requireUser(request: Request): Promise<GardeResultat> {
  const appelant = await identifierAppelant(request);
  if (!appelant) return { ok: false, response: errors.nonAuthentifie() };
  if (appelant.suspendu) return { ok: false, response: errors.compteSuspendu() };
  return { ok: true, appelant };
}

/**
 * Exige un administrateur.
 *
 * Un utilisateur ordinaire reçoit 403, un visiteur 401 : la distinction est
 * volontaire et testée route par route.
 */
export async function requireAdmin(request: Request): Promise<GardeResultat> {
  const garde = await requireUser(request);
  if (!garde.ok) return garde;
  if (garde.appelant.role !== 'admin') {
    return { ok: false, response: errors.interdit() };
  }
  return garde;
}

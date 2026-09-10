import { cookies } from 'next/headers';
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
  statut: 'actif' | 'suspendu' | 'anonymise';
  nom_complet?: string | null;
  telephone?: string | null;
  cree_le?: string;
  accessToken: string;
}

/** Génère un nom générique (ex. user8297) si aucun nom n'est renseigné. */
export function nomUtilisateurEffectif(nomComplet: string | null | undefined, userId: string): string {
  if (nomComplet && nomComplet.trim().length > 0) {
    return nomComplet.trim();
  }
  const suffixe = userId.replace(/[^0-9]/g, '').slice(-4) || userId.slice(-4) || '8297';
  return `user${suffixe}`;
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

  return _resoudreAppelant(jeton);
}

/**
 * Variante de `identifierAppelant` qui consulte aussi le magasin de cookies
 * de Next.js en repli.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ `headers()` DE NEXT.JS DANS UN SERVER COMPONENT OMET L'EN-TÊTE `cookie`.│
 * │                                                                          │
 * │ Le layout construit une `new Request('http://interne/', { headers })`    │
 * │ à partir de `headers()`. Or, `headers()` ne reporte PAS l'en-tête       │
 * │ `Cookie` : il ne contient que les en-têtes HTTP standards (host, etc.)   │
 * │ Le cookie de session posé par la Server Action est bien reçu par le      │
 * │ navigateur et renvoyé dans la requête suivante, mais `headers()` ne le   │
 * │ propage pas dans l'objet `Headers` retourné.                             │
 * │                                                                          │
 * │ Le magasin de cookies de Next.js (`cookies()`) y a accès, lui : c'est    │
 * │ le repli qu'emploie cette variante.                                      │
 * │                                                                          │
 * │ Les routes d'API, elles, reçoivent le vrai objet `Request` du serveur,   │
 * │ avec tous ses en-têtes — elles gardent `identifierAppelant`.             │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export async function identifierAppelantAvecCookies(request: Request): Promise<Appelant | null> {
  // Essayer d'abord par les en-têtes de la requête (Authorization ou Cookie).
  let jeton = extraireJeton(request);

  // Repli sur le magasin de cookies Next.js si l'en-tête Cookie est absent.
  if (!jeton) {
    try {
      const store = await cookies();
      jeton = store.get(ACCESS_TOKEN_COOKIE)?.value ?? null;
    } catch {
      // Hors contexte Next.js (tests unitaires), cookies() lève — c'est attendu.
    }
  }

  if (!jeton) return null;

  return _resoudreAppelant(jeton);
}

/** Résolution commune du profil à partir d'un jeton validé. */
async function _resoudreAppelant(jeton: string): Promise<Appelant | null> {
  const { data, error } = await createUserClient(jeton).auth.getUser();
  if (error || !data.user) return null;

  const profil = await createServiceClient()
    .from('users')
    .select('id, email, role, langue_preferee, statut, nom_complet, telephone, cree_le')
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

  const nomEff = nomUtilisateurEffectif(profil.data.nom_complet, profil.data.id);

  return {
    id: profil.data.id,
    email: profil.data.email,
    role: profil.data.role,
    langue_preferee: profil.data.langue_preferee,
    statut: profil.data.statut,
    nom_complet: nomEff,
    telephone: profil.data.telephone,
    cree_le: profil.data.cree_le,
    accessToken: jeton,
  };
}

export type GardeResultat =
  | { ok: true; appelant: Appelant }
  | { ok: false; response: Response };

/** Exige un compte connecté et actif. */
export async function requireUser(request: Request): Promise<GardeResultat> {
  const appelant = await identifierAppelant(request);
  if (!appelant) return { ok: false, response: errors.nonAuthentifie() };
  if (appelant.statut === 'suspendu') return { ok: false, response: errors.compteSuspendu() };
  if (appelant.statut === 'anonymise') {
    // Un compte anonymisé n'a plus d'identité d'authentification : son jeton ne
    // devrait plus valider. Le cas est traité malgré tout, parce qu'un jeton
    // encore en circulation ne doit jamais rouvrir un compte effacé.
    return { ok: false, response: errors.nonAuthentifie() };
  }
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

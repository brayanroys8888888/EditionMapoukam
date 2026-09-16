import type { LangueInterface } from '@/i18n';

/**
 * CONNEXION PAR GOOGLE — la part qui ne parle à personne.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ CE FICHIER N'OUVRE AUCUNE CONNEXION, ET C'EST DÉLIBÉRÉ.                 │
 * │                                                                          │
 * │ Il ne porte que du calcul : le couple vérifieur/défi de PKCE, l'adresse  │
 * │ d'autorisation, le cookie qui transporte l'état. Tout y est donc         │
 * │ éprouvable par un test unitaire, sans base, sans réseau et sans compte   │
 * │ Google — ce qui est exactement ce qu'on veut d'un mécanisme dont         │
 * │ personne ne relira jamais le déroulé en production.                      │
 * │                                                                          │
 * │ Il n'importe rien de Node : le chiffrement passe par l'API Web, présente │
 * │ aussi bien dans Node 20 que sur l'exécution en périphérie. Un composant  │
 * │ peut donc importer `lienGoogle` sans faire entrer `node:crypto` dans le  │
 * │ paquet du navigateur.                                                    │
 * └──────────────────────────────────────────────────────────────────────────┘
 */

/** Les trois états de l'interrupteur `AUTH_GOOGLE`. */
export type ModeGoogle = 'desactive' | 'supabase' | 'better-auth';

/** Chemin d'entrée, commun aux deux chemins. L'écran ne connaît que celui-ci. */
export const CHEMIN_GOOGLE = '/api/auth/google';

/** Chemin de retour, commun aux deux chemins. */
export const CHEMIN_GOOGLE_RETOUR = '/api/auth/google/retour';

/** Racine des routes de Better Auth, quand c'est lui qui sert. */
export const BASE_BETTER_AUTH = '/api/better-auth';

/**
 * Cookie d'état de l'échange.
 *
 * Il porte le vérifieur PKCE et la langue de l'écran d'où l'on est parti. Sa
 * durée est courte : un échange OAuth qui dépasse dix minutes n'est plus un
 * échange, c'est un onglet oublié.
 */
export const COOKIE_GOOGLE = 'contes_google_oauth';
export const DUREE_COOKIE_GOOGLE_SECONDES = 600;

/**
 * Lien du bouton « Continuer avec Google ».
 *
 * La langue voyage dans l'URL et non dans un cookie : c'est elle qui décidera
 * de l'écran de retour, y compris si l'échange échoue — et un refus rendu en
 * français à un lecteur anglophone est un refus qu'il ne comprend pas.
 */
export function lienGoogle(langue: LangueInterface): string {
  return `${CHEMIN_GOOGLE}?langue=${langue}`;
}

// ═══════════════════════════════════════════════════════════════════════════
// PKCE
// ═══════════════════════════════════════════════════════════════════════════

function base64url(octets: Uint8Array): string {
  let binaire = '';
  for (const octet of octets) binaire += String.fromCharCode(octet);
  return btoa(binaire).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Vérifieur PKCE — le secret qui ne quitte jamais ce serveur.
 *
 * 48 octets, soit 384 bits de hasard cryptographique. La spécification en
 * autorise 32 caractères au minimum ; on ne s'en approche pas, parce que ce
 * secret est la SEULE chose qui empêche qu'un code d'autorisation intercepté
 * soit échangé par quelqu'un d'autre.
 */
export function fabriquerVerifieur(): string {
  const octets = new Uint8Array(48);
  crypto.getRandomValues(octets);
  return base64url(octets);
}

/** Défi PKCE : l'empreinte SHA-256 du vérifieur, que Google reçoit à l'aller. */
export async function defiDepuisVerifieur(verifieur: string): Promise<string> {
  const empreinte = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifieur));
  return base64url(new Uint8Array(empreinte));
}

// ═══════════════════════════════════════════════════════════════════════════
// ÉTAT TRANSPORTÉ PAR LE COOKIE
// ═══════════════════════════════════════════════════════════════════════════

export interface EtatGoogle {
  verifieur: string;
  langue: LangueInterface;
}

/**
 * Sérialisation de l'état.
 *
 * Un point sépare les deux champs. Il ne peut pas y en avoir dans le vérifieur,
 * qui est du base64url — c'est ce qui rend la lecture non ambiguë sans qu'on
 * ait à encoder du JSON dans un cookie.
 */
export function encoderEtat(etat: EtatGoogle): string {
  return `${etat.verifieur}.${etat.langue}`;
}

/** Lecture de l'état. Rend `null` sur tout ce qui n'a pas la forme attendue. */
export function decoderEtat(valeur: string | null | undefined): EtatGoogle | null {
  if (!valeur) return null;

  const separateur = valeur.lastIndexOf('.');
  if (separateur <= 0) return null;

  const verifieur = valeur.slice(0, separateur);
  const langue = valeur.slice(separateur + 1);

  if (!/^[A-Za-z0-9_-]{32,}$/.test(verifieur)) return null;
  if (langue !== 'fr' && langue !== 'en') return null;

  return { verifieur, langue };
}

/**
 * Cookie d'état, et son effacement.
 *
 * `HttpOnly` pour la même raison que les jetons de session : du JavaScript de
 * page qui lirait le vérifieur rendrait PKCE décoratif.
 */
export function cookieEtat(valeur: string, options: { secure: boolean }): string {
  const parties = [
    `${COOKIE_GOOGLE}=${valeur}`,
    'Path=/',
    'HttpOnly',
    // `Lax` et non `Strict` : le retour vient d'un autre site — Google, ou
    // Supabase. `Strict` retiendrait le cookie exactement à ce moment-là, et
    // l'échange échouerait sur un vérifieur « absent » parfaitement présent.
    'SameSite=Lax',
    `Max-Age=${String(DUREE_COOKIE_GOOGLE_SECONDES)}`,
  ];
  if (options.secure) parties.push('Secure');
  return parties.join('; ');
}

export function cookieEtatEfface(options: { secure: boolean }): string {
  const parties = [`${COOKIE_GOOGLE}=`, 'Path=/', 'HttpOnly', 'SameSite=Lax', 'Max-Age=0'];
  if (options.secure) parties.push('Secure');
  return parties.join('; ');
}

// ═══════════════════════════════════════════════════════════════════════════
// ADRESSE D'AUTORISATION — CHEMIN SUPABASE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * L'adresse d'autorisation est construite ICI, plutôt que demandée à
 * `signInWithOAuth`.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LE CLIENT SUPABASE RANGE LE VÉRIFIEUR DANS SON PROPRE MAGASIN.          │
 * │                                                                          │
 * │ Dans un navigateur, ce magasin est `localStorage` et il survit à la      │
 * │ redirection. Sur le serveur, il vit dans une instance créée à la volée   │
 * │ et détruite avec la réponse : le vérifieur serait donc PERDU avant même  │
 * │ que Google réponde, et l'échange échouerait systématiquement.            │
 * │                                                                          │
 * │ On fabrique donc l'adresse à la main et l'on range le vérifieur dans un  │
 * │ cookie, qui est le seul magasin dont on sache qu'il revient avec         │
 * │ l'utilisateur. C'est aussi ce qui rend cette fonction testable hors      │
 * │ ligne.                                                                   │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export function urlAutorisationSupabase(options: {
  supabaseUrl: string;
  retourUrl: string;
  defi: string;
}): string {
  const url = new URL('/auth/v1/authorize', options.supabaseUrl);
  url.searchParams.set('provider', 'google');
  url.searchParams.set('redirect_to', options.retourUrl);
  url.searchParams.set('code_challenge', options.defi);
  url.searchParams.set('code_challenge_method', 's256');
  return url.toString();
}

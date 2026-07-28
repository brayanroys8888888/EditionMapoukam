/**
 * Cookies de session.
 *
 * Ce chantier est backend : le porteur naturel du jeton est l'en-tête
 * `Authorization`. Les cookies existent malgré tout, parce que la console de
 * simulation `/dev` est servie dans un navigateur et qu'un navigateur ne pose
 * pas d'en-tête d'autorisation sur une navigation ordinaire.
 *
 * Les deux jetons sont `HttpOnly` : du JavaScript de page ne doit jamais
 * pouvoir les lire, sinon une faille XSS deviendrait un vol de session.
 */
export const ACCESS_TOKEN_COOKIE = 'contes_access_token';
export const REFRESH_TOKEN_COOKIE = 'contes_refresh_token';

interface CookieOptions {
  maxAgeSeconds: number;
  secure: boolean;
}

function serialise(nom: string, valeur: string, options: CookieOptions): string {
  const parties = [
    `${nom}=${valeur}`,
    'Path=/',
    'HttpOnly',
    // `Lax` et non `None` : le cookie ne part pas sur une requête inter-site,
    // ce qui neutralise l'essentiel des attaques CSRF (§5.2).
    'SameSite=Lax',
    `Max-Age=${String(options.maxAgeSeconds)}`,
  ];
  if (options.secure) parties.push('Secure');
  return parties.join('; ');
}

/**
 * Cookies posés à la connexion.
 *
 * `Secure` est absent en développement, faute de quoi le navigateur refuserait
 * le cookie sur `http://localhost`.
 */
export function cookiesDeSession(session: {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}): string[] {
  const secure = process.env['NODE_ENV'] === 'production';
  return [
    serialise(ACCESS_TOKEN_COOKIE, session.access_token, {
      maxAgeSeconds: session.expires_in,
      secure,
    }),
    serialise(REFRESH_TOKEN_COOKIE, session.refresh_token, {
      maxAgeSeconds: 30 * 24 * 3600,
      secure,
    }),
  ];
}

/** Cookies posés à la déconnexion : mêmes noms, durée nulle. */
export function cookiesEffaces(): string[] {
  const secure = process.env['NODE_ENV'] === 'production';
  return [
    serialise(ACCESS_TOKEN_COOKIE, '', { maxAgeSeconds: 0, secure }),
    serialise(REFRESH_TOKEN_COOKIE, '', { maxAgeSeconds: 0, secure }),
  ];
}

/** Lit un cookie dans l'en-tête `Cookie` d'une requête. */
export function lireCookie(request: Request, nom: string): string | null {
  const entete = request.headers.get('cookie');
  if (!entete) return null;

  for (const morceau of entete.split(';')) {
    const separateur = morceau.indexOf('=');
    if (separateur === -1) continue;
    if (morceau.slice(0, separateur).trim() === nom) {
      return decodeURIComponent(morceau.slice(separateur + 1).trim());
    }
  }
  return null;
}

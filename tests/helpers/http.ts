/**
 * Fabrication de requêtes pour les gestionnaires de routes.
 *
 * Les gestionnaires sont écrits comme des fonctions `Request → Response`, sans
 * dépendre du contexte asynchrone de Next.js. Un test peut donc les appeler
 * directement, sans démarrer de serveur : c'est le vrai code qui est éprouvé,
 * pas une imitation, et la suite reste rapide.
 */
const ORIGINE = 'http://localhost:3000';

interface Options {
  jeton?: string;
  cookie?: string;
  ip?: string;
  headers?: Record<string, string>;
}

function entetes(options: Options, avecCorps: boolean): Headers {
  const headers = new Headers(options.headers);
  if (avecCorps) headers.set('content-type', 'application/json');
  if (options.jeton) headers.set('authorization', `Bearer ${options.jeton}`);
  if (options.cookie) headers.set('cookie', options.cookie);
  if (options.ip) headers.set('x-forwarded-for', options.ip);
  return headers;
}

export function postJson(chemin: string, corps: unknown, options: Options = {}): Request {
  return new Request(`${ORIGINE}${chemin}`, {
    method: 'POST',
    headers: entetes(options, true),
    body: typeof corps === 'string' ? corps : JSON.stringify(corps),
  });
}

export function get(chemin: string, options: Options = {}): Request {
  return new Request(`${ORIGINE}${chemin}`, {
    method: 'GET',
    headers: entetes(options, false),
  });
}

/** Corps JSON d'une réponse, typé par l'appelant. */
export async function corpsJson<T>(reponse: Response): Promise<T> {
  return (await reponse.json()) as T;
}

export interface ReponseErreur {
  erreur: { code: string; message: string; champs?: Record<string, string[]> };
}

/** Cookies posés par une réponse. */
export function cookiesPoses(reponse: Response): string[] {
  return reponse.headers.getSetCookie();
}

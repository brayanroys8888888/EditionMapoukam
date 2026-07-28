import { logger } from '@/lib/logger';

/**
 * Réponses HTTP normalisées.
 *
 * CLAUDE.md : « Les erreurs renvoyées au client ne divulguent jamais de détail
 * interne. » Le message technique part dans le journal ; le client reçoit un
 * code stable et une phrase en français.
 *
 * Le code (`code`) est destiné au programme appelant, le message (`message`) à
 * l'utilisateur. Séparer les deux évite de voir un jour une interface analyser
 * une chaîne française pour décider d'un comportement.
 */

export interface ApiError {
  code: string;
  message: string;
  /** Détail par champ, uniquement pour les erreurs de validation. */
  champs?: Record<string, string[]>;
}

const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8' } as const;

function withCookies(headers: Record<string, string>, cookies?: readonly string[]): Headers {
  const result = new Headers(headers);
  for (const cookie of cookies ?? []) {
    result.append('set-cookie', cookie);
  }
  return result;
}

export function ok<T>(data: T, options: { cookies?: readonly string[] } = {}): Response {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: withCookies({ ...JSON_HEADERS }, options.cookies),
  });
}

export function created<T>(data: T, options: { cookies?: readonly string[] } = {}): Response {
  return new Response(JSON.stringify(data), {
    status: 201,
    headers: withCookies({ ...JSON_HEADERS }, options.cookies),
  });
}

export function noContent(options: { cookies?: readonly string[] } = {}): Response {
  return new Response(null, { status: 204, headers: withCookies({}, options.cookies) });
}

/**
 * Erreur destinée au client.
 *
 * `detailInterne` n'est jamais sérialisé : il ne sert qu'au journal.
 */
export function fail(
  status: number,
  error: ApiError,
  options: { detailInterne?: unknown; headers?: Record<string, string> } = {},
): Response {
  if (options.detailInterne !== undefined) {
    logger.warn('Réponse en erreur', {
      status,
      code: error.code,
      detail: options.detailInterne,
    });
  }
  return new Response(JSON.stringify({ erreur: error }), {
    status,
    headers: { ...JSON_HEADERS, ...options.headers },
  });
}

export const errors = {
  validation: (champs: Record<string, string[]>): Response =>
    fail(400, {
      code: 'requete_invalide',
      message: 'La requête est invalide.',
      champs,
    }),

  corpsIllisible: (): Response =>
    fail(400, { code: 'corps_illisible', message: 'Le corps de la requête n’est pas un JSON valide.' }),

  nonAuthentifie: (): Response =>
    fail(401, { code: 'non_authentifie', message: 'Vous devez être connecté.' }),

  identifiantsInvalides: (): Response =>
    // Volontairement identique pour un email inconnu et un mot de passe faux :
    // distinguer les deux permettrait d'énumérer les comptes existants.
    fail(401, {
      code: 'identifiants_invalides',
      message: 'Adresse email ou mot de passe incorrect.',
    }),

  emailNonVerifie: (): Response =>
    fail(403, {
      code: 'email_non_verifie',
      message: 'Vérifiez votre adresse email avant de vous connecter.',
    }),

  compteSuspendu: (): Response =>
    fail(403, { code: 'compte_suspendu', message: 'Ce compte est suspendu.' }),

  interdit: (): Response =>
    fail(403, { code: 'interdit', message: 'Vous n’avez pas accès à cette ressource.' }),

  introuvable: (): Response =>
    fail(404, { code: 'introuvable', message: 'Ressource introuvable.' }),

  tropDeRequetes: (retryAfterSeconds: number): Response =>
    fail(
      429,
      {
        code: 'trop_de_requetes',
        message: 'Trop de tentatives. Réessayez dans un instant.',
      },
      { headers: { 'retry-after': String(retryAfterSeconds) } },
    ),

  interne: (detailInterne?: unknown): Response =>
    fail(
      500,
      { code: 'erreur_interne', message: 'Une erreur est survenue. Réessayez plus tard.' },
      { detailInterne },
    ),
};

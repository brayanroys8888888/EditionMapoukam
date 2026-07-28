import type { ZodError, ZodType } from 'zod';

import { errors } from './responses';

/**
 * Validation des entrées.
 *
 * CLAUDE.md : « Toute route API valide ses entrées avec Zod avant tout
 * traitement. » Le résultat est une union discriminée : il est impossible de
 * lire `data` sans avoir traité le cas d'échec, le compilateur s'y oppose.
 */
export type ValidationResult<T> =
  | { ok: true; data: T }
  | { ok: false; response: Response };

function champs(error: ZodError): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const cle = issue.path.length > 0 ? issue.path.join('.') : '_';
    (result[cle] ??= []).push(issue.message);
  }
  return result;
}

/** Valide le corps JSON d'une requête. */
export async function parseJsonBody<T>(
  request: Request,
  schema: ZodType<T>,
): Promise<ValidationResult<T>> {
  let brut: unknown;
  try {
    brut = await request.json();
  } catch {
    return { ok: false, response: errors.corpsIllisible() };
  }

  const parsed = schema.safeParse(brut);
  if (!parsed.success) {
    return { ok: false, response: errors.validation(champs(parsed.error)) };
  }
  return { ok: true, data: parsed.data };
}

/** Valide les paramètres de requête d'une URL. */
export function parseSearchParams<T>(request: Request, schema: ZodType<T>): ValidationResult<T> {
  const url = new URL(request.url);
  const brut: Record<string, string> = {};
  for (const [cle, valeur] of url.searchParams.entries()) {
    brut[cle] = valeur;
  }

  const parsed = schema.safeParse(brut);
  if (!parsed.success) {
    return { ok: false, response: errors.validation(champs(parsed.error)) };
  }
  return { ok: true, data: parsed.data };
}

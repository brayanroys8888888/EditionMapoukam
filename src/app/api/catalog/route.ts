import { errors, ok } from '@/lib/http/responses';
import { parseSearchParams } from '@/lib/http/validate';
import { catalogQuerySchema, trancheAgeCoherente } from '@/domain/catalog/schemas';
import { listerCatalogue } from '@/lib/catalog/repository';
import { identifierAppelant } from '@/lib/auth/session';
import { logger } from '@/lib/logger';

/**
 * Catalogue — §4.1 F2.
 *
 * Ouverte aux visiteurs : parcourir le catalogue ne demande pas de compte
 * (§2.2). L'appelant est identifié s'il présente un jeton, uniquement pour
 * enrichir chaque titre de son état d'accès.
 *
 * Brouillons et titres archivés n'en sortent jamais : le filtre est dans la
 * fonction SQL, et un test le vérifie.
 */
export async function GET(request: Request): Promise<Response> {
  const query = parseSearchParams(request, catalogQuerySchema);
  if (!query.ok) return query.response;

  if (!trancheAgeCoherente(query.data)) {
    return errors.validation({
      age_min: ['La tranche d’âge est incohérente : l’âge minimum dépasse l’âge maximum.'],
    });
  }

  // Un jeton absent ou invalide n'est pas une erreur ici : c'est un visiteur.
  const appelant = await identifierAppelant(request);

  try {
    const page = await listerCatalogue(appelant?.id ?? null, query.data);
    return ok(page);
  } catch (erreur) {
    logger.error('Catalogue illisible', { detail: erreur });
    return errors.interne(erreur);
  }
}

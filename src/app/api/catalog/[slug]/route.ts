import { errors, ok } from '@/lib/http/responses';
import { parseSearchParams } from '@/lib/http/validate';
import { ficheQuerySchema } from '@/domain/catalog/schemas';
import { lireFiche } from '@/lib/catalog/repository';
import { identifierAppelant } from '@/lib/auth/session';
import { logger } from '@/lib/logger';

/**
 * Fiche d'un titre — §4.1 F3.
 *
 * Un brouillon, un titre archivé et un slug inconnu renvoient tous 404 : du
 * point de vue d'un visiteur, ces trois cas doivent se ressembler, faute de
 * quoi le catalogue à venir serait devinable un slug à la fois.
 */
export async function GET(
  request: Request,
  contexte: { params: Promise<{ slug: string }> },
): Promise<Response> {
  const query = parseSearchParams(request, ficheQuerySchema);
  if (!query.ok) return query.response;

  const { slug } = await contexte.params;
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) {
    return errors.introuvable();
  }

  const appelant = await identifierAppelant(request);

  try {
    const fiche = await lireFiche(appelant?.id ?? null, slug, query.data);
    if (!fiche) return errors.introuvable();
    return ok(fiche);
  } catch (erreur) {
    logger.error('Fiche illisible', { detail: erreur });
    return errors.interne(erreur);
  }
}

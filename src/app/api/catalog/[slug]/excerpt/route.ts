import { createServiceClient } from '@/lib/supabase/clients';
import { errors, fail, ok } from '@/lib/http/responses';
import { parseSearchParams } from '@/lib/http/validate';
import { extraitQuerySchema } from '@/domain/catalog/schemas';
import { identifierAppelant } from '@/lib/auth/session';
import { servirPage, sommaire } from '@/lib/content/page-service';
import { adresseAppelant, RateLimiter } from '@/lib/http/rate-limit';
import { getServerEnv } from '@/lib/config/env';
import { logger } from '@/lib/logger';

/**
 * Extrait d'un titre — §4.1 F3, « Lire un extrait ».
 *
 * Ouverte aux visiteurs : c'est même sa raison d'être. Le nombre de pages
 * consultables vient de `books.nb_pages_extrait`, par titre — certains contes
 * courts ne supportent pas qu'on en dévoile cinq pages (docs/PLAN.md D3
 * point 8).
 *
 * Cette route ne décide de rien : elle délègue à `src/lib/content/page-service`,
 * seul module autorisé à lire les pages d'un livre, et où la vérification des
 * droits est intégrée. Un conte gratuit y est servi intégralement, un titre
 * payant s'y arrête à la limite de l'extrait.
 */
const limiteurAnonyme = new RateLimiter();

export async function GET(
  request: Request,
  contexte: { params: Promise<{ slug: string }> },
): Promise<Response> {
  const query = parseSearchParams(request, extraitQuerySchema);
  if (!query.ok) return query.response;

  const { slug } = await contexte.params;
  const appelant = await identifierAppelant(request);

  // D3 point 6 — un livre entier accessible sans compte est une cible
  // d'aspiration automatisée. La limitation ne vise que les visiteurs :
  // un utilisateur connecté est déjà identifiable et traçable.
  if (!appelant) {
    const decision = limiteurAnonyme.consommer(adresseAppelant(request), {
      limite: getServerEnv().ANON_PAGE_RATE_LIMIT,
      fenetreMs: 3_600_000,
    });
    if (!decision.autorise) {
      logger.warn('Lecture anonyme au-delà du quota', { ip: adresseAppelant(request) });
      return errors.tropDeRequetes(decision.retryAfter);
    }
  }

  const client = createServiceClient();
  const livre = await client
    .from('books')
    .select('id')
    .eq('slug', slug)
    .eq('statut', 'publie')
    .maybeSingle();

  if (livre.error || !livre.data) return errors.introuvable();

  const resultat = await servirPage(
    appelant?.id ?? null,
    { bookId: livre.data.id, langue: query.data.langue, numero: query.data.page },
    { client },
  );

  if (!resultat.ok) {
    switch (resultat.raison) {
      case 'traduction_introuvable':
      case 'page_introuvable':
        return errors.introuvable();
      case 'hors_extrait':
        return fail(403, {
          code: 'hors_extrait',
          message:
            'Cette page dépasse l’extrait consultable. Achetez le titre ou abonnez-vous pour lire la suite.',
        });
      default:
        return errors.interdit();
    }
  }

  const resume = await sommaire(appelant?.id ?? null, livre.data.id, query.data.langue, { client });

  return ok({
    page: {
      numero: resultat.page.numero,
      largeur: resultat.page.largeur,
      hauteur: resultat.page.hauteur,
      texte: resultat.page.texte,
      au_titre_de_l_extrait: resultat.page.auTitreDeLExtrait,
    },
    // Aucun chemin de stockage n'est renvoyé : l'image passera par une route
    // dédiée qui émet une URL signée (étape 6).
    lecture: resume,
    motif: resultat.motif,
  });
}

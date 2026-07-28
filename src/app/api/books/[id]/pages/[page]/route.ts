import { z } from 'zod';

import { createServiceClient } from '@/lib/supabase/clients';
import { errors, fail } from '@/lib/http/responses';
import { parseSearchParams } from '@/lib/http/validate';
import { identifierAppelant } from '@/lib/auth/session';
import { servirPage } from '@/lib/content/page-service';
import { signer } from '@/lib/storage/signed-url';
import { adresseAppelant, RateLimiter } from '@/lib/http/rate-limit';
import { getServerEnv } from '@/lib/config/env';
import { logger } from '@/lib/logger';

/**
 * Une page de livre — §9.3, §10.1.
 *
 * UNE page, UNE URL signée. Jamais le livre entier : « Chargement page par
 * page — empêche la récupération du livre complet en une requête » (§10.1).
 *
 * CHEMIN UNIQUE, y compris pour les contes gratuits (docs/PLAN.md D3 point 7).
 * Seules la durée de validité et l'en-tête de cache diffèrent. Un second chemin
 * « allégé » pour les titres gratuits aurait fini par diverger de celui-ci, et
 * la divergence aurait porté sur le contrôle d'accès.
 */
const requeteSchema = z.object({
  langue: z.enum(['fr', 'en']).default('fr'),
  /**
   * §5.1 : « une partie de l'audience potentiellement située en Afrique où les
   * connexions peuvent être plus lentes, l'optimisation des images est
   * critique ». D'où deux résolutions, et le choix laissé au client.
   */
  resolution: z.enum(['haute', 'allegee']).default('haute'),
});

const limiteurAnonyme = new RateLimiter();

export async function GET(
  request: Request,
  contexte: { params: Promise<{ id: string; page: string }> },
): Promise<Response> {
  const query = parseSearchParams(request, requeteSchema);
  if (!query.ok) return query.response;

  const { id, page } = await contexte.params;
  if (!z.uuid().safeParse(id).success) return errors.introuvable();

  const numero = Number(page);
  if (!Number.isInteger(numero) || numero < 1 || numero > 2000) {
    return errors.validation({ page: ['Numéro de page invalide.'] });
  }

  const appelant = await identifierAppelant(request);

  // D3 point 6 — un livre entier lisible sans compte est une cible
  // d'aspiration automatisée. Seuls les visiteurs sont limités : un utilisateur
  // connecté est déjà identifiable, et son quota de lecture n'a pas lieu d'être.
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
  const resultat = await servirPage(
    appelant?.id ?? null,
    { bookId: id, langue: query.data.langue, numero },
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

  const chemin =
    query.data.resolution === 'allegee' ? resultat.page.cheminAllegee : resultat.page.cheminHaute;

  const signee = await signer(chemin, {
    livreGratuit: resultat.page.livreGratuit,
    client,
  });
  if (!signee) return errors.introuvable();

  return new Response(
    JSON.stringify({
      page: {
        numero: resultat.page.numero,
        largeur: resultat.page.largeur,
        hauteur: resultat.page.hauteur,
        au_titre_de_l_extrait: resultat.page.auTitreDeLExtrait,
      },
      url: signee.url,
      expire_le: signee.expireLe,
      motif: resultat.motif,
    }),
    {
      status: 200,
      headers: {
        'content-type': 'application/json; charset=utf-8',
        // Un contenu payant ne se met jamais en cache partagé : la réponse
        // porte une URL signée nominative. Seuls les titres gratuits sont
        // cachables par le CDN (D6).
        'cache-control': resultat.page.livreGratuit
          ? `public, max-age=${String(signee.expireDansSecondes)}`
          : 'private, no-store',
      },
    },
  );
}


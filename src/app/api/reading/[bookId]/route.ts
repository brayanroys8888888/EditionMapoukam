import { z } from 'zod';

import { requireUser } from '@/lib/auth/session';
import { errors, fail, ok } from '@/lib/http/responses';
import { parseJsonBody, parseSearchParams } from '@/lib/http/validate';
import { RateLimiter } from '@/lib/http/rate-limit';
import { enregistrerProgression, lireReprise } from '@/lib/reading/progress';

/**
 * Progression de lecture — §4.2 F7.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ CETTE ROUTE NE DOIT NI BLOQUER NI RALENTIR LA LECTURE.                  │
 * │                                                                          │
 * │ Sur connexion lente — §5.1 — ces écritures s'empilent derrière la        │
 * │ lecture des pages, qui est ce que l'utilisateur attend vraiment. Elle    │
 * │ répond donc succès aussi bien quand l'écriture est retenue que lorsqu'   │
 * │ elle est regroupée : distinguer les deux pousserait un client à          │
 * │ réessayer, c'est-à-dire à défaire le regroupement.                       │
 * └──────────────────────────────────────────────────────────────────────────┘
 */

/**
 * Limitation de débit.
 *
 * Le regroupement absorbe déjà la cadence normale d'un feuilletage. Ce quota
 * vise ce que le regroupement ne voit pas : un client qui viserait des LIVRES
 * différents en rafale, ce qu'aucune lecture réelle ne fait.
 */
const QUOTA = { limite: 120, fenetreMs: 60 * 1000 } as const;

const limiteur = new RateLimiter();

const langueSchema = z.object({
  langue: z.enum(['fr', 'en']).default('fr'),
});

const progressionSchema = z.object({
  langue: z.enum(['fr', 'en']).default('fr'),
  page: z.int().positive().max(10_000),
});

/** Page de reprise. N'exige aucun droit d'accès au titre — voir plus bas. */
export async function GET(
  request: Request,
  contexte: { params: Promise<{ bookId: string }> },
): Promise<Response> {
  const garde = await requireUser(request);
  if (!garde.ok) return garde.response;

  const query = parseSearchParams(request, langueSchema);
  if (!query.ok) return query.response;

  const { bookId } = await contexte.params;
  if (!z.uuid().safeParse(bookId).success) return errors.introuvable();

  // ┌────────────────────────────────────────────────────────────────────────┐
  // │ LA PROGRESSION SURVIT À LA PERTE D'ACCÈS.                             │
  // │                                                                        │
  // │ Un abonnement expiré ne l'efface pas : un réabonnement doit reprendre  │
  // │ là où l'enfant s'était arrêté. Lire sa propre progression n'exige donc │
  // │ aucun droit sur le titre — seulement d'être connecté.                  │
  // └────────────────────────────────────────────────────────────────────────┘
  const reprise = await lireReprise(garde.appelant.id, bookId, query.data.langue);

  return ok({
    page: reprise.page,
    langue: query.data.langue,
    // Renseigné quand la reprise vient d'une AUTRE version linguistique :
    // l'interface peut alors le dire, plutôt que de laisser l'utilisateur
    // s'étonner d'arriver au milieu du livre.
    reprise_depuis: reprise.langueOrigine,
    // Vrai quand la page a dû être ramenée à la longueur de la version
    // ouverte, les deux versions n'ayant pas la même pagination.
    ramenee_a_la_fin: reprise.borneAppliquee,
  });
}

/** Enregistre la progression. Exige un droit de lecture effectif. */
export async function PUT(
  request: Request,
  contexte: { params: Promise<{ bookId: string }> },
): Promise<Response> {
  const garde = await requireUser(request);
  if (!garde.ok) return garde.response;

  const corps = await parseJsonBody(request, progressionSchema);
  if (!corps.ok) return corps.response;

  const { bookId } = await contexte.params;
  if (!z.uuid().safeParse(bookId).success) return errors.introuvable();

  const quota = limiteur.consommer(`progression:${garde.appelant.id}`, QUOTA);
  if (!quota.autorise) {
    return errors.tropDeRequetes(quota.retryAfter);
  }

  const resultat = await enregistrerProgression(
    garde.appelant.id,
    bookId,
    corps.data.langue,
    corps.data.page,
  );

  if (!resultat.ok) {
    switch (resultat.raison) {
      case 'acces_refuse':
        // ┌──────────────────────────────────────────────────────────────────┐
        // │ ÉCRIRE exige un droit de lecture effectif. Sans cela, la table   │
        // │ deviendrait un moyen de sonder l'existence d'identifiants de     │
        // │ livres — et un journal des titres qu'on a tenté d'ouvrir sans y  │
        // │ avoir droit.                                                     │
        // └──────────────────────────────────────────────────────────────────┘
        return fail(403, {
          code: 'lecture_non_autorisee',
          message: 'Vous n’avez pas accès à ce titre.',
        });

      case 'version_introuvable':
        return errors.introuvable();

      case 'page_hors_bornes':
        return errors.validation({
          page: ['Cette page n’existe pas dans cette version du livre.'],
        });
    }
  }

  return ok({
    page: resultat.page,
    // `false` signale un regroupement, PAS un échec : le client ne doit pas
    // réessayer, il défferait le regroupement.
    enregistree: resultat.enregistree,
  });
}

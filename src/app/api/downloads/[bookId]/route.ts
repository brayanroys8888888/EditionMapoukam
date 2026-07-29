import { z } from 'zod';

import { requireUser } from '@/lib/auth/session';
import { errors, fail, ok } from '@/lib/http/responses';
import { parseSearchParams } from '@/lib/http/validate';
import { RateLimiter } from '@/lib/http/rate-limit';
import { servirTelechargement } from '@/lib/downloads/service';
import { logger } from '@/lib/logger';

/**
 * Téléchargement filigrané — §9.4, §10.2.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LE FICHIER SERVI PORTE L'ADRESSE DE SON ACHETEUR.                       │
 * │                                                                          │
 * │ Il ne doit donc JAMAIS être servi à quelqu'un d'autre : ce serait à la   │
 * │ fois une fuite de donnée personnelle et une mise en cause d'un innocent, │
 * │ dont l'adresse circulerait sur un fichier qu'il n'a pas partagé.        │
 * │                                                                          │
 * │ La copie est indexée PAR UTILISATEUR — l'identifiant dérive de son       │
 * │ propre identifiant — et un test dédié vérifie que le fichier de A n'est  │
 * │ jamais rendu à B.                                                       │
 * └──────────────────────────────────────────────────────────────────────────┘
 */

/**
 * Quota de téléchargements — §10.2, « freine l'aspiration automatisée ».
 *
 * Volontairement large : un acheteur légitime récupère son livre sur plusieurs
 * appareils, le reprend après une coupure, change de format. Le quota vise
 * l'automate, pas le lecteur. Il compte par UTILISATEUR, l'adresse IP étant
 * partagée derrière la plupart des connexions mobiles africaines (§5.1).
 */
const QUOTA = { limite: 30, fenetreMs: 60 * 60 * 1000 } as const;

const limiteur = new RateLimiter();

const requeteSchema = z.object({
  langue: z.enum(['fr', 'en']).default('fr'),
  format: z.enum(['pdf', 'epub']).default('pdf'),
});

export async function GET(
  request: Request,
  contexte: { params: Promise<{ bookId: string }> },
): Promise<Response> {
  // Le téléchargement exige un compte : le fichier est filigrané au nom de son
  // acheteur, et un journal en garde la trace.
  const garde = await requireUser(request);
  if (!garde.ok) return garde.response;

  const query = parseSearchParams(request, requeteSchema);
  if (!query.ok) return query.response;

  const { bookId } = await contexte.params;
  if (!z.uuid().safeParse(bookId).success) return errors.introuvable();

  const quota = limiteur.consommer(`telechargement:${garde.appelant.id}`, QUOTA);
  if (!quota.autorise) {
    logger.warn('Quota de téléchargement dépassé', { userId: garde.appelant.id });
    return errors.tropDeRequetes(quota.retryAfter);
  }

  const resultat = await servirTelechargement(
    { userId: garde.appelant.id, email: garde.appelant.email },
    { bookId, langue: query.data.langue, format: query.data.format },
    { adresseIp: request.headers.get('x-forwarded-for') },
  );

  if (!resultat.ok) {
    switch (resultat.raison) {
      case 'droit_absent':
        // Message explicite : un abonné qui clique sur « Télécharger » doit
        // comprendre pourquoi c'est refusé, sans quoi il croira à une panne.
        // §3.2 — l'abonnement donne la lecture en ligne, jamais le fichier.
        return fail(403, {
          code: 'telechargement_non_inclus',
          message:
            'L’abonnement donne accès à la lecture en ligne. Pour conserver ce titre, achetez-le à l’unité.',
        });

      case 'traduction_introuvable':
        // Une traduction en brouillon n'est jamais téléchargeable, même par un
        // acheteur du livre (docs/PLAN.md D2 point 4).
        return errors.introuvable();

      case 'fichier_source_absent':
      case 'generation_impossible':
        // ┌──────────────────────────────────────────────────────────────────┐
        // │ ÉCHEC FERMÉ : on refuse plutôt que de servir le fichier nu.      │
        // │                                                                  │
        // │ Un repli sur l'original serait invisible — l'acheteur reçoit son │
        // │ livre, tout semble fonctionner — et les fichiers partiraient     │
        // │ sans protection pendant des semaines.                           │
        // └──────────────────────────────────────────────────────────────────┘
        return fail(503, {
          code: 'copie_indisponible',
          message:
            'Votre exemplaire n’a pas pu être préparé. Réessayez dans quelques instants.',
        });
    }
  }

  return ok(
    {
      url: resultat.url.url,
      expire_le: resultat.url.expireLe,
      format: query.data.format,
      langue: query.data.langue,
      // Rendu au client pour le service après-vente : c'est la référence à
      // citer si l'exemplaire pose question. Elle figure aussi DANS le fichier.
      reference: resultat.copieId.slice(0, 12),
    },
    {},
  );
}

import { z } from 'zod';

import { createServiceClient } from '@/lib/supabase/clients';
import { errors, fail } from '@/lib/http/responses';
import { parseSearchParams } from '@/lib/http/validate';
import { requireUser } from '@/lib/auth/session';
import { getAccess } from '@/lib/access/engine';
import { signer } from '@/lib/storage/signed-url';
import { logger } from '@/lib/logger';

/**
 * Téléchargement du fichier d'un titre — §9.4.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LA RÈGLE MÉTIER LA PLUS SENSIBLE DU PROJET.                             │
 * │                                                                          │
 * │ « Le téléchargement n'est jamais inclus dans l'abonnement. L'abonnement  │
 * │   donne accès à la lecture en ligne, rien d'autre. C'est la séparation   │
 * │   nette qui empêche les deux flux de se cannibaliser. » (§3.2)           │
 * │                                                                          │
 * │ Un abonné actif qui appelle cette route reçoit 403. C'est le test le     │
 * │ plus important de l'étape.                                               │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * La décision n'est pas prise ici : elle vient de `canDownload`, calculé par le
 * moteur de droits. Et `canDownload` ne se déduit JAMAIS du motif — un conte
 * gratuit lu par un abonné n'est pas téléchargeable, un conte gratuit acheté
 * l'est.
 *
 * Le filigrane personnalisé (§10.2) est produit à l'étape 11 ; cette route
 * servira alors le fichier filigrané au lieu du fichier générique.
 */
const requeteSchema = z.object({
  langue: z.enum(['fr', 'en']).default('fr'),
  format: z.enum(['pdf', 'epub']).default('pdf'),
});

export async function GET(
  request: Request,
  contexte: { params: Promise<{ id: string }> },
): Promise<Response> {
  // Contrairement à la lecture, le téléchargement exige un compte : le fichier
  // sera filigrané au nom de son acheteur, et un journal en garde la trace.
  const garde = await requireUser(request);
  if (!garde.ok) return garde.response;

  const query = parseSearchParams(request, requeteSchema);
  if (!query.ok) return query.response;

  const { id } = await contexte.params;
  if (!z.uuid().safeParse(id).success) return errors.introuvable();

  const client = createServiceClient();
  const acces = await getAccess(garde.appelant.id, id, { client });

  if (!acces.canDownload) {
    logger.info('Téléchargement refusé', {
      userId: garde.appelant.id,
      bookId: id,
      motif: acces.reason,
    });
    // Message explicite : un abonné qui clique sur « Télécharger » doit
    // comprendre pourquoi c'est refusé, sans quoi il croira à une panne.
    return fail(403, {
      code: 'telechargement_non_inclus',
      message:
        acces.reason === 'subscription'
          ? 'L’abonnement donne accès à la lecture en ligne. Pour conserver ce titre, achetez-le à l’unité.'
          : 'Vous ne possédez pas ce titre.',
    });
  }

  const traduction = await client
    .from('book_translations')
    .select('fichier_telechargement, books!inner(gratuit, statut)')
    .eq('book_id', id)
    .eq('langue', query.data.langue)
    .eq('statut', 'publie')
    .maybeSingle();

  // Une traduction en brouillon n'est jamais téléchargeable, même par un
  // acheteur du livre (docs/PLAN.md D2 point 4).
  if (traduction.error || !traduction.data?.fichier_telechargement) {
    return errors.introuvable();
  }

  const chemin =
    query.data.format === 'epub'
      ? traduction.data.fichier_telechargement.replace(/\.pdf$/, '.epub')
      : traduction.data.fichier_telechargement;

  const signee = await signer(chemin, {
    // Le fichier téléchargeable n'est jamais soumis à la durée longue, même
    // pour un titre gratuit : la gratuité porte sur la LECTURE, jamais sur le
    // téléchargement (§3.2). Un lien de fichier valable une heure serait
    // partageable, et c'est précisément ce que §6.2 cherche à empêcher.
    livreGratuit: false,
    client,
    telechargement: `${id}.${query.data.format}`,
  });

  if (!signee) return errors.introuvable();

  logger.info('Téléchargement autorisé', {
    userId: garde.appelant.id,
    bookId: id,
    format: query.data.format,
    motif: acces.reason,
  });

  return new Response(
    JSON.stringify({
      url: signee.url,
      expire_le: signee.expireLe,
      format: query.data.format,
      langue: query.data.langue,
      motif: acces.reason,
    }),
    {
      status: 200,
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'private, no-store',
      },
    },
  );
}

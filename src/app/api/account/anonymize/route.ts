import { z } from 'zod';

import { createServiceClient } from '@/lib/supabase/clients';
import { errors, noContent, ok } from '@/lib/http/responses';
import { parseJsonBody } from '@/lib/http/validate';
import { requireUser } from '@/lib/auth/session';
import { noticeSuppression } from '@/lib/account/notice';
import { getServerEnv } from '@/lib/config/env';
import { effacerCopiesDe } from '@/lib/downloads/service';
import { logger } from '@/lib/logger';

/**
 * Suppression du compte — RGPD article 17, avec la réserve du 17.3.b.
 *
 * `GET` renvoie l'information préalable, `POST` exécute. La séparation est
 * délibérée : l'utilisateur doit avoir pu lire ce qui est effacé et ce qui est
 * conservé avant de confirmer.
 *
 * L'effacement n'est PAS un DELETE : c'est une anonymisation. Les données de
 * compte disparaissent, les pièces comptables sont conservées puis purgées à
 * échéance.
 */
const confirmationSchema = z.object({
  // Confirmation explicite. Un simple appel ne suffit pas à détruire un compte.
  confirmation: z.literal(true, {
    error: 'La suppression doit être confirmée explicitement.',
  }),
});

export async function GET(request: Request): Promise<Response> {
  const garde = await requireUser(request);
  if (!garde.ok) return garde.response;

  const env = getServerEnv();
  return ok({
    notice: noticeSuppression(garde.appelant.langue_preferee, env.INVOICE_RETENTION_YEARS),
  });
}

export async function POST(request: Request): Promise<Response> {
  const garde = await requireUser(request);
  if (!garde.ok) return garde.response;

  const corps = await parseJsonBody(request, confirmationSchema);
  if (!corps.ok) return corps.response;

  // AVANT l'anonymisation : les copies filigranées portent l'adresse email de
  // leur acheteur, dans leur pied de page et dans leurs métadonnées. Les
  // effacer après coup demanderait de retrouver un identifiant qui n'existe
  // plus. Un échec ici interrompt l'anonymisation — mieux vaut la refaire que
  // de laisser des fichiers nominatifs derrière un compte réputé effacé.
  try {
    await effacerCopiesDe(garde.appelant.id);
  } catch (erreur) {
    return errors.interne(erreur);
  }

  const { error } = await createServiceClient().rpc('anonymize_user', {
    p_user_id: garde.appelant.id,
  });

  if (error) {
    return errors.interne(error.message);
  }

  // L'identifiant est journalisé, pas l'adresse : elle vient d'être effacée,
  // la réinscrire dans les journaux annulerait l'anonymisation.
  logger.info('Compte anonymisé', { userId: garde.appelant.id });

  return noContent();
}

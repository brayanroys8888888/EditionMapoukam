import { createAnonClient } from '@/lib/supabase/clients';
import { noContent } from '@/lib/http/responses';
import { parseJsonBody } from '@/lib/http/validate';
import { demandeReinitialisationSchema } from '@/lib/auth/schemas';
import { getServerEnv } from '@/lib/config/env';
import { logger } from '@/lib/logger';

/**
 * Demande de réinitialisation de mot de passe — §4.2 F5.
 *
 * Répond TOUJOURS 204, que l'adresse existe ou non, et sans jamais indiquer si
 * un email est effectivement parti. C'est la même précaution qu'à
 * l'inscription : une réponse différenciée transformerait cette route en
 * annuaire des comptes de la plateforme.
 *
 * L'erreur éventuelle est journalisée côté serveur, où elle reste exploitable.
 */
export async function POST(request: Request): Promise<Response> {
  const corps = await parseJsonBody(request, demandeReinitialisationSchema);
  if (!corps.ok) return corps.response;

  const env = getServerEnv();
  const { error } = await createAnonClient().auth.resetPasswordForEmail(corps.data.email, {
    redirectTo: `${env.NEXT_PUBLIC_APP_URL}/auth/nouveau-mot-de-passe`,
  });

  if (error) {
    logger.warn('Demande de réinitialisation en échec', { detail: error.message });
  }

  return noContent();
}

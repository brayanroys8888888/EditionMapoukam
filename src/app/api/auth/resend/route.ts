import { createAnonClient } from '@/lib/supabase/clients';
import { noContent } from '@/lib/http/responses';
import { parseJsonBody } from '@/lib/http/validate';
import { demandeReinitialisationSchema } from '@/lib/auth/schemas';
import { logger } from '@/lib/logger';

/**
 * Renvoi du code de vérification d'adresse — §4.2 F5.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ RÉPOND TOUJOURS 204, comme `password/reset` et pour la même raison.     │
 * │                                                                          │
 * │ Une adresse inconnue, une adresse déjà confirmée et une adresse en       │
 * │ attente doivent être indistinguables : les séparer transformerait cette  │
 * │ route en annuaire des comptes, et pire, en détecteur de comptes NON      │
 * │ CONFIRMÉS — c'est-à-dire d'inscriptions récentes.                        │
 * │                                                                          │
 * │ C'est aussi pourquoi l'écran de connexion ne propose ce renvoi QUE sur   │
 * │ un `email_non_verifie` déjà obtenu : le proposer d'emblée inviterait à   │
 * │ sonder des adresses.                                                     │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Le quota de fréquence est celui de Supabase (`max_frequency`), qui compte
 * par adresse et survit au redémarrage — mieux placé, ici, que le compteur en
 * mémoire de ce processus.
 */
export async function POST(request: Request): Promise<Response> {
  const corps = await parseJsonBody(request, demandeReinitialisationSchema);
  if (!corps.ok) return corps.response;

  const { error } = await createAnonClient().auth.resend({
    type: 'signup',
    email: corps.data.email,
  });

  if (error) {
    // Journalisé, jamais remonté : la réponse doit rester identique dans tous
    // les cas, y compris lorsque Supabase refuse pour cause de fréquence.
    logger.warn('Renvoi de code impossible', { detail: error.message });
  }

  return noContent();
}

import { createServiceClient } from '@/lib/supabase/clients';
import { errors, noContent } from '@/lib/http/responses';
import { parseJsonBody } from '@/lib/http/validate';
import { changementMotDePasseSchema } from '@/lib/auth/schemas';
import { requireUser } from '@/lib/auth/session';
import { logger } from '@/lib/logger';

/**
 * Changement de mot de passe — §4.2 F5.
 *
 * Exige une session valide. Le lien de réinitialisation reçu par email ouvre
 * lui-même une session : ce chemin sert donc aussi bien au changement délibéré
 * qu'à la fin d'une procédure d'oubli.
 */
export async function POST(request: Request): Promise<Response> {
  const garde = await requireUser(request);
  if (!garde.ok) return garde.response;

  const corps = await parseJsonBody(request, changementMotDePasseSchema);
  if (!corps.ok) return corps.response;

  // Le changement passe par l'API d'administration, et non par un client
  // porteur du jeton : `updateUser` de supabase-js s'appuie sur une session
  // interne, qu'un client construit à partir du seul en-tête d'autorisation ne
  // possède pas. L'appelant a déjà été authentifié par `requireUser` ci-dessus,
  // et l'identifiant modifié est le sien, jamais celui transmis par le client.
  const { error } = await createServiceClient().auth.admin.updateUserById(garde.appelant.id, {
    password: corps.data.password,
  });

  if (error) {
    if (error.status === 422) {
      return errors.validation({
        password: ['Ce mot de passe est refusé. Choisissez-en un autre.'],
      });
    }
    return errors.interne(error.message);
  }

  logger.info('Mot de passe modifié', { userId: garde.appelant.id });
  return noContent();
}

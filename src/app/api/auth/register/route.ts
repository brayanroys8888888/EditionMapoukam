import { createAnonClient } from '@/lib/supabase/clients';
import { created, errors } from '@/lib/http/responses';
import { parseJsonBody } from '@/lib/http/validate';
import { inscriptionSchema } from '@/lib/auth/schemas';
import { getServerEnv } from '@/lib/config/env';
import { logger } from '@/lib/logger';

/**
 * Inscription — §4.2 F5.
 *
 * Un email de vérification part vers l'interface de capture locale (Mailpit).
 * Aucun message ne quitte la machine.
 *
 * La réponse est volontairement IDENTIQUE que l'adresse soit déjà connue ou
 * non. Répondre « cette adresse est déjà prise » livrerait à un visiteur la
 * liste des clients de la plateforme, une adresse à la fois.
 */
const MESSAGE_INSCRIPTION =
  'Inscription enregistrée. Un email de vérification vous a été envoyé : confirmez votre adresse avant de vous connecter.';

export async function POST(request: Request): Promise<Response> {
  const corps = await parseJsonBody(request, inscriptionSchema);
  if (!corps.ok) return corps.response;

  const { email, password, nom_complet, langue_preferee } = corps.data;
  const env = getServerEnv();

  const { data, error } = await createAnonClient().auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${env.NEXT_PUBLIC_APP_URL}/auth/confirmation`,
      // Ces métadonnées alimentent le déclencheur qui crée le profil métier.
      // Le rôle n'y figure pas et n'y figurera jamais : il est sous le contrôle
      // du client, et serait donc un vecteur d'élévation de privilège.
      data: {
        ...(nom_complet ? { nom_complet } : {}),
        langue_preferee: langue_preferee ?? 'fr',
      },
    },
  });

  if (error) {
    // Un mot de passe refusé par Supabase malgré la validation Zod signale une
    // divergence entre les deux politiques : à corriger, pas à masquer.
    if (error.status === 422) {
      return errors.validation({
        password: ['Ce mot de passe est refusé. Choisissez-en un autre.'],
      });
    }

    // Une adresse déjà inscrite déclenche la limite de fréquence des emails de
    // confirmation. Remonter ce 429 romprait l'indistinguabilité recherchée :
    // il suffirait de comparer les codes de réponse pour savoir si une adresse
    // possède un compte. On répond donc comme pour une inscription nouvelle.
    // Un test compare les deux réponses octet par octet.
    if (error.code === 'over_email_send_rate_limit') {
      logger.info('Inscription sur une adresse déjà connue, réponse indifférenciée');
      return created({ message: MESSAGE_INSCRIPTION });
    }

    if (error.status === 429) {
      return errors.tropDeRequetes(60);
    }
    return errors.interne(error.message);
  }

  logger.info('Inscription enregistrée', { userId: data.user?.id });

  return created({ message: MESSAGE_INSCRIPTION });
}

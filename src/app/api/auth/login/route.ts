import { createAnonClient } from '@/lib/supabase/clients';
import { errors, ok } from '@/lib/http/responses';
import { parseJsonBody } from '@/lib/http/validate';
import { LOGIN_RATE_LIMIT, adresseAppelant, loginRateLimiter } from '@/lib/http/rate-limit';
import { connexionSchema } from '@/lib/auth/schemas';
import { etablirSession } from '@/lib/auth/etablir-session';
import { logger } from '@/lib/logger';

/**
 * Connexion — §4.2 F5, avec limitation des tentatives (§5.2).
 *
 * La clé de limitation combine l'adresse IP et l'adresse email : par IP seule,
 * un réseau partagé bloquerait des innocents ; par email seul, n'importe qui
 * pourrait verrouiller le compte d'autrui à volonté.
 */
export async function POST(request: Request): Promise<Response> {
  const corps = await parseJsonBody(request, connexionSchema);
  if (!corps.ok) return corps.response;

  const { email, password } = corps.data;
  const cle = `${adresseAppelant(request)}|${email}`;

  const limite = loginRateLimiter.consommer(cle, LOGIN_RATE_LIMIT);
  if (!limite.autorise) {
    logger.warn('Tentatives de connexion trop nombreuses', { email });
    return errors.tropDeRequetes(limite.retryAfter);
  }

  const { data, error } = await createAnonClient().auth.signInWithPassword({ email, password });

  if (error || !data.session) {
    // `email_not_confirmed` est le seul cas où l'on précise la raison : sans
    // cela, un utilisateur qui a bien créé son compte resterait sans
    // explication. Cette information ne révèle rien qu'il ne sache déjà.
    if (error?.code === 'email_not_confirmed') {
      return errors.emailNonVerifie();
    }
    return errors.identifiantsInvalides();
  }

  // Profil relu en base, statut vérifié, lignée ouverte, cookies posés : la
  // suite est commune au mot de passe et au code reçu par email, et vit donc
  // en un seul endroit (`src/lib/auth/etablir-session.ts`).
  const etabli = await etablirSession(data.session, data.user.id, {
    refusGenerique: errors.identifiantsInvalides,
  });
  if (!etabli.ok) return etabli.response;

  loginRateLimiter.reinitialiser(cle);

  logger.info('Connexion réussie', { userId: etabli.charge.utilisateur.id });

  return ok(etabli.charge, { cookies: etabli.cookies });
}

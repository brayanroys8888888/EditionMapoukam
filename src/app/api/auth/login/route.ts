import { createAnonClient, createServiceClient } from '@/lib/supabase/clients';
import { errors, ok } from '@/lib/http/responses';
import { parseJsonBody } from '@/lib/http/validate';
import { LOGIN_RATE_LIMIT, adresseAppelant, loginRateLimiter } from '@/lib/http/rate-limit';
import { connexionSchema } from '@/lib/auth/schemas';
import { cookiesDeSession } from '@/lib/auth/cookies';
import { ouvrirFamille } from '@/lib/auth/refresh';
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

  const profil = await createServiceClient()
    .from('users')
    .select('id, email, role, langue_preferee, statut')
    .eq('id', data.user.id)
    .maybeSingle();

  if (profil.error || !profil.data) {
    return errors.interne(profil.error?.message ?? 'profil métier absent');
  }

  if (profil.data.statut !== 'actif') {
    // Session immédiatement révoquée : un compte suspendu ou anonymisé ne doit
    // pas repartir avec un jeton valide en poche.
    await createServiceClient().auth.admin.signOut(data.session.access_token, 'global');
    return profil.data.statut === 'suspendu'
      ? errors.compteSuspendu()
      : errors.identifiantsInvalides();
  }

  loginRateLimiter.reinitialiser(cle);

  // Ouvre la lignée de jetons de cette connexion. Sans elle, le premier
  // rafraîchissement serait refusé — échec fermé, et volontairement : mieux
  // vaut une reconnexion qu'une session que nous ne savons pas suivre.
  await ouvrirFamille(profil.data.id, data.session.refresh_token);

  logger.info('Connexion réussie', { userId: profil.data.id });

  return ok(
    {
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
      expires_in: data.session.expires_in,
      utilisateur: {
        id: profil.data.id,
        email: profil.data.email,
        role: profil.data.role,
        langue_preferee: profil.data.langue_preferee,
      },
    },
    { cookies: cookiesDeSession(data.session) },
  );
}

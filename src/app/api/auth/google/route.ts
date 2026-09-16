import { langueValide } from '@/i18n';
import { getServerEnv } from '@/lib/config/env';
import { errors, redirection } from '@/lib/http/responses';
import { logger } from '@/lib/logger';
import {
  CHEMIN_GOOGLE_RETOUR,
  cookieEtat,
  defiDepuisVerifieur,
  encoderEtat,
  fabriquerVerifieur,
  urlAutorisationSupabase,
} from '@/lib/auth/google';

/**
 * ENTRÉE DE LA CONNEXION PAR GOOGLE — une adresse pour les deux chemins.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ L'ÉCRAN NE SAIT PAS QUI CONDUIT L'ÉCHANGE, ET C'EST TOUT L'INTÉRÊT.     │
 * │                                                                          │
 * │ Le bouton pointe toujours ici. Basculer `AUTH_GOOGLE` de `supabase` à    │
 * │ `better-auth` ne change ni le lien, ni l'écran, ni l'adresse de retour — │
 * │ seulement ce qui se passe entre les deux. Si le choix transparaissait    │
 * │ dans l'interface, changer d'avis coûterait un déploiement de code au     │
 * │ lieu d'une variable.                                                     │
 * │                                                                          │
 * │ `desactive` rend 404 et non 403 : la même raison que l'administration.   │
 * │ « Vous n'avez pas accès » confirmerait qu'il y a quelque chose ici.      │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export async function GET(request: Request): Promise<Response> {
  const env = getServerEnv();
  if (env.AUTH_GOOGLE === 'desactive') return errors.introuvable();

  const langue = langueValide(new URL(request.url).searchParams.get('langue'));
  const secure = env.NODE_ENV === 'production';
  const retourUrl = `${env.NEXT_PUBLIC_APP_URL}${CHEMIN_GOOGLE_RETOUR}?langue=${langue}`;
  const ecranErreur = `${env.NEXT_PUBLIC_APP_URL}/${langue}/connexion?erreur=google_refuse`;

  // ── Chemin Supabase ──────────────────────────────────────────────────────
  if (env.AUTH_GOOGLE === 'supabase') {
    const verifieur = fabriquerVerifieur();
    const defi = await defiDepuisVerifieur(verifieur);

    const destination = urlAutorisationSupabase({
      supabaseUrl: env.NEXT_PUBLIC_SUPABASE_URL,
      retourUrl,
      defi,
    });

    // Le vérifieur part dans un cookie, JAMAIS dans l'URL : il est le secret
    // qui empêche qu'un code d'autorisation intercepté soit échangé par un
    // autre. Voir l'encadré de `urlAutorisationSupabase`.
    return redirection(destination, {
      cookies: [cookieEtat(encoderEtat({ verifieur, langue }), { secure })],
    });
  }

  // ── Chemin Better Auth ───────────────────────────────────────────────────
  //
  // Importé à la demande : sous les deux autres modes, ses secrets n'existent
  // pas et le module refuserait de se construire. Un import en tête de fichier
  // ferait donc tomber cette route AVANT même d'avoir pu rendre son 404.
  const { obtenirBetterAuth } = await import('@/lib/auth/better-auth');

  try {
    const { headers, response } = await obtenirBetterAuth().api.signInSocial({
      body: {
        provider: 'google',
        callbackURL: retourUrl,
        errorCallbackURL: ecranErreur,
      },
      returnHeaders: true,
    });

    const destination = (response as { url?: unknown }).url;
    if (typeof destination !== 'string' || !destination) {
      logger.error('Better Auth n’a rendu aucune adresse d’autorisation');
      return redirection(ecranErreur);
    }

    // Les cookies d'état posés par Better Auth sont recopiés sur NOTRE réponse :
    // sans eux, le retour de Google serait refusé pour état inconnu.
    return redirection(destination, { cookies: headers.getSetCookie() });
  } catch (erreur) {
    logger.error('Ouverture de l’échange Google impossible', {
      detail: erreur instanceof Error ? erreur.message : String(erreur),
    });
    return redirection(ecranErreur);
  }
}

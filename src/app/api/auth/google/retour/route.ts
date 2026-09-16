import { langueValide, type LangueInterface } from '@/i18n';
import { getServerEnv } from '@/lib/config/env';
import { errors, redirection } from '@/lib/http/responses';
import { logger } from '@/lib/logger';
import { lireCookie } from '@/lib/auth/cookies';
import { etablirSession, type Etablissement } from '@/lib/auth/etablir-session';
import { COOKIE_GOOGLE, cookieEtatEfface, decoderEtat } from '@/lib/auth/google';
import { echangerCodePkce, sessionPourIdentiteVerifiee } from '@/lib/auth/google-session';

/**
 * RETOUR DU FOURNISSEUR — et le seul endroit où les deux chemins se rejoignent.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ DEUX MANIÈRES D'OBTENIR UNE IDENTITÉ, UNE SEULE MANIÈRE D'OUVRIR UNE    │
 * │ SESSION.                                                                 │
 * │                                                                          │
 * │ Au-dessus de la ligne, tout diffère : Supabase rend une session contre   │
 * │ un code PKCE, Better Auth rend un profil vérifié contre son cookie       │
 * │ d'état. En dessous, c'est `etablirSession` — profil relu en base, statut │
 * │ du compte vérifié, lignée de jetons ouverte, cookies posés. Exactement   │
 * │ ce que font le mot de passe et le code à six chiffres.                   │
 * │                                                                          │
 * │ C'est la règle qui explique tout le reste de ce dépôt : une règle écrite │
 * │ deux fois diverge, et c'est toujours la copie qui a l'air d'avoir        │
 * │ raison. Un compte SUSPENDU qui se reconnecterait par Google, parce que   │
 * │ ce chemin-là aurait oublié le contrôle de statut, est précisément la     │
 * │ classe de défaut que `etablirSession` existe pour empêcher.              │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export async function GET(request: Request): Promise<Response> {
  const env = getServerEnv();
  if (env.AUTH_GOOGLE === 'desactive') return errors.introuvable();

  const url = new URL(request.url);
  const langue = langueValide(url.searchParams.get('langue'));
  const secure = env.NODE_ENV === 'production';

  /** Retour à l'écran de connexion, avec le motif — et l'état toujours effacé. */
  const echec = (code: string): Response =>
    redirection(`${env.NEXT_PUBLIC_APP_URL}/${langue}/connexion?erreur=${code}`, {
      cookies: [cookieEtatEfface({ secure })],
    });

  // Le fournisseur refuse parfois AVANT nous : consentement rejeté, compte
  // fermé, domaine non autorisé. Le paramètre est lu en premier, faute de quoi
  // l'échec suivant parlerait d'un code manquant — ce qui est vrai, et inutile.
  if (url.searchParams.get('error')) {
    logger.info('Échange Google refusé par le fournisseur', {
      detail: url.searchParams.get('error'),
    });
    return echec('google_refuse');
  }

  const etabli =
    env.AUTH_GOOGLE === 'supabase'
      ? await parSupabase(request, url, env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
      : await parBetterAuth(request, langue);

  if (etabli === null) return echec('google_refuse');
  if (etabli === 'interne') return echec('erreur_interne');

  if (!etabli.ok) {
    // Le refus est décidé par `etablirSession` — compte suspendu, profil
    // absent. Son code est repris tel quel plutôt que réinterprété : l'écran
    // sait déjà traduire `compte_suspendu`, et le redire ici en ferait une
    // seconde version de la même décision.
    const corps = (await etabli.response.json().catch(() => null)) as
      | { erreur?: { code?: string } }
      | null;
    return echec(corps?.erreur?.code ?? 'erreur_interne');
  }

  logger.info('Connexion Google réussie', {
    userId: etabli.charge.utilisateur.id,
    mode: env.AUTH_GOOGLE,
  });

  return redirection(`${env.NEXT_PUBLIC_APP_URL}/${langue}/contes?toast=connexion`, {
    cookies: [...etabli.cookies, cookieEtatEfface({ secure })],
  });
}

/** `null` : refus imputable au parcours. `'interne'` : panne de notre côté. */
type Issue = Etablissement | null | 'interne';

// ═══════════════════════════════════════════════════════════════════════════
// CHEMIN SUPABASE — un code d'autorisation contre une session
// ═══════════════════════════════════════════════════════════════════════════

async function parSupabase(
  request: Request,
  url: URL,
  supabaseUrl: string,
  anonKey: string,
): Promise<Issue> {
  const code = url.searchParams.get('code');
  const etat = decoderEtat(lireCookie(request, COOKIE_GOOGLE));

  // Un cookie absent n'est pas forcément une attaque : c'est aussi l'onglet
  // laissé ouvert une demi-heure, ou un navigateur qui refuse les cookies
  // tiers. Le refus est le même, et il est muet sur la cause.
  if (!code || !etat) {
    logger.info('Retour Google sans code ni état exploitable');
    return null;
  }

  const echange = await echangerCodePkce({
    supabaseUrl,
    anonKey,
    code,
    verifieur: etat.verifieur,
  });

  if (!echange) return null;

  return etablirSession(echange.session, echange.userId, {
    refusGenerique: errors.identifiantsInvalides,
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// CHEMIN BETTER AUTH — un profil vérifié contre une session frappée
// ═══════════════════════════════════════════════════════════════════════════

async function parBetterAuth(request: Request, langue: LangueInterface): Promise<Issue> {
  const { obtenirBetterAuth } = await import('@/lib/auth/better-auth');

  const session = await obtenirBetterAuth()
    .api.getSession({ headers: request.headers })
    .catch((erreur: unknown) => {
      logger.error('Lecture de la session Better Auth impossible', {
        detail: erreur instanceof Error ? erreur.message : String(erreur),
      });
      return null;
    });

  const utilisateur = session?.user;

  /*
   * ┌────────────────────────────────────────────────────────────────────────┐
   * │ L'ADRESSE DOIT ÊTRE VÉRIFIÉE, ET LA VÉRIFICATION DOIT VENIR DE GOOGLE. │
   * │                                                                        │
   * │ Sans ce contrôle, quelqu'un qui contrôlerait un fournisseur laxiste —  │
   * │ ou un compte Google dont l'adresse n'est pas confirmée — se            │
   * │ connecterait sous l'adresse d'un client existant, puisque la suite     │
   * │ RAPPROCHE les comptes par l'adresse email. C'est la seule chose qui    │
   * │ sépare « se connecter avec Google » de « se connecter en tant que      │
   * │ n'importe qui ».                                                       │
   * └────────────────────────────────────────────────────────────────────────┘
   */
  if (!utilisateur?.email || utilisateur.emailVerified !== true) {
    logger.info('Retour Better Auth sans adresse vérifiée');
    return null;
  }

  const frappee = await sessionPourIdentiteVerifiee({
    email: utilisateur.email,
    emailVerifie: true,
    nomComplet: typeof utilisateur.name === 'string' ? utilisateur.name : undefined,
    langue,
  });

  // Une session non frappée n'est pas un refus d'identité : c'est une panne de
  // notre côté, et l'écran doit le dire autrement qu'un « réessayez avec
  // Google » qui échouerait à l'identique.
  if (!frappee) return 'interne';

  return etablirSession(frappee.session, frappee.userId, {
    refusGenerique: errors.identifiantsInvalides,
  });
}

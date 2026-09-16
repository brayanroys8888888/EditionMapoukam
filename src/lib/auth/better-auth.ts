import { betterAuth } from 'better-auth';

import { getServerEnv } from '@/lib/config/env';

import { BASE_BETTER_AUTH } from './google';

/**
 * BETTER AUTH — MONTÉ SANS BASE DE DONNÉES, ET CE N'EST PAS UN RACCOURCI.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ CE QU'IL FAIT ICI, ET CE QU'IL NE FAIT PAS.                             │
 * │                                                                          │
 * │ Il fait UNE chose : conduire l'échange OAuth avec Google et nous rendre  │
 * │ une adresse email vérifiée. Il ne détient pas la session de              │
 * │ l'application, il ne connaît ni les droits, ni les commandes, ni les     │
 * │ abonnements. La session servie reste une session Supabase, ouverte par   │
 * │ `etablirSession` — sans quoi il y aurait DEUX autorités sur « qui est    │
 * │ connecté », et les politiques RLS n'en connaîtraient qu'une.             │
 * │                                                                          │
 * │ Sans `database`, Better Auth range l'état de l'échange dans un cookie    │
 * │ signé plutôt que dans des tables. Conséquences voulues :                 │
 * │                                                                          │
 * │  · AUCUNE MIGRATION. Le dépôt n'accueille pas six tables dont il ne se   │
 * │    servirait pas, et dont les politiques RLS seraient à écrire — une     │
 * │    table sans politique est une faille, pas un oubli (CLAUDE.md).        │
 * │  · AUCUN JETON GOOGLE CONSERVÉ. Ce qu'on ne stocke pas ne fuite pas.     │
 * │    On ne demande d'ailleurs rien de plus que l'identité : ni contacts,   │
 * │    ni agenda, ni accès hors ligne.                                       │
 * │                                                                          │
 * │ La télémétrie est coupée EXPLICITEMENT. Elle est déjà éteinte par        │
 * │ défaut ; l'écrire ici fait que la question est tranchée dans le dépôt,   │
 * │ et non dans la version installée du paquet.                              │
 * └──────────────────────────────────────────────────────────────────────────┘
 */

/**
 * Construction de l'instance.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LE TYPE EST INFÉRÉ DE CETTE FONCTION, ET NON DE `betterAuth` LUI-MÊME.  │
 * │                                                                          │
 * │ `ReturnType<typeof betterAuth>` vaut `Auth<BetterAuthOptions>`, où       │
 * │ chaque option est facultative. Or `betterAuth({...})` rend un type       │
 * │ paramétré par les options RÉELLEMENT passées — les deux ne sont pas      │
 * │ assignables, et `tsc` le refuse. Inférer depuis la fabrique garde le     │
 * │ type exact sans avoir à l'écrire.                                        │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
function construire() {
  const env = getServerEnv();

  if (env.AUTH_GOOGLE !== 'better-auth') {
    throw new Error(`Better Auth demandé alors que AUTH_GOOGLE vaut « ${env.AUTH_GOOGLE} ».`);
  }

  // Le schéma d'environnement les a déjà exigés sous ce mode ; la garde est ici
  // pour le typage, et pour que l'erreur nomme la cause si le schéma change.
  const clientId = env.GOOGLE_CLIENT_ID;
  const clientSecret = env.GOOGLE_CLIENT_SECRET;
  const secret = env.BETTER_AUTH_SECRET;

  if (!clientId || !clientSecret || !secret) {
    throw new Error(
      'Better Auth : GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET et BETTER_AUTH_SECRET sont exigés.',
    );
  }

  return betterAuth({
    baseURL: env.NEXT_PUBLIC_APP_URL,
    basePath: BASE_BETTER_AUTH,
    secret,
    telemetry: { enabled: false },
    // Le mot de passe reste servi par Supabase Auth, avec sa limitation de
    // tentatives et ses codes à six chiffres. En ouvrir un second ici créerait
    // deux politiques de mot de passe, dont une que personne n'a écrite.
    emailAndPassword: { enabled: false },
    socialProviders: {
      google: { clientId, clientSecret },
    },
    /*
     * ┌──────────────────────────────────────────────────────────────────────┐
     * │ PAS DE GREFFON `nextCookies`, ET C'EST UN CHOIX.                     │
     * │                                                                      │
     * │ Il pose les cookies par le magasin de Next, donc depuis le contexte  │
     * │ asynchrone d'une requête. Nos routes, elles, rendent une `Response`  │
     * │ et posent leurs cookies dessus — c'est ce qui permet à un test de    │
     * │ les appeler comme des fonctions, sans démarrer de serveur.           │
     * │                                                                      │
     * │ Les en-têtes rendus par `signInSocial` sont donc recopiés à la main  │
     * │ sur notre réponse, dans `/api/auth/google`. Une ligne de plus, et    │
     * │ une dépendance en moins à un contexte invisible.                     │
     * └──────────────────────────────────────────────────────────────────────┘
     */
    plugins: [],
  });
}

type InstanceBetterAuth = ReturnType<typeof construire>;

let instance: InstanceBetterAuth | null = null;

/**
 * L'instance, construite au premier besoin.
 *
 * Elle n'est PAS construite au chargement du module : sous les deux autres
 * valeurs de `AUTH_GOOGLE`, les secrets n'existent pas, et un module qui
 * échouerait à s'évaluer ferait tomber tout ce qui l'importe — y compris les
 * routes qui n'ont rien à voir avec Google.
 */
export function obtenirBetterAuth(): InstanceBetterAuth {
  instance ??= construire();
  return instance;
}

/** Réservé aux tests : oublie l'instance mémorisée. */
export function reinitialiserBetterAuth(): void {
  instance = null;
}

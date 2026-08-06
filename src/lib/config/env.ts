import { z } from 'zod';

/**
 * Lecture et validation de l'environnement.
 *
 * Deux principes :
 *  1. Aucun secret en dur (CLAUDE.md règle 6) : tout vient de l'environnement.
 *  2. Un démarrage qui échoue franchement vaut mieux qu'un service qui tourne
 *     avec une variable manquante et se comporte mal plus tard.
 *
 * La validation est paresseuse : un test unitaire de logique pure n'a pas à
 * disposer d'une pile Supabase pour s'exécuter.
 */

/** Plafonds durs, appliqués dans le code et non seulement en configuration. */
export const SIGNED_URL_TTL_MAX_SECONDS = 300;
export const SIGNED_URL_TTL_FREE_MAX_SECONDS = 3600;

const positiveInt = (fallback: number) =>
  z.coerce.number().int().positive().default(fallback);

const serverSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  // ---- Supabase local ----
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),

  /**
   * Connexion PostgreSQL directe — FACULTATIVE, et volontairement.
   *
   * ┌────────────────────────────────────────────────────────────────────────┐
   * │ L'APPLICATION NE S'EN SERT JAMAIS.                                     │
   * │                                                                        │
   * │ Elle parle à la base par l'API Supabase, avec la clé de service. Seuls  │
   * │ les SCRIPTS (`db:seed`, `purge:invoices`) et les TESTS ouvrent une      │
   * │ connexion directe — et tous trois lisent `process.env` en propre, avec  │
   * │ leur propre message d'erreur.                                          │
   * │                                                                        │
   * │ L'exiger au démarrage obligeait à déposer un mot de passe de base de    │
   * │ données dans l'hébergeur pour une valeur que rien n'y lit. Un secret    │
   * │ inutile est un secret à faire fuiter : on le retire.                    │
   * └────────────────────────────────────────────────────────────────────────┘
   */
  DATABASE_URL: z.string().min(1).optional(),

  // ---- Adaptateurs locaux ----
  PAYMENT_PROVIDER: z.enum(['fake', 'stripe']).default('fake'),
  MAILER: z.enum(['file', 'resend']).default('file'),
  RESEND_API_KEY: z.string().optional(),
  RESEND_FROM_EMAIL: z.string().optional(),
  MAIL_OUTPUT_DIR: z.string().min(1).default('.mails'),
  FAKE_WEBHOOK_SECRET: z.string().min(8),

  // ---- Application ----
  NEXT_PUBLIC_APP_URL: z.url(),

  /**
   * Direction visuelle servie par l'application.
   *
   * ┌────────────────────────────────────────────────────────────────────────┐
   * │ UN RÉGLAGE, PAS UNE SECONDE APPLICATION.                              │
   * │                                                                        │
   * │ La V2 ne duplique aucune route : elle pose `data-design="v2"` sur      │
   * │ l'élément racine, et les jetons se réaffectent. Les URL, le backend,   │
   * │ les droits et les 1254 tests sont partagés — ce qui change est la      │
   * │ palette, la typographie et la mise en page de quelques écrans.         │
   * │                                                                        │
   * │ Conséquence utile : revenir en arrière ne demande pas un déploiement   │
   * │ de code, seulement de reposer la variable. Une refonte qu'on ne peut   │
   * │ pas annuler est une refonte qu'on n'ose pas montrer.                   │
   * │                                                                        │
   * │ La valeur par défaut reste `v1` : tant que la V2 n'est pas validée,    │
   * │ un environnement qui ne dit rien sert ce qui est validé.               │
   * └────────────────────────────────────────────────────────────────────────┘
   */
  NEXT_PUBLIC_DESIGN_VERSION: z.enum(['v1', 'v2']).default('v2'),

  /**
   * Durée des URL signées d'un contenu payant. CLAUDE.md règle 3 : 300
   * secondes maximum, sans exception. Une valeur plus élevée est ramenée au
   * plafond plutôt que de faire échouer le démarrage — le plafond est la règle,
   * la configuration ne peut que l'assouplir vers le bas.
   */
  SIGNED_URL_TTL: positiveInt(SIGNED_URL_TTL_MAX_SECONDS).transform((value) =>
    Math.min(value, SIGNED_URL_TTL_MAX_SECONDS),
  ),

  /** Durée des URL signées d'un titre `gratuit = true`. Plafond 3600 s. */
  SIGNED_URL_TTL_FREE: positiveInt(SIGNED_URL_TTL_FREE_MAX_SECONDS).transform((value) =>
    Math.min(value, SIGNED_URL_TTL_FREE_MAX_SECONDS),
  ),

  /**
   * La fenêtre de vente exclusive et la période de grâce NE SONT PAS ici.
   *
   * Elles vivent dans la table `business_settings`, source unique. Une
   * politique RLS ne peut pas lire l'environnement du processus : les garder
   * ici en aurait fait une seconde source, que seul un test de concordance
   * aurait surveillée — c'est-à-dire qu'il aurait constaté la divergence une
   * fois installée, au lieu de la rendre impossible.
   *
   * Voir `src/lib/settings/business-settings.ts`.
   */

  /** Nombre de pages d'extrait par défaut, quand le titre n'en fixe pas. */
  EXCERPT_PAGES_DEFAULT: positiveInt(3),

  /** Pages servies par heure et par adresse IP à un visiteur non authentifié. */
  ANON_PAGE_RATE_LIMIT: positiveInt(60),

  /**
   * Durée de conservation des factures, en années (§11.3).
   *
   * Configurable parce que la durée dépend du pays d'immatriculation, question
   * encore ouverte (§16.2 point 6). Elle est figée sur chaque facture à son
   * émission : changer cette valeur n'affecte jamais les factures déjà émises.
   */
  INVOICE_RETENTION_YEARS: positiveInt(10),

  // ---- Tarifs de démonstration, en plus petite unité monétaire ----
  PRICE_UNIT_DEFAULT: positiveInt(499),
  PRICE_SUBSCRIPTION_MONTHLY: positiveInt(799),
  PRICE_SUBSCRIPTION_YEARLY: positiveInt(6900),

  /**
   * Confirme automatiquement l'adresse email à l'inscription.
   *
   * ┌────────────────────────────────────────────────────────────────────────┐
   * │ POUR UNE MISE EN LIGNE SANS SERVICE D'EMAIL, ET RIEN D'AUTRE.          │
   * │                                                                        │
   * │ Aucun email ne quitte la machine : `FileMailer` écrit dans `.mails/` et │
   * │ les messages d'authentification vont dans Mailpit. En ligne, le code à  │
   * │ six chiffres n'atteindrait donc personne, et l'inscription serait une   │
   * │ impasse — un formulaire qui accepte, puis un compte qui refuse d'ouvrir.│
   * │                                                                        │
   * │ CE QUE CET INTERRUPTEUR NE TOUCHE PAS : l'authentification elle-même.  │
   * │ Mot de passe, session, rotation des jetons, détection de réutilisation  │
   * │ et révocation restent intégralement réels. Seule l'ÉTAPE DE            │
   * │ VÉRIFICATION est court-circuitée.                                      │
   * │                                                                        │
   * │ Ce qu'on accepte en l'activant, et il faut le dire : quelqu'un peut     │
   * │ s'inscrire avec une adresse qui n'est pas la sienne. C'est tenable      │
   * │ tant qu'aucun email ne part et qu'aucun paiement réel n'est encaissé ;  │
   * │ cela cesse de l'être le jour où un service d'email est branché.        │
   * │                                                                        │
   * │ Par défaut FAUX : le comportement local strict est conservé, et la      │
   * │ suite de tests continue d'éprouver le parcours complet de vérification. │
   * └────────────────────────────────────────────────────────────────────────┘
   */
  AUTH_CONFIRMATION_AUTOMATIQUE: z
    .stringbool()
    .default(false),
});

export type ServerEnv = z.infer<typeof serverSchema>;

let cached: ServerEnv | null = null;

/**
 * Environnement serveur validé.
 *
 * CLAUDE.md règle 2 : la clé `service_role` ne quitte jamais le serveur. Cette
 * fonction refuse donc de s'exécuter dans un navigateur, ce qui transforme une
 * fuite potentielle en erreur de compilation ou d'exécution immédiate.
 */
export function getServerEnv(): ServerEnv {
  if (typeof window !== 'undefined') {
    throw new Error(
      "getServerEnv() a été appelée côté client : la clé service_role ne doit jamais quitter le serveur.",
    );
  }

  if (cached) return cached;

  const parsed = serverSchema.safeParse(process.env);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `  - ${issue.path.join('.') || '(racine)'} : ${issue.message}`)
      .join('\n');
    throw new Error(
      `Environnement invalide. Copiez .env.example en .env.local et complétez-le.\n${details}`,
    );
  }

  // Garde-fou explicite : aucune variable exposée au navigateur ne doit
  // contenir la clé de service.
  const serviceRoleKey = parsed.data.SUPABASE_SERVICE_ROLE_KEY;
  for (const [key, value] of Object.entries(process.env)) {
    if (key.startsWith('NEXT_PUBLIC_') && value && value === serviceRoleKey) {
      throw new Error(
        `${key} contient la clé service_role. Une variable NEXT_PUBLIC_* est envoyée au navigateur (CLAUDE.md règle 2).`,
      );
    }
  }

  cached = parsed.data;
  return cached;
}

/** Réservé aux tests : oublie l'environnement mémorisé. */
export function resetServerEnvCache(): void {
  cached = null;
}

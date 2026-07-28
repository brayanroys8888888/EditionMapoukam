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
  DATABASE_URL: z.string().min(1),

  // ---- Adaptateurs locaux ----
  PAYMENT_PROVIDER: z.enum(['fake', 'stripe']).default('fake'),
  MAILER: z.enum(['file', 'resend']).default('file'),
  MAIL_OUTPUT_DIR: z.string().min(1).default('.mails'),
  FAKE_WEBHOOK_SECRET: z.string().min(8),

  // ---- Application ----
  NEXT_PUBLIC_APP_URL: z.url(),

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

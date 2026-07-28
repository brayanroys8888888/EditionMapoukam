/**
 * Pont entre l'horloge injectable de Node et l'horloge de PostgreSQL.
 *
 * docs/PLAN.md §2.5. Le moteur de droits est une fonction PostgreSQL appelée
 * par les politiques RLS, lesquelles ne reçoivent aucun paramètre applicatif.
 * Le seul canal disponible est un paramètre de session : `app.now`.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ CE MODULE EST LE SEUL DU DÉPÔT AUTORISÉ À NOMMER CE PARAMÈTRE.           │
 * │ Un test parcourt src/** et échoue si la chaîne apparaît ailleurs.        │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Deux garanties, exigées par la validation du plan :
 *
 *  (a) Le paramètre n'est honoré par `app_now()` que si l'artefact
 *      `dev_clock_activation` existe en base. Cet artefact n'est créé que par
 *      le seed de développement : sur une base de production il est
 *      physiquement absent, et le décalage est inopérant même si ce module
 *      était appelé par erreur.
 *
 *  (b) La valeur ne provient JAMAIS d'une entrée utilisateur — ni en-tête
 *      HTTP, ni paramètre de requête, ni cookie, ni corps de requête. Sa seule
 *      source légitime est le `DevClock`, un état détenu par le serveur et
 *      modifié par la console `/dev`. La signature de `applyDevClock` n'accepte
 *      d'ailleurs qu'une `Clock`, jamais une chaîne.
 */
import type { Clock } from '@/lib/clock/clock';

/** Nom du paramètre de session lu par `public.app_now()`. */
const SETTING = 'app.now';

/**
 * Exécuteur SQL minimal.
 *
 * Volontairement structurel plutôt que typé sur `pg` : ce module doit pouvoir
 * s'appliquer à une connexion de test comme à une transaction applicative,
 * sans imposer de dépendance.
 */
export interface SqlExecutor {
  query(text: string, values?: readonly unknown[]): Promise<unknown>;
}

function assertNotProduction(): void {
  if (process.env['NODE_ENV'] === 'production') {
    throw new Error(
      "Le décalage d'horloge est interdit en production : l'expiration des abonnements ne doit jamais être déplaçable.",
    );
  }
}

/**
 * Positionne l'instant vu par la base sur la connexion courante.
 *
 * `is_local = false` : le réglage vaut pour la session, et non pour la seule
 * transaction en cours, afin que plusieurs requêtes successives d'une même
 * requête HTTP voient le même instant.
 */
export async function applyDevClock(executor: SqlExecutor, clock: Clock): Promise<void> {
  assertNotProduction();
  await executor.query('select set_config($1, $2, false)', [SETTING, clock.now().toISOString()]);
}

/** Repositionne la connexion sur l'heure réelle. */
export async function clearDevClock(executor: SqlExecutor): Promise<void> {
  await executor.query('select set_config($1, $2, false)', [SETTING, '']);
}

/**
 * Instant vu par la base sur cette connexion.
 *
 * Sert aux tests : c'est la valeur que les politiques RLS utiliseront.
 */
export async function readDatabaseNow(executor: SqlExecutor): Promise<Date> {
  const result = (await executor.query('select public.app_now() as now')) as {
    rows: { now: Date }[];
  };
  const row = result.rows[0];
  if (row === undefined) {
    throw new Error('app_now() n’a renvoyé aucune ligne.');
  }
  return row.now;
}

import pg from 'pg';

/**
 * Accès direct à la base locale pour les tests d'intégration.
 *
 * CLAUDE.md : « Intégration — routes API contre la base locale réelle, pas de
 * mock de base. » Ce pool se connecte en tant que `postgres`, donc au-dessus de
 * RLS : il sert à préparer un état et à inspecter le schéma. Les tests
 * d'isolation, eux, passent obligatoirement par des clients Supabase porteurs
 * d'un jeton utilisateur, seuls capables d'exercer réellement les politiques.
 */
let pool: pg.Pool | null = null;

export function getPool(): pg.Pool {
  const connectionString = process.env['DATABASE_URL'];
  if (!connectionString) {
    throw new Error('DATABASE_URL absent : .env.local n’a pas été chargé.');
  }
  pool ??= new pg.Pool({ connectionString, max: 4 });
  return pool;
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

/** Exécute une requête et renvoie ses lignes typées. */
export async function query<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  values?: readonly unknown[],
): Promise<T[]> {
  const result = await getPool().query<T>(text, values ? [...values] : undefined);
  return result.rows;
}

/** Première ligne d'une requête, ou `undefined`. */
export async function queryOne<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  values?: readonly unknown[],
): Promise<T | undefined> {
  const rows = await query<T>(text, values);
  return rows[0];
}

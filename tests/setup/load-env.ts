import { config } from 'dotenv';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Charge `.env.local` pour les tests d'intégration.
 *
 * CLAUDE.md interdit de simuler la base : ces tests tournent contre la pile
 * Supabase locale et ont donc besoin de ses clés. Un fichier absent est une
 * erreur franche, pas un test silencieusement dégradé.
 */
const envPath = join(process.cwd(), '.env.local');

if (!existsSync(envPath)) {
  throw new Error(
    '.env.local est absent. Lancez `npm run supabase:start`, puis copiez .env.example en .env.local et renseignez les clés affichées.',
  );
}

config({ path: envPath, quiet: true });

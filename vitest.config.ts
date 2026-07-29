import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

const src = fileURLToPath(new URL('./src', import.meta.url));

/**
 * Deux projets de test, délibérément séparés :
 *
 *  - `unit`        — logique pure, aucune base, aucun réseau. Toujours
 *                    exécutable, même pile Supabase éteinte.
 *  - `integration` — routes API et politiques RLS contre la base locale
 *                    réelle. CLAUDE.md interdit de simuler la base : ces tests
 *                    exigent `supabase start`.
 *
 * `npm run verify` exécute les deux. Un échec de connexion à la base est donc
 * un échec de la porte de validation, et non un test silencieusement ignoré.
 */
export default defineConfig({
  resolve: {
    alias: { '@': src },
  },
  test: {
    projects: [
      {
        resolve: { alias: { '@': src } },
        test: {
          name: 'unit',
          environment: 'node',
          include: ['tests/unit/**/*.test.ts'],
        },
      },
      {
        resolve: { alias: { '@': src } },
        test: {
          name: 'integration',
          environment: 'node',
          include: [
            'tests/integration/**/*.test.ts',
            'tests/security/**/*.test.ts',
            'tests/e2e/**/*.test.ts',
          ],
          setupFiles: ['tests/setup/load-env.ts'],
          // Les tests d'intégration partagent une base : pas de parallélisme
          // entre fichiers, sous peine de courses sur les données de seed.
          fileParallelism: false,
          testTimeout: 30_000,
          // ┌────────────────────────────────────────────────────────────────┐
          // │ LE DÉLAI DES HOOKS EST RÉGLÉ EXPLICITEMENT, ET C'EST IMPORTANT.│
          // │                                                                │
          // │ Il valait 10 s par défaut, quand les tests en avaient 30. Un    │
          // │ `beforeAll` qui dépasse ne fait pas ÉCHOUER les tests du        │
          // │ fichier : il les SAUTE. Le fichier est bien signalé en échec,   │
          // │ mais le décompte affiche « 811 passés, 26 ignorés » — et un     │
          // │ total presque tout vert n'attire pas l'œil.                     │
          // │                                                                │
          // │ C'est arrivé : compléter le jeu de démonstration a porté la     │
          // │ préparation du stockage de dix-huit à près de quatre cents      │
          // │ objets, et toute la suite de sécurité des fichiers a disparu de │
          // │ l'exécution. Un test qui ne s'exécute pas ne proteste pas.      │
          // └────────────────────────────────────────────────────────────────┘
          hookTimeout: 30_000,
        },
      },
    ],
  },
});

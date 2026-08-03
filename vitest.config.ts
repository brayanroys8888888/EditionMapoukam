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
          // Réglés explicitement, comme pour l'intégration : les valeurs par
          // défaut de Vitest (5 s et 10 s) sont sous les délais que certains
          // tests unitaires demandent déjà — le filigrane embarque une police
          // de 3 104 glyphes.
          testTimeout: 30_000,
          hookTimeout: 60_000,
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
          // │ LE DÉLAI DES HOOKS EST ALIGNÉ SUR LE PLUS LENT DES TESTS QU'IL │
          // │ SERT, PLUS UNE MARGE. IL NE DOIT JAMAIS EXPIRER LE PREMIER.     │
          // │                                                                │
          // │ Un `beforeAll` qui expire ne fait pas ÉCHOUER les tests du      │
          // │ fichier : il les SAUTE. Le fichier est bien signalé en échec et  │
          // │ le code de sortie vaut 1 — mesuré, la porte tient — mais le      │
          // │ décompte affiche « 811 passés, 26 ignorés », ce qui se lit comme │
          // │ un succès dans un journal de trois cents lignes.                │
          // │                                                                │
          // │ C'est arrivé : compléter le jeu de démonstration a porté la      │
          // │ préparation du stockage de dix-huit à près de quatre cents       │
          // │ objets, et toute la suite de sécurité des fichiers a disparu de  │
          // │ l'exécution.                                                    │
          // │                                                                │
          // │ 360 s = le délai du test le plus lent de ce projet (300 s, la    │
          // │ chaîne d'ingestion complète) plus 20 %. Un hook qui PRÉPARE un   │
          // │ test de cinq minutes peut légitimement en demander autant.       │
          // │                                                                │
          // │ L'alignement n'est pas seulement écrit ici : il est VÉRIFIÉ par  │
          // │ tests/unit/porte-tests.test.ts, qui relit ce fichier et les      │
          // │ délais réellement demandés par les tests. Un commentaire se      │
          // │ périme, un test non.                                            │
          // └────────────────────────────────────────────────────────────────┘
          hookTimeout: 360_000,
        },
      },
      {
        resolve: { alias: { '@': src } },
        test: {
          /**
           * Composants d'interface, rendus dans un DOM simulé.
           *
           * ┌────────────────────────────────────────────────────────────────┐
           * │ MÊME EXÉCUTEUR QUE LE RESTE, ET C'EST DÉLIBÉRÉ.                │
           * │                                                                │
           * │ Un second exécuteur serait un second endroit où un test peut   │
           * │ être ignoré sans que la porte le voie — exactement le défaut   │
           * │ que `scripts/porte-tests.mjs` existe pour empêcher.            │
           * │                                                                │
           * │ Placé APRÈS `integration` : `tests/unit/porte-tests.test.ts`   │
           * │ lit les délais dans l'ordre des projets, et attend celui de    │
           * │ l'intégration en deuxième position.                            │
           * └────────────────────────────────────────────────────────────────┘
           */
          name: 'composants',
          environment: 'jsdom',
          include: ['tests/composants/**/*.test.tsx'],
          setupFiles: ['tests/setup/dom.ts'],
          // Aucune base, aucun réseau : ces tests sont rapides. Les délais
          // restent explicites — un projet sans réglage hérite du défaut de
          // Vitest, ce qui est précisément ce qui a fait sauter 26 tests.
          testTimeout: 15_000,
          hookTimeout: 30_000,
        },
      },
    ],
  },
});

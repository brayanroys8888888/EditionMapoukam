import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

const src = fileURLToPath(new URL('./src', import.meta.url));

/**
 * Épreuve d'expiration RÉELLE de jeton — hors porte de validation.
 *
 * Lancée par `npm run test:session-longue`, qui abaisse `jwt_expiry` et
 * redémarre la pile locale avant d'exécuter ce projet. Ne pas lancer
 * directement : sans le réglage abaissé, les tests attendraient une heure.
 *
 * Même parti pris que `vitest.audit.config.ts` : ce qui exige une pile
 * reconfigurée ne peut pas vivre dans la suite ordinaire, mais doit être
 * lançable d'une commande et inscrit au dossier de livraison (§5 quater, S6).
 */
export default defineConfig({
  resolve: { alias: { '@': src } },
  test: {
    name: 'session',
    environment: 'node',
    include: ['tests/session/**/*.test.ts'],
    setupFiles: ['tests/setup/load-env.ts'],
    fileParallelism: false,
    // Le test attend une expiration réelle : son délai doit couvrir la durée
    // de vie imposée par le script, plus la marge d'un aller-retour.
    testTimeout: 180_000,
    hookTimeout: 360_000,
  },
});

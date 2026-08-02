import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

const src = fileURLToPath(new URL('./src', import.meta.url));

/**
 * Configuration des AUDITS, séparée de la porte de validation.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ POURQUOI CES VÉRIFICATIONS NE SONT PAS DANS `npm run verify`.           │
 * │                                                                          │
 * │ Seize ingestions complètes prennent plus d'un quart d'heure. Les mettre  │
 * │ dans la porte la rendrait insupportable — et une porte insupportable     │
 * │ finit contournée, ce qui coûterait bien plus que ce qu'elle protège.     │
 * │                                                                          │
 * │ Ce n'est PAS le retour du test conditionnel que §5 sexies interdit : un  │
 * │ audit n'est pas ignoré silencieusement, il est lancé explicitement, et   │
 * │ son absence de la porte est écrite ici. La suite valide UN titre à       │
 * │ chaque commit ; l'audit valide les SEIZE avant une livraison.            │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 *     npm run audit:epub
 */
export default defineConfig({
  resolve: {
    alias: { '@': src },
  },
  test: {
    name: 'audit',
    environment: 'node',
    include: ['scripts/audit/**/*.audit.test.ts'],
    setupFiles: ['tests/setup/load-env.ts'],
    fileParallelism: false,
    // Une ingestion complète — rendu de toutes les pages en deux résolutions —
    // dépasse largement les délais de la suite ordinaire.
    testTimeout: 300_000,
    hookTimeout: 360_000,
  },
});

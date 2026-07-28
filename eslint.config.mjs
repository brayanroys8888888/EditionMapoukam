import js from '@eslint/js';
import tseslint from 'typescript-eslint';

/**
 * Configuration ESLint du projet.
 *
 * Trois familles de règles :
 *  1. les règles standard TypeScript, avec vérification de types ;
 *  2. les règles qui font respecter mécaniquement les contraintes de CLAUDE.md
 *     (pas de console.log, pas de `new Date()` dans la logique métier) ;
 *  3. les règles d'étanchéité de `src/domain/**` (§2.1 de docs/PLAN.md).
 *
 * Le plugin Next.js n'est volontairement pas installé : ce chantier est
 * backend, il ne comporte pas de composants React à auditer.
 */

/** Interdictions communes liées aux devises (docs/PLAN.md D4 point 3). */
const moneyRules = [
  {
    selector: "BinaryExpression[operator='/'][right.value=100]",
    message:
      'Division par 100 codée en dur : toutes les devises n’ont pas deux décimales (XAF, XOF). Utiliser src/lib/money.',
  },
  {
    selector: "BinaryExpression[operator='*'][right.value=100]",
    message:
      'Multiplication par 100 codée en dur : passer par src/lib/money, qui connaît le nombre de décimales de la devise.',
  },
];

/** Interdictions liées à l'horloge injectable (CLAUDE.md, docs/PLAN.md §2.5). */
const clockRules = [
  {
    selector: "NewExpression[callee.name='Date'][arguments.length=0]",
    message:
      'new Date() interdit dans la logique métier : injecter le service Clock (docs/PLAN.md §2.5).',
  },
  {
    selector: "CallExpression[callee.object.name='Date'][callee.property.name='now']",
    message:
      'Date.now() interdit dans la logique métier : injecter le service Clock (docs/PLAN.md §2.5).',
  },
];

export default tseslint.config(
  {
    ignores: [
      'node_modules/**',
      '.next/**',
      'coverage/**',
      "conte d'afrique/**",
      'next-env.d.ts',
      // Artefacts générés par `supabase start` (fonctions edge de démonstration).
      'supabase/.temp/**',
      // Types générés par `npm run db:types` depuis le schéma réel. Fichier
      // régénéré, jamais modifié à la main : le relire n'apporte rien.
      'src/lib/supabase/database.types.ts',
    ],
  },

  js.configs.recommended,

  // ---- TypeScript, avec vérification de types ----
  {
    files: ['**/*.ts', '**/*.tsx'],
    extends: [...tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // CLAUDE.md — « Pas de console.log en production, utiliser le logger ».
      'no-console': 'error',

      // CLAUDE.md — aucun `any` non justifié. Un `any` délibéré doit porter un
      // commentaire eslint-disable expliquant pourquoi, ce qui le rend visible
      // en relecture.
      '@typescript-eslint/no-explicit-any': 'error',

      // Un webhook dont la promesse n'est pas attendue est un droit perdu.
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',

      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],

      'no-restricted-syntax': ['error', ...moneyRules],
    },
  },

  // ---- Étanchéité de la logique métier : ni framework, ni base, ni prestataire ----
  {
    files: ['src/domain/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['next', 'next/*'],
              message:
                'src/domain ne connaît pas le framework. Faire remonter la dépendance dans src/app ou src/lib.',
            },
            {
              group: ['@supabase/*'],
              message:
                'src/domain ne connaît pas la base. Passer par un dépôt injecté.',
            },
            {
              group: ['@/adapters/*', '**/adapters/*'],
              message:
                'src/domain ne connaît pas les adaptateurs. Dépendre du contrat, pas de l’implémentation.',
            },
          ],
        },
      ],
      'no-restricted-syntax': ['error', ...moneyRules, ...clockRules],
    },
  },

  // ---- Les tests et le service d'horloge lui-même lisent l'heure réelle ----
  {
    files: ['tests/**/*.ts', 'src/lib/clock/**/*.ts'],
    rules: {
      'no-restricted-syntax': ['error', ...moneyRules],
    },
  },

  // ---- Scripts d'outillage : hors du programme TypeScript ----
  {
    files: ['**/*.mjs'],
    languageOptions: {
      globals: {
        console: 'readonly',
        process: 'readonly',
        URL: 'readonly',
        fetch: 'readonly',
      },
    },
    rules: {
      'no-console': 'off',
    },
  },
);

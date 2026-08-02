/**
 * Types de la porte de validation.
 *
 * Le script est en JavaScript pur — il doit se lancer avec `node` sans passe de
 * compilation, puisqu'il est LUI-MÊME ce qui lance la compilation et les tests.
 * Cette déclaration existe pour que `tests/unit/porte-tests.test.ts` puisse
 * l'inspecter en mode strict.
 */
export interface IgnoreAutorise {
  /** Nom complet du test, tel que Vitest le rapporte. */
  nom: string;
  /** Pourquoi ce test ne peut pas tourner. Doit être circonstancié. */
  raison: string;
}

/**
 * Tests dont l'absence d'exécution est tolérée.
 *
 * Volontairement vide, et un test le vérifie.
 */
export const IGNORES_AUTORISES: readonly IgnoreAutorise[];

import { vi } from 'vitest';

/**
 * LE ROUTEUR SIMULÉ, PARTAGÉ ET INSPECTABLE.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ POURQUOI IL VIT DANS SON PROPRE FICHIER.                                 │
 * │                                                                          │
 * │ `tests/setup/dom.ts` remplace `useRouter`, mais un fichier de préparation │
 * │ n'est pas importable depuis un test : ses espions y seraient hors de      │
 * │ portée. Pire, un `useRouter` qui rendrait un objet neuf à chaque appel    │
 * │ donnerait des espions différents à chaque rendu — et un test ne pourrait  │
 * │ jamais vérifier qu'une navigation a eu lieu.                             │
 * │                                                                          │
 * │ Le même objet est donc défini ici, importé par la préparation ET par les  │
 * │ tests qui interrogent la navigation.                                     │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export const routeurSimule = {
  push: vi.fn(),
  replace: vi.fn(),
  refresh: vi.fn(),
  back: vi.fn(),
  forward: vi.fn(),
  prefetch: vi.fn(),
};

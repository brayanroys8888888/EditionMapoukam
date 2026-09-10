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

/**
 * L'ADRESSE SIMULÉE — même raison d'être que le routeur ci-dessus.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ ELLE VIT ICI PARCE QU'UN SECOND `vi.mock` DU MÊME MODULE TUE LE         │
 * │ PROCESSUS DE TEST.                                                       │
 * │                                                                          │
 * │ La tentation, pour un test qui a besoin de `useSearchParams`, est de     │
 * │ remplacer `next/navigation` une seconde fois dans son propre fichier.    │
 * │ `tests/setup/dom.ts` le remplace déjà : les deux remplacements entrent   │
 * │ en conflit, le worker meurt sans exécuter un seul test, et le rapport    │
 * │ ne dit que « Worker exited unexpectedly » — trois minutes d'attente pour │
 * │ un message qui ne nomme ni le fichier ni la cause.                       │
 * │                                                                          │
 * │ Il n'y a donc qu'UN remplacement, et les tests posent l'adresse ici.     │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export const adresseSimulee = {
  chemin: '/fr',
  requete: '',
};

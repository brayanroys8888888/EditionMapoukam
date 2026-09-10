import type { ReponsePage } from '@/domain/api/contract';

/**
 * L'ÉTAT DE LA SCÈNE — cinq cas, et pas un de plus.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ POURQUOI CE TYPE VIT DANS SON PROPRE FICHIER.                           │
 * │                                                                          │
 * │ Le lecteur a désormais DEUX scènes — celle de la V2 et celle d'Organic   │
 * │ — et une seule logique. La logique le produit, les deux scènes le lisent.│
 * │ Le laisser dans le composant qui le produit ferait importer ce composant │
 * │ par ses propres enfants, c'est-à-dire un cycle.                          │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * `sessionPerdue` et `finExtrait` sont deux réponses au MÊME code HTTP, 403.
 * Voir l'encadré en tête de `index.tsx` : c'est la distinction la plus
 * importante de cet écran, et elle ne se déduit pas de la réponse.
 */
export type Etat =
  | { sorte: 'chargement' }
  | { sorte: 'page'; donnees: ReponsePage }
  | { sorte: 'finExtrait' }
  | { sorte: 'sessionPerdue' }
  | { sorte: 'erreur' };

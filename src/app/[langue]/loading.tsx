import { headers } from 'next/headers';

import { Squelette } from '@/components/etats';
import { langueValide, traduire } from '@/i18n';

/**
 * Chargement d'une page.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ UN SQUELETTE, ET NON UN ROTOR.                                          │
 * │                                                                          │
 * │ La forme du résultat est connue d'avance : une page. Réserver sa place   │
 * │ évite le décalage brutal à l'arrivée des données — et sur connexion      │
 * │ lente, ce décalage fait cliquer à côté.                                  │
 * │                                                                          │
 * │ L'enveloppe reste affichée pendant ce temps : la navigation est          │
 * │ utilisable avant que le contenu n'arrive, ce qui compte quand l'attente  │
 * │ se mesure en secondes.                                                   │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export default async function Chargement() {
  const langue = langueValide((await headers()).get('x-langue'));
  return <Squelette lignes={6} libelle={traduire(langue, 'etats.chargement')} />;
}

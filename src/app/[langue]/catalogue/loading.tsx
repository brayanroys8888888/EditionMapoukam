import { headers } from 'next/headers';

import { langueValide, traduire } from '@/i18n';
import { Squelette } from '@/components/etats';
import { SqueletteGrille } from '@/components/etats/squelettes-v2';
import { versionDesign } from '@/design/version';

/**
 * Chargement de la boutique.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LE SQUELETTE A LA FORME DE LA GRILLE, PAS D'UNE PAGE QUELCONQUE.        │
 * │                                                                          │
 * │ Le rapport 2/3 des couvertures est reproduit tel quel : c'est lui qui    │
 * │ réserve la hauteur réelle. Un squelette de six lignes grises réserverait │
 * │ la mauvaise place, et la page sauterait quand même à l'arrivée — sur     │
 * │ connexion lente, c'est ce saut qui fait cliquer à côté.                  │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export default async function ChargementCatalogue() {
  const langue = langueValide((await headers()).get('x-langue'));

  if (versionDesign() !== 'v2') {
    return <Squelette lignes={8} libelle={traduire(langue, 'catalogue.chargement')} />;
  }

  return <SqueletteGrille langue={langue} nombre={9} />;
}

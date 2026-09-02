import { headers } from 'next/headers';

import { langueValide, traduire } from '@/i18n';
import { Squelette } from '@/components/etats';
import { SqueletteGrille } from '@/components/etats/squelettes-v2';
import { versionDesign } from '@/design/version';

/**
 * Chargement du rayon des livrets — le MÊME squelette que le catalogue.
 *
 * La grille est la même, le rapport des couvertures est le même, donc la place
 * réservée doit l'être aussi. Un squelette propre à cet écran aurait fini par
 * réserver une hauteur différente, et la page sauterait à l'arrivée sur le
 * seul rayon — un défaut qu'on ne voit qu'en visitant cette page-là.
 */
export default async function ChargementLivrets() {
  const langue = langueValide((await headers()).get('x-langue'));

  if (versionDesign() !== 'v2') {
    return <Squelette lignes={8} libelle={traduire(langue, 'catalogue.chargement')} />;
  }

  return <SqueletteGrille langue={langue} nombre={9} />;
}

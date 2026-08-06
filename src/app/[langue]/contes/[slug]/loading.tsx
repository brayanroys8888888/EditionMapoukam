import { headers } from 'next/headers';

import { langueValide, traduire } from '@/i18n';
import { Squelette } from '@/components/etats';
import { SqueletteFiche } from '@/components/etats/squelettes-v2';
import { versionDesign } from '@/design/version';

/** Chargement d'une fiche — deux colonnes, couverture à gauche. */
export default async function ChargementFiche() {
  const langue = langueValide((await headers()).get('x-langue'));

  if (versionDesign() !== 'v2') {
    return <Squelette lignes={6} libelle={traduire(langue, 'etats.chargement')} />;
  }

  return <SqueletteFiche langue={langue} />;
}

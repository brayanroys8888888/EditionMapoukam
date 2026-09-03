import { headers } from 'next/headers';

import { langueValide } from '@/i18n';
import { SqueletteArticles } from '@/components/etats/squelettes-v2';

/** Chargement de l'espace de l'association. */
export default async function ChargementAssociation() {
  const langue = langueValide((await headers()).get('x-langue'));
  return <SqueletteArticles langue={langue} />;
}

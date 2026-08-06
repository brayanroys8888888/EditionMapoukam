import { headers } from 'next/headers';

import { langueValide } from '@/i18n';
import { SqueletteArticles } from '@/components/etats/squelettes-v2';

/** Chargement de la liste du blog. */
export default async function ChargementBlog() {
  const langue = langueValide((await headers()).get('x-langue'));
  return <SqueletteArticles langue={langue} />;
}

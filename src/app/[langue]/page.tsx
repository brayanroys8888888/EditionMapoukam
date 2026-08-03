import { headers } from 'next/headers';

import { langueValide, traduire } from '@/i18n';

/**
 * Accueil — jalon, jusqu'à l'étape F4.
 *
 * L'enveloppe (en-tête, pied de page, langue, état de connexion) est en place
 * et éprouvée ; le contenu de cette page — bannière, mise en avant, présentation
 * des deux offres, §4.1 F1 — vient avec le catalogue, dont il dépend.
 */
export default async function Accueil() {
  const langue = langueValide((await headers()).get('x-langue'));

  return (
    <section>
      <h1>{traduire(langue, 'marque.nom')}</h1>
      <p>{traduire(langue, 'marque.baseline')}</p>
    </section>
  );
}

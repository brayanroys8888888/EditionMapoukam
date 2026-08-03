import { headers } from 'next/headers';

import { Vide } from '@/components/etats';
import { langueValide, traduire } from '@/i18n';

/**
 * Page introuvable.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ UN 404 SANS ISSUE EST UN CUL-DE-SAC.                                    │
 * │                                                                          │
 * │ Cette page est souvent atteinte par un lien ancien ou par un conte       │
 * │ archivé — pas par une faute de frappe. Dire « page introuvable » et      │
 * │ s'arrêter là renvoie l'utilisateur au bouton « retour », c'est-à-dire    │
 * │ dehors. Le catalogue, lui, est toujours là.                              │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Rappel de `src/lib/catalog/repository.ts` : un brouillon, un titre archivé et
 * un slug inconnu répondent tous 404, délibérément. Sans quoi le catalogue à
 * venir serait devinable un slug à la fois.
 */
export default async function Introuvable() {
  const langue = langueValide((await headers()).get('x-langue'));

  return (
    <Vide
      langue={langue}
      titre={traduire(langue, 'pages.introuvableTitre')}
      detail={traduire(langue, 'pages.introuvableCorps')}
      action={
        <a href={`/${langue}/catalogue`}>{traduire(langue, 'pages.introuvableAction')}</a>
      }
    />
  );
}

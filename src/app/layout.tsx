import type { ReactNode } from 'react';
import { headers } from 'next/headers';

import { langueValide } from '@/i18n';
import '@/design/tokens.css';
// APRÈS les jetons, et non avant : le pont shadcn les LIT (`var(--fond)`, …).
// Inversé, Tailwind résoudrait des variables encore indéfinies.
import '@/design/tailwind.css';

/**
 * Enveloppe racine.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ C'EST ICI QUE LES JETONS ENTRENT DANS L'APPLICATION, ET NULLE PART      │
 * │ AILLEURS.                                                               │
 * │                                                                          │
 * │ Importés une fois, ils deviennent des variables CSS disponibles partout. │
 * │ Un composant qui réimporterait la feuille la dupliquerait dans le        │
 * │ bundle ; un composant qui écrirait ses propres couleurs créerait une     │
 * │ seconde source — et `tests/unit/design-tokens.test.ts` échoue sur toute  │
 * │ valeur hexadécimale écrite hors du fichier de jetons.                    │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ `lang` VIENT DU MIDDLEWARE, PAS D'UNE CONSTANTE.                        │
 * │                                                                          │
 * │ L'élément `<html>` n'existe que dans l'enveloppe RACINE ; l'enveloppe de │
 * │ langue, imbriquée, ne peut pas le modifier. Le middleware pose donc      │
 * │ `x-langue`, et cette page le lit.                                        │
 * │                                                                          │
 * │ Un `lang` faux n'est pas cosmétique : il fait lire un texte français à   │
 * │ un lecteur d'écran avec la prosodie anglaise — c'est-à-dire à peu près   │
 * │ inintelligible. C'est un critère AA, pas une finition.                   │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export default async function RootLayout({ children }: { children: ReactNode }) {
  const langue = langueValide((await headers()).get('x-langue'));

  return (
    <html lang={langue}>
      <body>{children}</body>
    </html>
  );
}

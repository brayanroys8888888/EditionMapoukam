import type { ReactNode } from 'react';

import { traduire, LANGUE_PAR_DEFAUT } from '@/i18n';
import '@/design/tokens.css';

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
 * `lang` est figé au français jusqu'à l'étape F2, qui introduira les routes
 * préfixées par la langue. Un `lang` faux n'est pas cosmétique : il fait lire
 * un texte français à un lecteur d'écran avec la prosodie anglaise.
 */
export const metadata = {
  title: traduire(LANGUE_PAR_DEFAUT, 'marque.nom'),
  description: traduire(LANGUE_PAR_DEFAUT, 'marque.baseline'),
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang={LANGUE_PAR_DEFAUT}>
      <body>{children}</body>
    </html>
  );
}

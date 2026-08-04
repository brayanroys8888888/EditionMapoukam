import type { ReactNode } from 'react';
import { headers } from 'next/headers';

import { langueValide } from '@/i18n';
import '@/design/tokens.css';
// Les `@font-face` : ils ne dépendent d'aucun jeton, mais les jetons les
// nomment (`--police-titre: 'Fraunces'`). Déclarés ici, jamais dans un écran.
import '@/design/polices.css';
// La réinitialisation des maquettes (§A.1) : fond, lien, focus, familles de
// titre. Après les jetons, dont elle lit les variables.
import '@/design/global.css';
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
      <head>
        {/*
         * Les DEUX familles que toute page emploie au-dessus de la ligne de
         * flottaison — l'interface et les titres. Literata n'est préchargée
         * nulle part : elle ne sert qu'à la lecture longue, et la précharger
         * ferait payer 110 Ko à un visiteur qui n'ouvrira jamais un conte.
         *
         * `crossOrigin` est OBLIGATOIRE même en même origine : une police est
         * toujours récupérée en mode CORS, et sans cet attribut le navigateur
         * télécharge le fichier DEUX FOIS — une pour rien.
         */}
        <link
          rel="preload"
          href="/fonts/nunito-latin-wght-normal.woff2"
          as="font"
          type="font/woff2"
          crossOrigin="anonymous"
        />
        <link
          rel="preload"
          href="/fonts/fraunces-latin-full-normal.woff2"
          as="font"
          type="font/woff2"
          crossOrigin="anonymous"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}

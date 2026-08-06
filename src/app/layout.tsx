import type { ReactNode } from 'react';
import { headers } from 'next/headers';

import { langueValide } from '@/i18n';
import { versionDesign } from '@/design/version';
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
    /*
     * ┌──────────────────────────────────────────────────────────────────────┐
     * │ `data-design` EST TOUT LE COMMUTATEUR DE THÈME.                      │
     * │                                                                      │
     * │ Il est posé sur l'élément RACINE, et nulle part ailleurs : c'est de  │
     * │ lui que dépend le bloc `[data-design='v2']` des jetons, donc toute   │
     * │ la palette. Le poser plus bas ne colorerait qu'une partie de la      │
     * │ page, et l'oublier servirait la V1 — ce qui est le bon repli.        │
     * │                                                                      │
     * │ Aucun composant ne le lit : ils lisent des jetons, qui changent de   │
     * │ valeur sous eux. C'est ce qui permet à treize écrans déjà livrés de  │
     * │ changer de direction sans qu'une ligne de leur code bouge.           │
     * └──────────────────────────────────────────────────────────────────────┘
     */
    <html lang={langue} data-design={versionDesign()}>
      <head>
        {/*
         * ┌────────────────────────────────────────────────────────────────┐
         * │ L'ICÔNE D'ONGLET EST LE LOGO SUR UN DISQUE VERT.              │
         * │                                                                │
         * │ Le fichier fourni est BLANC sur transparent : posé tel quel    │
         * │ comme favicon, il serait invisible sur l'onglet clair de tout  │
         * │ navigateur — c'est-à-dire dans le cas le plus courant.         │
         * │                                                                │
         * │ `scripts/` le compose donc sur un disque vert, une fois, et le │
         * │ résultat est versionné. Une icône générée à la volée par le    │
         * │ navigateur n'existe pas.                                       │
         * └────────────────────────────────────────────────────────────────┘
         */}
        <link rel="icon" href="/favicon.png" type="image/png" sizes="32x32" />
        <link rel="apple-touch-icon" href="/images/icone-180.png" sizes="180x180" />

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

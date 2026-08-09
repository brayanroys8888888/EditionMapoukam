import type { NextConfig } from 'next';

/**
 * LE MOTEUR DE RENDU, EMBARQUÉ DANS LES FONCTIONS QUI INGÈRENT.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ POURQUOI CETTE LIGNE EXISTE ENCORE, ALORS QUE LE MOTEUR A CHANGÉ.       │
 * │                                                                          │
 * │ Vercel n'embarque dans une fonction que ce qu'il a su SUIVRE depuis les  │
 * │ imports. `@hyzyla/pdfium` charge son `.wasm` à l'exécution, par un       │
 * │ chemin relatif à son propre paquet : rien dans le code applicatif ne le  │
 * │ désigne, donc rien ne le fait monter.                                    │
 * │                                                                          │
 * │ La différence avec le moteur précédent est décisive. `@napi-rs/canvas`   │
 * │ résolvait un binaire NATIF selon la plateforme — branches sur            │
 * │ `process.platform`, `ldd --version` pour distinguer glibc de musl — et   │
 * │ aucune inclusion ne l'a jamais rendu chargeable en ligne : mesuré deux   │
 * │ fois en production. Ici il n'y a qu'UN fichier, le même partout, à un    │
 * │ chemin fixe. Une inclusion suffit, et elle est vérifiable.               │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
const MOTEUR_DE_RENDU = ['./node_modules/@hyzyla/pdfium/dist/**'];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Ce chantier est backend : les erreurs de type sont traitées par
  // `npm run verify`, jamais contournées au build. (Next 16 a retiré
  // l'intégration ESLint du build ; `npm run lint` s'en charge.)
  typescript: { ignoreBuildErrors: false },
  /*
   * ┌──────────────────────────────────────────────────────────────────────┐
   * │ DEUX PAQUETS QUE LE GROUPEUR NE DOIT PAS TOUCHER.                    │
   * │                                                                      │
   * │ `sharp` embarque un BINAIRE NATIF, choisi à l'exécution selon la      │
   * │ plateforme. Empaqueté, sa résolution casse — et elle casse au         │
   * │ DÉPLOIEMENT, pas en local, puisque le binaire manquant est celui de   │
   * │ Linux.                                                                │
   * │                                                                      │
   * │ `@hyzyla/pdfium` charge un `.wasm` de quatre mégaoctets par un chemin │
   * │ relatif à son paquet. Empaqueté, ce chemin ne veut plus rien dire.    │
   * │                                                                      │
   * │ Les deux ne servent QUE côté serveur : rien de tout cela n'a de       │
   * │ raison d'atteindre un navigateur.                                     │
   * └──────────────────────────────────────────────────────────────────────┘
   */
  serverExternalPackages: ['sharp', '@hyzyla/pdfium'],

  /*
   * ┌──────────────────────────────────────────────────────────────────────┐
   * │ CE QUE LE TRACEUR DE FICHIERS NE TROUVE PAS TOUT SEUL.               │
   * │                                                                      │
   * │ Vercel n'embarque dans une fonction que les fichiers qu'il a su       │
   * │ SUIVRE depuis les imports. Il suit bien les imports statiques ; il    │
   * │ perd la trace de ce qu'un paquet charge lui-même à l'exécution.       │
   * │                                                                      │
   * │ Le moteur WASM est exactement ce cas : rien dans le code applicatif   │
   * │ ne désigne son fichier `.wasm`, donc rien ne le fait monter dans le   │
   * │ paquet — et l'absence ne se voit qu'EN LIGNE, au premier conte        │
   * │ déposé, sous la forme d'un module introuvable.                        │
   * │                                                                      │
   * │ Il vise les trois routes qui ingèrent : la route d'API, et les deux   │
   * │ écrans qui hébergent une Server Action de dépôt — car c'est la        │
   * │ fonction de la PAGE qui exécute le travail, l'action appelant la      │
   * │ route en mémoire plutôt que par le réseau.                            │
   * └──────────────────────────────────────────────────────────────────────┘
   */
  outputFileTracingIncludes: {
    '/api/admin/books/ingest': MOTEUR_DE_RENDU,
    '/[langue]/admin/contes/nouveau': MOTEUR_DE_RENDU,
    '/[langue]/admin/contes/[id]': MOTEUR_DE_RENDU,
  },

  experimental: {
    /*
     * ┌──────────────────────────────────────────────────────────────────────┐
     * │ LE DÉPÔT D'UN CONTE ÉCHOUAIT SUR CE PLAFOND, ET SUR RIEN D'AUTRE.   │
     * │                                                                      │
     * │ Next borne le corps d'une Server Action à 1 Mo par défaut. Les contes │
     * │ du corpus pèsent 1,1 Mo : le dépôt échouait donc pour CHAQUE fichier  │
     * │ réel, avec « Body exceeded 1 MB limit » côté serveur et l'écran       │
     * │ d'erreur générique côté éditeur — qui ne pouvait pas deviner que son  │
     * │ fichier était trop gros, puisque l'écran lui annonce cent mégaoctets. │
     * │                                                                      │
     * │ La valeur est donc alignée sur `TAILLE_MAX_OCTETS` de la route        │
     * │ d'ingestion, elle-même alignée sur la limite du bucket `book-sources` │
     * │ (migration 0020). Trois plafonds, un seul nombre — et un test unitaire │
     * │ échoue s'ils divergent, parce qu'un plafond plus bas ici ferait        │
     * │ échouer un dépôt que la route aurait accepté, sans dire pourquoi.     │
     * └──────────────────────────────────────────────────────────────────────┘
     *
     * ┌──────────────────────────────────────────────────────────────────────┐
     * │ CE RÉGLAGE EST GLOBAL, ET C'EST SA CONTREPARTIE.                    │
     * │                                                                      │
     * │ Il vaut pour TOUTES les Server Actions, pas seulement pour le dépôt : │
     * │ un corps de cent mégaoctets sera désormais mis en mémoire avant que   │
     * │ la moindre action ne s'exécute, donc avant tout contrôle de rôle.     │
     * │                                                                      │
     * │ C'est acceptable ici — le dépôt est la seule action qui porte un      │
     * │ fichier, et la route qu'elle appelle borne déjà sa concurrence à deux │
     * │ places. Ce ne le sera plus le jour d'une mise en ligne : à inscrire   │
     * │ dans docs/AVANT-MISE-EN-PRODUCTION.md plutôt qu'à découvrir sous      │
     * │ charge.                                                              │
     * └──────────────────────────────────────────────────────────────────────┘
     */
    serverActions: { bodySizeLimit: '100mb' },
  },

  headers() {
    return Promise.resolve([
      {
        source: '/images/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
    ]);
  },
};

export default nextConfig;

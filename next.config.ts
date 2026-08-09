import type { NextConfig } from 'next';

/**
 * CE QUE LE TRACEUR DE FICHIERS NE PEUT PAS DEVINER.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ DEUX PAQUETS QUI CHOISISSENT LEURS FICHIERS À L'EXÉCUTION.              │
 * │                                                                          │
 * │ Vercel n'embarque dans une fonction que ce qu'il a su SUIVRE depuis les  │
 * │ imports. Il suit les imports statiques ; il perd tout ce qu'un paquet    │
 * │ résout lui-même au moment de tourner.                                    │
 * │                                                                          │
 * │ `@napi-rs/canvas` est le cas d'école : son `requireNative()` choisit le  │
 * │ binaire dans des branches conditionnelles sur `process.platform`, et va  │
 * │ jusqu'à lancer `ldd --version` pour distinguer glibc de musl. Aucune     │
 * │ analyse statique ne peut résoudre cela — le binaire Linux restait donc   │
 * │ hors du paquet, et le rendu échouait en ligne sur un « module            │
 * │ introuvable » qui ne disait pas son nom.                                 │
 * │                                                                          │
 * │ `pdfjs-dist` fait de même avec son worker et ses cartes de caractères.   │
 * │                                                                          │
 * │ Le motif est LARGE (`@napi-rs/**`) à dessein : viser le seul paquet      │
 * │ `linux-x64-gnu` reviendrait à parier sur l'architecture de              │
 * │ l'hébergeur, et ce pari se perdrait en silence le jour où elle change.   │
 * │ Quelques mégaoctets de plus valent mieux qu'une fonction qui se déploie  │
 * │ sans son moteur de rendu.                                                │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
const MOTEUR_DE_RENDU = [
  './node_modules/pdfjs-dist/legacy/build/**',
  './node_modules/@napi-rs/**',
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Ce chantier est backend : les erreurs de type sont traitées par
  // `npm run verify`, jamais contournées au build. (Next 16 a retiré
  // l'intégration ESLint du build ; `npm run lint` s'en charge.)
  typescript: { ignoreBuildErrors: false },
  /*
   * ┌──────────────────────────────────────────────────────────────────────┐
   * │ TROIS PAQUETS QUE LE GROUPEUR NE DOIT PAS TOUCHER.                   │
   * │                                                                      │
   * │ `sharp` et `@napi-rs/canvas` embarquent des BINAIRES NATIFS, choisis  │
   * │ à l'exécution selon la plateforme. Empaquetés, leur résolution casse  │
   * │ — et elle casse au DÉPLOIEMENT, pas en local, puisque le binaire      │
   * │ manquant est celui de Linux.                                          │
   * │                                                                      │
   * │ `pdfjs-dist` est chargé par `await import()` et va chercher ses       │
   * │ propres ressources (cartes de caractères, polices standard) par des   │
   * │ chemins relatifs à son paquet. Le groupeur les perd en route.         │
   * │                                                                      │
   * │ Les trois ne servent QUE côté serveur : rien de tout cela n'a de      │
   * │ raison d'atteindre un navigateur.                                     │
   * └──────────────────────────────────────────────────────────────────────┘
   */
  serverExternalPackages: ['sharp', '@napi-rs/canvas', 'pdfjs-dist'],

  /*
   * ┌──────────────────────────────────────────────────────────────────────┐
   * │ CE QUE LE TRACEUR DE FICHIERS NE TROUVE PAS TOUT SEUL.               │
   * │                                                                      │
   * │ Vercel n'embarque dans une fonction que les fichiers qu'il a su       │
   * │ SUIVRE depuis les imports. Il suit bien les imports statiques ; il    │
   * │ perd la trace de ce qu'un paquet charge lui-même à l'exécution.       │
   * │                                                                      │
   * │ pdf.js est exactement ce cas : il résout son *worker* et ses cartes   │
   * │ de caractères par des chemins calculés au moment du rendu. Rien ne    │
   * │ les désigne dans le code, donc rien ne les fait monter dans le        │
   * │ paquet — et l'absence ne se voit qu'EN LIGNE, au premier conte        │
   * │ déposé, sous la forme d'un module introuvable.                        │
   * │                                                                      │
   * │ Le motif vise les trois routes qui ingèrent : la route d'API et les   │
   * │ deux écrans qui hébergent une Server Action de dépôt.                 │
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

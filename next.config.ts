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
    // Le dépôt d'un livret suit la MÊME règle : `deposerLivret` appelle
    // `ingererRoute` en mémoire, donc le moteur tourne dans la fonction de cet
    // écran-là. L'oublier ne se verrait qu'en ligne, au premier livret déposé.
    '/[langue]/admin/livrets/nouveau': MOTEUR_DE_RENDU,
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

    /*
     * ┌──────────────────────────────────────────────────────────────────────┐
     * │ LE QUATRIÈME PLAFOND, ET IL TRONQUE AU LIEU DE REFUSER.              │
     * │                                                                      │
     * │ Next 16 borne à 10 Mo le corps de TOUTE requête dès qu'un proxy —     │
     * │ notre `middleware.ts` — est déclaré. Ce plafond-là ne rejette pas :   │
     * │ il COUPE le flux à dix mégaoctets et laisse la suite se dérouler sur  │
     * │ un corps amputé. Le formulaire multipart s'arrête donc au milieu      │
     * │ d'une frontière, et l'éditeur reçoit « Unexpected end of form » —     │
     * │ une erreur de syntaxe, là où la cause est une taille.                 │
     * │                                                                      │
     * │ Un plafond qui tronque est pire que celui de 1 Mo déjà rencontré :    │
     * │ celui-là refusait, celui-ci laisse croire que le fichier est corrompu.│
     * │                                                                      │
     * │ Même nombre que les trois autres — `TAILLE_MAX_OCTETS`, le           │
     * │ `bodySizeLimit` ci-dessus, la limite du bucket `book-sources`         │
     * │ (migration 0020) — pour que le refus vienne de la route d'ingestion,  │
     * │ qui sait dire pourquoi. `tests/unit/plafond-depot.test.ts` échoue     │
     * │ s'ils divergent.                                                      │
     * │                                                                      │
     * │ `proxyClientMaxBodySize` et non `middlewareClientMaxBodySize` : le    │
     * │ second est le nom déprécié du même réglage, et les déclarer tous les  │
     * │ deux est une erreur de configuration fatale au démarrage.             │
     * └──────────────────────────────────────────────────────────────────────┘
     */
    proxyClientMaxBodySize: '100mb',
  },

  /*
   * ┌──────────────────────────────────────────────────────────────────────┐
   * │ LE BLOG A DÉMÉNAGÉ — §3.6, DÉCISION DU 3 SEPTEMBRE 2026.             │
   * │                                                                      │
   * │ La section « blog » est devenue l'espace de l'Association Dave, et    │
   * │ ses articles y sont repris en accès libre. Les adresses `/fr/blog` et │
   * │ `/fr/blog/<slug>` ont été partagées, indexées et mises en favori : les│
   * │ laisser tomber en 404 perdrait tout ce référencement, et un lecteur   │
   * │ qui revient sur un article ne comprendrait pas ce qui a disparu.      │
   * │                                                                      │
   * │ `permanent: true` — un 308, et non un 307. La ressource a bien changé │
   * │ d'adresse pour de bon ; un moteur qui reçoit un 307 garde l'ancienne  │
   * │ URL dans son index et continue de l'offrir.                           │
   * │                                                                      │
   * │ Le slug est CONSERVÉ, parce que les contenus le conservent : le jeu   │
   * │ de démonstration reprend les articles sous les mêmes slugs. Un slug   │
   * │ qui n'existerait pas de l'autre côté aboutit à un 404 sur            │
   * │ `/association/<slug>`, ce qui reste la bonne réponse.                 │
   * │                                                                      │
   * │ Ici et non dans le middleware : celui-ci gère le préfixe de langue et │
   * │ la session, et `tests/unit/middleware.test.ts` exige que chaque       │
   * │ entrée le traverse SANS redirection. Une redirection d'adresse est un │
   * │ réglage de routage, pas une décision de session.                      │
   * └──────────────────────────────────────────────────────────────────────┘
   */
  redirects() {
    return Promise.resolve([
      {
        source: '/:langue(fr|en)/blog',
        destination: '/:langue/association',
        permanent: true,
      },
      {
        source: '/:langue(fr|en)/blog/:slug',
        destination: '/:langue/association/:slug',
        permanent: true,
      },
      // Sans préfixe de langue : le middleware l'aurait ajouté, mais il ne
      // voit plus une adresse que cette redirection a déjà consommée.
      { source: '/blog', destination: '/fr/association', permanent: true },
      { source: '/blog/:slug', destination: '/fr/association/:slug', permanent: true },
    ]);
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

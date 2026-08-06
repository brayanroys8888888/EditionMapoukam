import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Ce chantier est backend : les erreurs de type sont traitées par
  // `npm run verify`, jamais contournées au build. (Next 16 a retiré
  // l'intégration ESLint du build ; `npm run lint` s'en charge.)
  typescript: { ignoreBuildErrors: false },
  // poppler et sharp sont invoqués côté serveur uniquement ; ils ne doivent
  // jamais être embarqués dans un bundle client.
  serverExternalPackages: ['sharp'],

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

import type { MetadataRoute } from 'next';

import { getServerEnv } from '@/lib/config/env';

/**
 * `robots.txt` — §5.4.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ CE FICHIER N'EST PAS UNE PROTECTION, ET NE DOIT JAMAIS ÊTRE PRIS POUR   │
 * │ TELLE.                                                                   │
 * │                                                                          │
 * │ Les exclusions ci-dessous épargnent au robot des pages qui n'ont aucun   │
 * │ sens dans un index — un panier, un espace personnel, une console de      │
 * │ simulation. Elles n'empêchent RIEN : ce qui protège ces pages, ce sont   │
 * │ les gardes serveur, le contrôle des droits à chaque requête et la        │
 * │ fermeture de `/dev` en production.                                       │
 * │                                                                          │
 * │ Un `robots.txt` qui serait la seule barrière indiquerait à qui le lit    │
 * │ exactement où chercher.                                                  │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export default function robots(): MetadataRoute.Robots {
  const base = getServerEnv().NEXT_PUBLIC_APP_URL;

  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: [
        // Sans intérêt pour un index, et propres à chaque visiteur.
        '/api/',
        '/dev/',
        '/fr/compte/',
        '/en/compte/',
        '/fr/panier/',
        '/en/panier/',
        '/fr/admin/',
        '/en/admin/',
        // Les écrans d'authentification : indexer « Se connecter » n'apporte
        // rien, et fait remonter un formulaire là où on cherchait un conte.
        '/fr/connexion',
        '/en/connexion',
        '/fr/inscription',
        '/en/inscription',
        '/fr/mot-de-passe-oublie',
        '/en/mot-de-passe-oublie',
        '/fr/nouveau-mot-de-passe',
        '/en/nouveau-mot-de-passe',
        '/fr/confirmation',
        '/en/confirmation',
      ],
    },
    sitemap: `${base}/sitemap.xml`,
  };
}

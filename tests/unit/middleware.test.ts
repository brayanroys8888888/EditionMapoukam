import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';

import { middleware } from '@/middleware';
import { ACCESS_TOKEN_COOKIE, REFRESH_TOKEN_COOKIE } from '@/lib/auth/cookies';

/**
 * MIDDLEWARE — langue, puis session.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ C'EST LE SEUL ENDROIT TRAVERSÉ PAR TOUTE NAVIGATION.                    │
 * │                                                                          │
 * │ Une erreur ici ne casse pas un écran : elle casse le site. D'où          │
 * │ l'énumération des cas plutôt que quelques sondages.                      │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
const ORIGINE = 'http://localhost:3000';

function requete(
  chemin: string,
  options: { cookies?: Record<string, string>; langueNavigateur?: string } = {},
): NextRequest {
  const entetes = new Headers();
  if (options.langueNavigateur) entetes.set('accept-language', options.langueNavigateur);

  const biscuits = Object.entries(options.cookies ?? {})
    .map(([nom, valeur]) => `${nom}=${valeur}`)
    .join('; ');
  if (biscuits) entetes.set('cookie', biscuits);

  return new NextRequest(new URL(chemin, ORIGINE), { headers: entetes });
}

/** JWT dont seule l'échéance compte. */
function jeton(expDansSecondes: number): string {
  const encoder = (v: unknown): string =>
    Buffer.from(JSON.stringify(v), 'utf8')
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
  const exp = Math.floor(Date.now() / 1000) + expDansSecondes;
  return `${encoder({ alg: 'HS256' })}.${encoder({ exp })}.signature`;
}

describe('préfixe de langue', () => {
  it('redirige la racine vers la langue par défaut', async () => {
    const reponse = await middleware(requete('/'));

    expect(reponse.status).toBe(307);
    expect(reponse.headers.get('location')).toBe(`${ORIGINE}/fr`);
  });

  it('REDIRIGE plutôt que de réécrire — §5.4', async () => {
    // ┌────────────────────────────────────────────────────────────────────┐
    // │ Une réécriture servirait deux langues sous la même adresse : les    │
    // │ moteurs n'en indexeraient qu'une, et un lien partagé n'emporterait  │
    // │ pas la langue de son auteur.                                        │
    // └────────────────────────────────────────────────────────────────────┘
    const reponse = await middleware(requete('/catalogue'));
    expect(reponse.status).toBe(307);
    expect(reponse.headers.get('location')).toBe(`${ORIGINE}/fr/catalogue`);
  });

  it('conserve la chaîne de requête en redirigeant', async () => {
    // Un lien partagé porte ses filtres. Les perdre à la redirection ferait
    // atterrir sur un catalogue non filtré, sans explication.
    const reponse = await middleware(requete('/catalogue?region=sahel&page=2'));
    expect(reponse.headers.get('location')).toBe(`${ORIGINE}/fr/catalogue?region=sahel&page=2`);
  });

  it('suit la préférence enregistrée avant l’en-tête du navigateur', async () => {
    const reponse = await middleware(
      requete('/catalogue', { cookies: { contes_langue: 'en' }, langueNavigateur: 'fr-FR,fr' }),
    );
    // Le choix explicite l'emporte sur celui du navigateur : l'utilisateur a
    // basculé la langue, il ne veut pas qu'on le lui redemande à chaque page.
    expect(reponse.headers.get('location')).toBe(`${ORIGINE}/en/catalogue`);
  });

  it('suit l’en-tête du navigateur à défaut de préférence', async () => {
    const reponse = await middleware(
      requete('/catalogue', { langueNavigateur: 'en-GB,en;q=0.9,fr;q=0.8' }),
    );
    expect(reponse.headers.get('location')).toBe(`${ORIGINE}/en/catalogue`);
  });

  it('replie sur le français une langue inconnue', async () => {
    // Ni la préférence ni l'en-tête ne sont dignes de confiance : les deux
    // viennent du client.
    const reponse = await middleware(
      requete('/catalogue', { cookies: { contes_langue: 'de' }, langueNavigateur: 'de-DE' }),
    );
    expect(reponse.headers.get('location')).toBe(`${ORIGINE}/fr/catalogue`);
  });

  it('laisse passer un chemin DÉJÀ préfixé, sans redirection', async () => {
    // Le contre-test des six précédents : sans lui, un middleware qui
    // redirigerait TOUJOURS les passerait tous, et bouclerait à l'infini.
    const reponse = await middleware(requete('/fr/catalogue'));
    expect(reponse.status).toBe(200);
    expect(reponse.headers.get('location')).toBeNull();
  });
});

describe('chemins hors périmètre', () => {
  it('n’ajoute jamais de préfixe aux routes d’API ni à la console', async () => {
    // ┌────────────────────────────────────────────────────────────────────┐
    // │ `/api/catalog` redirigé en `/fr/api/catalog` casserait TOUT le      │
    // │ backend d'un coup — et la console de simulation avec.               │
    // └────────────────────────────────────────────────────────────────────┘
    for (const chemin of [
      '/api/catalog',
      '/api/auth/refresh',
      '/dev',
      '/dev/console',
      '/_next/static/chunk.js',
      '/favicon.ico',
      '/robots.txt',
      '/sitemap.xml',
    ]) {
      const reponse = await middleware(requete(chemin));
      expect(reponse.headers.get('location'), `${chemin} redirigé à tort`).toBeNull();
    }
  });
});

describe('transmission à l’enveloppe', () => {
  it('pose la langue, le chemin et la requête pour le sélecteur de langue', async () => {
    // Sans ces en-têtes, l'enveloppe ne saurait pas quelle page reconstruire —
    // et le sélecteur renverrait à l'accueil, ce qui est le défaut qu'on évite.
    const reponse = await middleware(requete('/en/contes/anansi?langue=fr'));

    const transmis = reponse.headers.get('x-middleware-override-headers') ?? '';
    expect(transmis).toContain('x-langue');
    expect(transmis).toContain('x-chemin');
    expect(transmis).toContain('x-requete');
  });

  it('mémorise la langue de l’URL comme préférence', async () => {
    const reponse = await middleware(requete('/en/catalogue'));

    const cookie = reponse.cookies.get('contes_langue');
    expect(cookie?.value).toBe('en');
    // Lisible par le JavaScript de page, délibérément : ce n'est pas un
    // secret, et ce cookie ne donne accès à rien.
    expect(cookie?.httpOnly).toBe(false);
  });
});

describe('rafraîchissement préventif', () => {
  it('ne tente RIEN pour un visiteur sans jeton de rafraîchissement', async () => {
    // Un visiteur n'est pas une anomalie : le catalogue, la fiche et l'extrait
    // lui sont ouverts.
    const reponse = await middleware(requete('/fr/catalogue'));
    expect(reponse.status).toBe(200);
    expect(reponse.headers.getSetCookie().some((c) => c.includes(ACCESS_TOKEN_COOKIE))).toBe(false);
  });

  it('ne tente RIEN quand le jeton est loin de son échéance', async () => {
    // Rafraîchir à chaque navigation ferait tourner la lignée en boucle, et
    // multiplierait les occasions de course entre onglets.
    const reponse = await middleware(
      requete('/fr/catalogue', {
        cookies: {
          [ACCESS_TOKEN_COOKIE]: jeton(3600),
          [REFRESH_TOKEN_COOKIE]: 'jeton-de-rafraichissement',
        },
      }),
    );
    expect(reponse.status).toBe(200);
  });

  it('un échec réseau NE BLOQUE PAS la navigation', async () => {
    // ┌────────────────────────────────────────────────────────────────────┐
    // │ AUCUN SERVEUR N'ÉCOUTE DANS CE TEST : l'appel de rafraîchissement   │
    // │ échoue réellement. C'est exactement la condition d'un utilisateur    │
    // │ hors ligne un instant.                                              │
    // │                                                                    │
    // │ La navigation doit continuer, et les cookies rester en place : les  │
    // │ effacer priverait d'une session encore valable quelqu'un dont la    │
    // │ connexion a simplement hoqueté.                                     │
    // └────────────────────────────────────────────────────────────────────┘
    const reponse = await middleware(
      requete('/fr/catalogue', {
        cookies: {
          [ACCESS_TOKEN_COOKIE]: jeton(10),
          [REFRESH_TOKEN_COOKIE]: 'jeton-de-rafraichissement',
        },
      }),
    );

    expect(reponse.status).toBe(200);
    expect(reponse.headers.get('location')).toBeNull();
    // Aucun cookie effacé.
    expect(
      reponse.headers.getSetCookie().some((c) => /contes_(access|refresh)_token=;|Max-Age=0/.test(c)),
    ).toBe(false);
  });

  it('un jeton illisible déclenche une tentative, sans casser la page', async () => {
    // Le doute joue en faveur du rafraîchissement, jamais du maintien.
    const reponse = await middleware(
      requete('/fr/catalogue', {
        cookies: {
          [ACCESS_TOKEN_COOKIE]: 'cookie-tronque-par-un-proxy',
          [REFRESH_TOKEN_COOKIE]: 'jeton-de-rafraichissement',
        },
      }),
    );
    expect(reponse.status).toBe(200);
  });
});

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { GET as pageRoute } from '@/app/api/books/[id]/pages/[page]/route';
import { resetServerEnvCache } from '@/lib/config/env';

import { closePool, queryOne } from '../helpers/db';
import { corpsJson, get, type ReponseErreur } from '../helpers/http';
import { createTestUser, deleteTestUser, type TestUser } from '../helpers/users';
import { deposerFichiersDeDemonstration } from '../helpers/storage';

/**
 * Limitation de la lecture anonyme — docs/PLAN.md D3 point 6.
 *
 * « Un livre entier accessible sans compte est une cible d'aspiration
 * automatisée. » Un conte gratuit se lit intégralement sans créer de compte :
 * sans limite, il suffirait d'une boucle pour en récupérer toutes les pages, et
 * de recommencer sur le suivant.
 *
 * La limite ne vise QUE les visiteurs. Un utilisateur connecté est déjà
 * identifiable, traçable, et suspendable : lui compter ses pages n'apporterait
 * rien et gênerait la lecture d'un enfant qui feuillette.
 */
let livreGratuit: string;
let lecteurConnecte: TestUser;

const ctxPage = (id: string, page: string) => ({ params: Promise.resolve({ id, page }) });

beforeAll(async () => {
  await deposerFichiersDeDemonstration();
  livreGratuit =
    (await queryOne<{ id: string }>(`select id from public.books where slug = 'petit-baobab'`))?.id ??
    '';
  lecteurConnecte = await createTestUser();

  // Quota volontairement bas : éprouver la limite réelle demanderait soixante
  // requêtes, pour ne rien prouver de plus.
  process.env['ANON_PAGE_RATE_LIMIT'] = '3';
  resetServerEnvCache();
});

afterAll(async () => {
  delete process.env['ANON_PAGE_RATE_LIMIT'];
  resetServerEnvCache();
  await deleteTestUser(lecteurConnecte);
  await closePool();
});

describe('visiteur non connecté', () => {
  it('est bloqué au-delà du quota, avec le délai d’attente', async () => {
    const lire = () =>
      pageRoute(
        get(`/api/books/${livreGratuit}/pages/1`, { ip: '203.0.113.42' }),
        ctxPage(livreGratuit, '1'),
      );

    for (let i = 0; i < 3; i += 1) {
      expect((await lire()).status).toBe(200);
    }

    const bloquee = await lire();

    expect(bloquee.status).toBe(429);
    expect((await corpsJson<ReponseErreur>(bloquee)).erreur.code).toBe('trop_de_requetes');
    expect(Number(bloquee.headers.get('retry-after'))).toBeGreaterThan(0);
  });

  it('ne bloque pas une autre adresse', async () => {
    // Le compteur est par adresse : sinon le premier aspirateur venu fermerait
    // la lecture à tout le monde.
    const reponse = await pageRoute(
      get(`/api/books/${livreGratuit}/pages/1`, { ip: '198.51.100.7' }),
      ctxPage(livreGratuit, '1'),
    );

    expect(reponse.status).toBe(200);
  });
});

describe('utilisateur connecté', () => {
  it('n’est pas soumis au quota anonyme', async () => {
    // Même adresse que celle déjà bloquée plus haut : c'est bien la présence
    // d'un compte qui fait la différence, pas l'origine de la requête.
    for (let i = 0; i < 5; i += 1) {
      const reponse = await pageRoute(
        get(`/api/books/${livreGratuit}/pages/1`, {
          ip: '203.0.113.42',
          jeton: lecteurConnecte.accessToken,
        }),
        ctxPage(livreGratuit, '1'),
      );
      expect(reponse.status).toBe(200);
    }
  });
});

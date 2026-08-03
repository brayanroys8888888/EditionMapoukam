import { afterAll, describe, expect, it } from 'vitest';

import { POST as connecter } from '@/app/api/auth/login/route';
import { POST as rafraichirRoute } from '@/app/api/auth/refresh/route';
import { GET as profil } from '@/app/api/auth/me/route';
import { GET as lirePanier, POST as ajouterAuPanier } from '@/app/api/cart/route';
import { loginRateLimiter } from '@/lib/http/rate-limit';

import { closePool, query } from '../helpers/db';
import { corpsJson, get, postJson } from '../helpers/http';
import { createTestUser, deleteTestUser, type TestUser } from '../helpers/users';

/**
 * EXPIRATION RÉELLE — l'hypothèse sur laquelle repose toute la reprise.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ CE QUE CE FICHIER AJOUTE À tests/e2e/session-longue.test.ts.            │
 * │                                                                          │
 * │ Celui-là éprouve la REPRISE, en rendant un jeton inacceptable sans       │
 * │ attendre. Celui-ci éprouve que le jeton EXPIRE VRAIMENT, et qu'une       │
 * │ session dépasse cette expiration sans que l'utilisateur s'en aperçoive.  │
 * │                                                                          │
 * │ Les deux sont nécessaires : si `jwt_expiry` cessait un jour d'être       │
 * │ appliqué, le premier passerait encore — et la plateforme servirait des   │
 * │ jetons éternels sans que rien ne le signale.                             │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Exige la pile reconfigurée par `npm run test:session-longue`. Lancé seul, il
 * ÉCHOUE explicitement plutôt que de se sauter — §5 sexies : jamais
 * conditionner un test à l'état de la machine.
 */
const DUREE = Number(process.env['EXPIRATION_JETON_SECONDES'] ?? '0');

const comptes: TestUser[] = [];

afterAll(async () => {
  for (const compte of comptes) await deleteTestUser(compte);
  await closePool();
});

async function attendre(secondes: number): Promise<void> {
  await new Promise((resoudre) => setTimeout(resoudre, secondes * 1000));
}

describe('la pile est bien reconfigurée', () => {
  it('l’épreuve a reçu une durée de vie de jeton courte', () => {
    // ┌────────────────────────────────────────────────────────────────────┐
    // │ ÉCHEC EXPLICITE, JAMAIS SAUT.                                      │
    // │                                                                    │
    // │ C'est la leçon d'epubcheck : un test conditionné à l'état de la     │
    // │ machine déplace la question « cette règle est-elle vérifiée ? » de   │
    // │ l'auteur vers l'environnement — que personne ne consulte quand la    │
    // │ suite est verte.                                                    │
    // └────────────────────────────────────────────────────────────────────┘
    expect(
      DUREE,
      'EXPIRATION_JETON_SECONDES absente : lancez `npm run test:session-longue`, jamais ce fichier seul.',
    ).toBeGreaterThan(0);
    expect(DUREE).toBeLessThanOrEqual(120);
  });

  it('la configuration porte bien la durée annoncée', async () => {
    const { readFileSync } = await import('node:fs');
    const config = readFileSync('supabase/config.toml', 'utf8');
    const trouve = /^jwt_expiry\s*=\s*(\d+)/m.exec(config);
    expect(Number(trouve?.[1])).toBe(DUREE);
  });
});

describe('un jeton d’accès expire pour de bon', () => {
  it('cesse d’être accepté passé sa durée de vie', async () => {
    const compte = await createTestUser();
    comptes.push(compte);
    loginRateLimiter.vider();

    const session = await corpsJson<{ access_token: string; refresh_token: string }>(
      await connecter(postJson('/api/auth/login', { email: compte.email, password: compte.password })),
    );

    // Il fonctionne d'abord — sans quoi l'expiration ne prouverait rien.
    expect((await profil(get('/api/auth/me', { jeton: session.access_token }))).status).toBe(200);

    await attendre(DUREE + 5);

    // C'EST L'ASSERTION QUE SEUL CE FICHIER PEUT PORTER : le jeton est mort
    // de sa belle mort, sans que personne ne l'ait révoqué.
    expect((await profil(get('/api/auth/me', { jeton: session.access_token }))).status).toBe(401);
  });

  it('la session traverse l’expiration : panier conservé, parcours poursuivi', async () => {
    const compte = await createTestUser();
    comptes.push(compte);
    loginRateLimiter.vider();

    const session = await corpsJson<{ access_token: string; refresh_token: string }>(
      await connecter(postJson('/api/auth/login', { email: compte.email, password: compte.password })),
    );

    const livre = await query<{ id: string }>(
      `select id from public.books
        where statut = 'publie' and disponible_achat = true order by slug limit 1`,
    );
    const livreId = livre[0]?.id ?? '';
    expect(livreId, 'aucun conte achetable publié').not.toBe('');

    await ajouterAuPanier(
      postJson('/api/cart', { book_id: livreId, langue: 'fr' }, { jeton: session.access_token }),
    );

    await attendre(DUREE + 5);

    // L'ancien jeton est mort…
    expect((await lirePanier(get('/api/cart', { jeton: session.access_token }))).status).toBe(401);

    // …et le rafraîchissement le remplace, sans reconnexion.
    const rafraichie = await rafraichirRoute(
      postJson('/api/auth/refresh', { refresh_token: session.refresh_token }),
    );
    expect(rafraichie.status).toBe(200);
    const neuve = await corpsJson<{ access_token: string }>(rafraichie);

    const panier = await lirePanier(get('/api/cart', { jeton: neuve.access_token }));
    expect(panier.status).toBe(200);

    // Le panier n'a rien perdu pendant l'expiration.
    const contenu = await corpsJson<{ lignes: { livre_id: string }[] }>(panier);
    expect(contenu.lignes.map((l) => l.livre_id)).toContain(livreId);
  });
});

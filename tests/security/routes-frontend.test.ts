import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { GET as bibliotheque } from '@/app/api/library/route';
import { GET as lireFavoris, POST as ajouterFavori } from '@/app/api/favorites/route';
import { DELETE as retirerFavori } from '@/app/api/favorites/[bookId]/route';
import { GET as facture } from '@/app/api/orders/[id]/invoice/route';
import { GET as offres } from '@/app/api/offers/route';
import { GET as facettes } from '@/app/api/catalog/facets/route';
import { GET as instant } from '@/app/api/time/route';

import { closePool, query } from '../helpers/db';
import { corpsJson, get, postJson, type ReponseErreur } from '../helpers/http';
import { createTestUser, deleteTestUser, type TestUser } from '../helpers/users';

/**
 * ISOLATION DES ROUTES LIVRÉES À L'ÉTAPE F0.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ CHAQUE ROUTE NOUVELLE EST UNE SURFACE D'ATTAQUE DE PLUS, ET CELLES-CI    │
 * │ TOUCHENT AUX DONNÉES LES PLUS SENSIBLES : bibliothèque, favoris,         │
 * │ factures.                                                                │
 * │                                                                          │
 * │ Ce fichier vérifie pour CHACUNE qu'un utilisateur ne peut pas lire les    │
 * │ données d'un autre — et il le vérifie dans les DEUX SENS : A ne voit pas  │
 * │ B, ET A voit bien les siennes. Sans le second, une route cassée qui ne    │
 * │ rendrait jamais rien passerait tous les tests d'isolation.                │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
let alice: TestUser;
let bob: TestUser;
let livreAlice: string;
let livreBob: string;
let commandeAlice: string;

beforeAll(async () => {
  alice = await createTestUser();
  bob = await createTestUser();

  const livres = await query<{ id: string }>(
    `select id from public.books where statut = 'publie' order by slug limit 2`,
  );
  livreAlice = livres[0]?.id ?? '';
  livreBob = livres[1]?.id ?? '';

  // Garde d'effectif : sans deux titres publiés, tout ce fichier passerait
  // sans rien éprouver.
  expect(livreAlice, 'jeu de démonstration insuffisant').not.toBe('');
  expect(livreBob).not.toBe('');
  expect(livreAlice).not.toBe(livreBob);

  // Alice a une commande payée, sa facture, et le droit qui en découle.
  // La COMMANDE d'abord : `entitlements.source_id` la référence, et c'est ce
  // qui rend l'octroi traçable et idempotent (§2.3).
  const commande = await query<{ id: string }>(
    `insert into public.orders (user_id, montant_total, devise, zone, statut, paye_le)
     values ($1, 499, 'EUR', 'international', 'paye', public.app_now())
     returning id`,
    [alice.id],
  );
  commandeAlice = commande[0]?.id ?? '';

  await query(
    `insert into public.entitlements (user_id, book_id, type, peut_telecharger, source_id)
     values ($1, $2, 'achat', true, $3)`,
    [alice.id, livreAlice, commandeAlice],
  );

  await query(
    `insert into public.invoices
       (order_id, user_id, numero, montant_ht, montant_tva, montant_ttc, taux_tva, devise, zone,
        facture_nom, facture_email, facture_adresse, lignes, conservation_jusqu_au)
     values ($1, $2, $3, 499, 0, 499, 0, 'EUR', 'international',
             'Alice Dupont', $4,
             '{"pays": "FR"}'::jsonb,
             '[{"libelle": "Un conte", "montant": 499}]'::jsonb,
             public.app_now() + interval '10 years')`,
    [commandeAlice, alice.id, `TEST-${commandeAlice.slice(0, 8)}`, alice.email],
  );

  // Bob a mis un AUTRE titre en favori, et lu un titre.
  await query(`insert into public.favorites (user_id, book_id) values ($1, $2)`, [bob.id, livreBob]);
  await query(
    `insert into public.reading_progress (user_id, book_id, derniere_page, langue)
     values ($1, $2, 4, 'fr')`,
    [bob.id, livreBob],
  );
}, 120_000);

afterAll(async () => {
  await query(`delete from public.invoices where order_id = $1`, [commandeAlice]);
  await query(`delete from public.orders where id = $1`, [commandeAlice]);
  await deleteTestUser(alice);
  await deleteTestUser(bob);
  await closePool();
});

describe('bibliothèque', () => {
  it('rend à Alice ce qu’elle possède', async () => {
    const reponse = await bibliotheque(get('/api/library', { jeton: alice.accessToken }));
    expect(reponse.status).toBe(200);

    const corps = await corpsJson<{ achats: { livre_id: string }[] }>(reponse);
    expect(corps.achats.map((a) => a.livre_id)).toContain(livreAlice);
  });

  it('ne rend JAMAIS à Bob ce qu’Alice possède', async () => {
    const reponse = await bibliotheque(get('/api/library', { jeton: bob.accessToken }));
    expect(reponse.status).toBe(200);

    const corps = await corpsJson<{
      achats: { livre_id: string }[];
      en_cours: { livre_id: string }[];
    }>(reponse);

    expect(corps.achats.map((a) => a.livre_id)).not.toContain(livreAlice);
    expect(corps.en_cours.map((e) => e.livre_id)).not.toContain(livreAlice);
  });

  it('sépare « possédé » et « en cours » — la progression survit à l’accès', async () => {
    // Bob a LU `livreBob` sans le posséder. Il doit apparaître en cours de
    // lecture, et pas dans ses achats : c'est la règle de l'étape 12, et la
    // fondre en une seule liste ferait disparaître ce cas.
    const corps = await corpsJson<{
      achats: { livre_id: string }[];
      en_cours: { livre_id: string; reprise: { page: number } | null }[];
    }>(await bibliotheque(get('/api/library', { jeton: bob.accessToken })));

    expect(corps.en_cours.map((e) => e.livre_id)).toContain(livreBob);
    expect(corps.achats.map((a) => a.livre_id)).not.toContain(livreBob);
    expect(corps.en_cours.find((e) => e.livre_id === livreBob)?.reprise?.page).toBe(4);
  });

  it('refuse un visiteur', async () => {
    expect((await bibliotheque(get('/api/library'))).status).toBe(401);
  });
});

describe('favoris', () => {
  it('Alice ajoute, lit et retire les siens', async () => {
    const ajout = await ajouterFavori(
      postJson('/api/favorites', { book_id: livreAlice }, { jeton: alice.accessToken }),
    );
    expect(ajout.status).toBe(201);

    const liste = await corpsJson<{ favoris: { livre_id: string }[] }>(
      await lireFavoris(get('/api/favorites', { jeton: alice.accessToken })),
    );
    expect(liste.favoris.map((f) => f.livre_id)).toContain(livreAlice);

    const retrait = await retirerFavori(get(`/api/favorites/${livreAlice}`, { jeton: alice.accessToken }), {
      params: Promise.resolve({ bookId: livreAlice }),
    });
    expect(retrait.status).toBe(204);
  });

  it('ne rend JAMAIS à Alice les favoris de Bob', async () => {
    const liste = await corpsJson<{ favoris: { livre_id: string }[] }>(
      await lireFavoris(get('/api/favorites', { jeton: alice.accessToken })),
    );
    expect(liste.favoris.map((f) => f.livre_id)).not.toContain(livreBob);

    // Contre-test : Bob, lui, le voit bien. Sans cela, une route qui rendrait
    // toujours une liste vide passerait l'assertion ci-dessus.
    const chezBob = await corpsJson<{ favoris: { livre_id: string }[] }>(
      await lireFavoris(get('/api/favorites', { jeton: bob.accessToken })),
    );
    expect(chezBob.favoris.map((f) => f.livre_id)).toContain(livreBob);
  });

  it('Alice ne peut pas retirer le favori de Bob', async () => {
    await retirerFavori(get(`/api/favorites/${livreBob}`, { jeton: alice.accessToken }), {
      params: Promise.resolve({ bookId: livreBob }),
    });

    // La réponse est 204 — retirer ce qu'on n'a pas est sans objet — mais la
    // ligne de Bob DOIT être intacte. C'est la politique RLS qui le garantit,
    // pas le code de la route.
    const chezBob = await corpsJson<{ favoris: { livre_id: string }[] }>(
      await lireFavoris(get('/api/favorites', { jeton: bob.accessToken })),
    );
    expect(chezBob.favoris.map((f) => f.livre_id)).toContain(livreBob);
  });

  it('refuse un livre inexistant avec 404, pas 500', async () => {
    const reponse = await ajouterFavori(
      postJson(
        '/api/favorites',
        { book_id: '00000000-0000-0000-0000-000000000000' },
        { jeton: alice.accessToken },
      ),
    );
    expect(reponse.status).toBe(404);
  });

  it('refuse un visiteur', async () => {
    expect((await lireFavoris(get('/api/favorites'))).status).toBe(401);
  });
});

describe('facture', () => {
  it('rend à Alice SA facture, avec son identité de facturation', async () => {
    const reponse = await facture(get(`/api/orders/${commandeAlice}/invoice`, { jeton: alice.accessToken }), {
      params: Promise.resolve({ id: commandeAlice }),
    });
    expect(reponse.status).toBe(200);

    const corps = await corpsJson<{ numero: string; facturation: { nom: string; email: string } }>(
      reponse,
    );
    // C'est bien une identité qui est rendue — c'est l'objet de la route, et
    // c'est pourquoi le test suivant compte double.
    expect(corps.facturation.nom).toBe('Alice Dupont');
    expect(corps.facturation.email).toBe(alice.email);
    expect(corps.numero.length).toBeGreaterThan(0);
  });

  it('ne rend JAMAIS à Bob la facture d’Alice — et répond 404, pas 403', async () => {
    // ┌────────────────────────────────────────────────────────────────────┐
    // │ 403 CONFIRMERAIT L'EXISTENCE DE LA COMMANDE.                       │
    // │                                                                    │
    // │ En sondant des identifiants, on apprendrait combien la boutique a  │
    // │ vendu et à quel rythme. Un identifiant inconnu et la commande d'un │
    // │ autre se répondent donc exactement pareil.                          │
    // └────────────────────────────────────────────────────────────────────┘
    const reponse = await facture(get(`/api/orders/${commandeAlice}/invoice`, { jeton: bob.accessToken }), {
      params: Promise.resolve({ id: commandeAlice }),
    });

    expect(reponse.status).toBe(404);
    expect((await corpsJson<ReponseErreur>(reponse)).erreur.code).toBe('introuvable');
  });

  it('répond pareil pour une commande inconnue', async () => {
    const inconnue = '11111111-1111-1111-1111-111111111111';
    const reponse = await facture(get(`/api/orders/${inconnue}/invoice`, { jeton: bob.accessToken }), {
      params: Promise.resolve({ id: inconnue }),
    });
    expect(reponse.status).toBe(404);
  });

  it('ne se met jamais en cache partagé', async () => {
    const reponse = await facture(get(`/api/orders/${commandeAlice}/invoice`, { jeton: alice.accessToken }), {
      params: Promise.resolve({ id: commandeAlice }),
    });
    expect(reponse.headers.get('cache-control')).toBe('private, no-store');
  });

  it('refuse un visiteur', async () => {
    const reponse = await facture(get(`/api/orders/${commandeAlice}/invoice`), {
      params: Promise.resolve({ id: commandeAlice }),
    });
    expect(reponse.status).toBe(401);
  });
});

describe('routes publiques', () => {
  it('les offres n’écrivent aucun prix en dur — tout vient de la configuration', async () => {
    const reponse = await offres(get('/api/offers?zone=international'));
    expect(reponse.status).toBe(200);

    const corps = await corpsJson<{
      abonnement: { ouvert: boolean; jours_essai: number; offres: { code: string; montant: number }[]; donne_telechargement: boolean };
      achat_unite: { a_partir_de: number; donne_telechargement: boolean };
    }>(reponse);

    expect(corps.abonnement.offres.map((o) => o.code).sort()).toEqual(['annuel', 'mensuel']);
    expect(corps.abonnement.offres.every((o) => o.montant > 0)).toBe(true);

    // LA règle métier centrale, rendue explicitement pour qu'aucune interface
    // ne suppose le contraire.
    expect(corps.abonnement.donne_telechargement).toBe(false);
    expect(corps.achat_unite.donne_telechargement).toBe(true);
  });

  it('les offres suivent la zone d’affichage', async () => {
    const afrique = await corpsJson<{ devise: string }>(await offres(get('/api/offers?zone=afrique')));
    const international = await corpsJson<{ devise: string }>(
      await offres(get('/api/offers?zone=international')),
    );

    expect(afrique.devise).toBe('XAF');
    expect(international.devise).toBe('EUR');
  });

  it('l’abonnement est FERMÉ par défaut — §3.3', async () => {
    // Le seuil de 30 à 40 titres est une décision commerciale que le code ne
    // connaît pas. Ce qu'il connaît, c'est que l'interrupteur part fermé.
    const corps = await corpsJson<{ abonnement: { ouvert: boolean } }>(
      await offres(get('/api/offers')),
    );
    expect(corps.abonnement.ouvert).toBe(false);
  });

  it('les facettes ne décrivent que le catalogue PUBLIÉ', async () => {
    const reponse = await facettes(get('/api/catalog/facets?langue=fr'));
    expect(reponse.status).toBe(200);

    const corps = await corpsJson<{
      regions: { valeur: string; nombre: number }[];
      themes: { valeur: string }[];
      total: number;
    }>(reponse);

    expect(corps.total).toBeGreaterThan(0);
    expect(corps.regions.length).toBeGreaterThan(0);
    expect(corps.themes.length).toBeGreaterThan(0);

    // Les régions sont les clés fermées, jamais des libellés d'affichage.
    const connues = ['afrique_ouest', 'sahel', 'afrique_centrale', 'afrique_australe', 'afrique_est'];
    for (const region of corps.regions) {
      expect(connues, `région inconnue : ${region.valeur}`).toContain(region.valeur);
    }

    // Le total des facettes régionales ne dépasse pas le catalogue publié.
    const somme = corps.regions.reduce((acc, r) => acc + r.nombre, 0);
    expect(somme).toBeLessThanOrEqual(corps.total);
  });

  it('l’instant vient de l’horloge MÉTIER, jamais du navigateur', async () => {
    const reponse = instant();
    expect(reponse.status).toBe(200);
    expect(reponse.headers.get('cache-control')).toBe('no-store');

    const corps = await corpsJson<{ maintenant: string }>(reponse);
    expect(Date.parse(corps.maintenant)).toBeGreaterThan(0);
  });
});

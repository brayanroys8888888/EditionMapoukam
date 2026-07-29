import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { GET as lirePanier, POST as ajouter, DELETE as vider } from '@/app/api/cart/route';
import { DELETE as retirer } from '@/app/api/cart/items/[bookId]/route';
import {
  GET as listerCommandes,
  POST as commander,
  PUT as apercuCommande,
} from '@/app/api/orders/route';
import { GET as detailCommande } from '@/app/api/orders/[id]/route';

import { closePool, query, queryOne } from '../helpers/db';
import { corpsJson, get, postJson, type ReponseErreur } from '../helpers/http';
import { createTestUser, deleteTestUser, type TestUser } from '../helpers/users';

/**
 * Panier et commandes — §4.2 F9, docs/PLAN.md D4.
 *
 * Les deux règles qui portent tout le reste :
 *   * le prix est TOUJOURS relu en base, jamais accepté du client ;
 *   * une commande n'est JAMAIS passée en `paye` ici — c'est le webhook signé
 *     de l'étape 9 qui en décide (CLAUDE.md règle 5).
 */
let acheteur: TestUser;
let autre: TestUser;

/** Identifiants des titres du jeu de démonstration, résolus une fois. */
const livres: Record<string, string> = {};

async function idDuLivre(slug: string): Promise<string> {
  const cache = livres[slug];
  if (cache) return cache;

  const ligne = await queryOne<{ id: string }>(`select id from public.books where slug = $1`, [
    slug,
  ]);
  if (!ligne) throw new Error(`Titre absent du jeu de démonstration : ${slug}`);
  livres[slug] = ligne.id;
  return ligne.id;
}

/** Ajoute un titre au panier de l'utilisateur, par son slug. */
async function ajouterAuPanier(
  user: TestUser,
  slug: string,
  langue: 'fr' | 'en' = 'fr',
): Promise<Response> {
  return await ajouter(
    postJson('/api/cart', { book_id: await idDuLivre(slug), langue }, { jeton: user.accessToken }),
  );
}

interface CorpsCommande {
  commande_id: string;
  statut: string;
  total: number;
  sous_total: number;
  remise: number;
  devise: string;
  zone: string;
  zone_divergente: boolean;
  refus_promo: string | null;
  lignes: { livre_id: string; prix_unitaire: number }[];
  refusees: { livre_id: string; raison: string }[];
}

beforeAll(async () => {
  acheteur = await createTestUser();
  autre = await createTestUser();
});

beforeEach(async () => {
  // Chaque test part d'un panier vide : sans cela, l'ordre d'exécution
  // changerait les totaux et les échecs deviendraient illisibles.
  await vider(new Request('http://localhost:3000/api/cart', { method: 'DELETE', headers: { authorization: `Bearer ${acheteur.accessToken}` } }));
});

afterAll(async () => {
  await deleteTestUser(acheteur);
  await deleteTestUser(autre);
  await closePool();
});

describe('panier', () => {
  it('exige un compte connecté', async () => {
    const reponse = await lirePanier(get('/api/cart'));

    expect(reponse.status).toBe(401);
  });

  it('accepte un titre vendu à l’unité', async () => {
    const reponse = await ajouterAuPanier(acheteur, 'la-tortue-et-le-lapin');

    expect(reponse.status).toBe(200);
  });

  it('refuse un titre non vendu à l’unité', async () => {
    // `petit-baobab` est gratuit en lecture mais pas vendu. `gratuit` et
    // `disponible_achat` sont indépendants (§3.2).
    const reponse = await ajouterAuPanier(acheteur, 'petit-baobab');

    expect(reponse.status).toBe(409);
    expect((await corpsJson<ReponseErreur>(reponse)).erreur.code).toBe('non_disponible_achat');
  });

  it('refuse un brouillon comme un identifiant inconnu', async () => {
    // Répondre différemment rendrait le catalogue à venir devinable.
    const reponse = await ajouterAuPanier(acheteur, 'le-lievre-et-la-tortue');

    expect(reponse.status).toBe(404);
  });

  it('n’ajoute pas deux fois le même titre', async () => {
    // Le panier n'a pas de quantité : un achat est perpétuel et ne s'achète
    // qu'une fois.
    await ajouterAuPanier(acheteur, 'la-tortue-et-le-lapin');
    await ajouterAuPanier(acheteur, 'la-tortue-et-le-lapin');

    const corps = await corpsJson<{ lignes: unknown[] }>(
      await lirePanier(get('/api/cart', { jeton: acheteur.accessToken })),
    );
    expect(corps.lignes).toHaveLength(1);
  });

  it('retire un titre', async () => {
    await ajouterAuPanier(acheteur, 'la-tortue-et-le-lapin');
    const bookId = await idDuLivre('la-tortue-et-le-lapin');

    const reponse = await retirer(
      new Request(`http://localhost:3000/api/cart/items/${bookId}`, {
        method: 'DELETE',
        headers: { authorization: `Bearer ${acheteur.accessToken}` },
      }),
      { params: Promise.resolve({ bookId }) },
    );

    expect(reponse.status).toBe(200);
  });

  it('ne rend jamais de total, la zone d’encaissement n’étant pas connue', async () => {
    // Annoncer un total depuis la zone d'AFFICHAGE reviendrait à promettre un
    // montant qu'on ne facturera peut-être pas (D4 point 5).
    await ajouterAuPanier(acheteur, 'la-tortue-et-le-lapin');

    const corps = await corpsJson<Record<string, unknown>>(
      await lirePanier(get('/api/cart', { jeton: acheteur.accessToken })),
    );

    expect(corps['total']).toBeUndefined();
  });
});

describe('total et grille tarifaire', () => {
  it('additionne les prix relus en base', async () => {
    await ajouterAuPanier(acheteur, 'la-tortue-et-le-lapin'); // 499 EUR
    await ajouterAuPanier(acheteur, 'anansi-l-araignee-maligne'); // 699 EUR — premium

    const corps = await corpsJson<CorpsCommande>(
      await apercuCommande(
        postJson('/api/orders', { zone_encaissement: 'international' }, { jeton: acheteur.accessToken }),
      ),
    );

    expect(corps.sous_total).toBe(1198);
    expect(corps.devise).toBe('EUR');
  });

  it('sert la zone Afrique en francs CFA', async () => {
    await ajouterAuPanier(acheteur, 'le-lion-et-la-souris');

    const corps = await corpsJson<CorpsCommande>(
      await apercuCommande(
        postJson(
          '/api/orders',
          { zone_affichee: 'afrique', zone_encaissement: 'afrique' },
          { jeton: acheteur.accessToken },
        ),
      ),
    );

    // 1 500 FCFA se stocke `1500` et vaut 1 500 FCFA — jamais 15,00.
    expect(corps.total).toBe(1500);
    expect(corps.devise).toBe('XAF');
  });

  it('bascule TOUTE la commande en international si un titre manque en zone Afrique', async () => {
    // `la-tortue-et-le-lapin` n'a qu'un prix international. Facturer un panier
    // moitié en FCFA moitié en euros est impossible : une commande ne porte
    // qu'une devise.
    await ajouterAuPanier(acheteur, 'le-lion-et-la-souris'); // les deux zones
    await ajouterAuPanier(acheteur, 'la-tortue-et-le-lapin'); // international seul

    const corps = await corpsJson<CorpsCommande>(
      await apercuCommande(
        postJson(
          '/api/orders',
          { zone_affichee: 'afrique', zone_encaissement: 'afrique' },
          { jeton: acheteur.accessToken },
        ),
      ),
    );

    expect(corps.zone).toBe('international');
    expect(corps.devise).toBe('EUR');
    expect(corps.total).toBe(998);
  });

  it('facture le même montant pour un conte en FR et en EN', async () => {
    // D2 point 5 : le prix ne dépend JAMAIS de la langue. Un droit porte sur
    // le livre, toutes langues comprises.
    await ajouterAuPanier(acheteur, 'kouassi-et-le-tam-tam', 'fr');
    const enFrancais = await corpsJson<CorpsCommande>(
      await apercuCommande(postJson('/api/orders', {}, { jeton: acheteur.accessToken })),
    );

    await vider(
      new Request('http://localhost:3000/api/cart', {
        method: 'DELETE',
        headers: { authorization: `Bearer ${acheteur.accessToken}` },
      }),
    );
    await ajouterAuPanier(acheteur, 'kouassi-et-le-tam-tam', 'en');
    const enAnglais = await corpsJson<CorpsCommande>(
      await apercuCommande(postJson('/api/orders', {}, { jeton: acheteur.accessToken })),
    );

    expect(enAnglais.total).toBe(enFrancais.total);
    expect(enAnglais.devise).toBe(enFrancais.devise);
  });
});

describe('prix soumis par le client', () => {
  it('est ignoré : le montant vient toujours de la base', async () => {
    // Le point de vigilance nommé de l'étape. Le schéma Zod n'a pas de champ de
    // prix, mais un champ inconnu ne doit pas non plus être pris en compte par
    // inadvertance.
    await ajouterAuPanier(acheteur, 'la-tortue-et-le-lapin');

    const corps = await corpsJson<CorpsCommande>(
      await commander(
        postJson(
          '/api/orders',
          { prix_unitaire: 1, montant_total: 1, total: 1, lignes: [{ prix_unitaire: 1 }] },
          { jeton: acheteur.accessToken },
        ),
      ),
    );

    expect(corps.total).toBe(499);

    const enBase = await queryOne<{ montant_total: string }>(
      `select montant_total::text from public.orders where id = $1`,
      [corps.commande_id],
    );
    expect(enBase?.montant_total).toBe('499');
  });
});

describe('codes promotionnels', () => {
  it('applique un pourcentage', async () => {
    await ajouterAuPanier(acheteur, 'la-tortue-et-le-lapin'); // 499

    const corps = await corpsJson<CorpsCommande>(
      await apercuCommande(
        postJson('/api/orders', { code_promo: 'BIENVENUE' }, { jeton: acheteur.accessToken }),
      ),
    );

    expect(corps.remise).toBe(100); // 20 % de 499, arrondi
    expect(corps.total).toBe(399);
  });

  it('accepte le code en minuscules', async () => {
    await ajouterAuPanier(acheteur, 'la-tortue-et-le-lapin');

    const corps = await corpsJson<CorpsCommande>(
      await apercuCommande(
        postJson('/api/orders', { code_promo: 'bienvenue' }, { jeton: acheteur.accessToken }),
      ),
    );

    expect(corps.remise).toBe(100);
  });

  it('n’empêche pas de commander avec un code expiré', async () => {
    // Bloquer la commande immobiliserait un panier parfaitement valide.
    await ajouterAuPanier(acheteur, 'la-tortue-et-le-lapin');

    const corps = await corpsJson<CorpsCommande>(
      await apercuCommande(
        postJson('/api/orders', { code_promo: 'EXPIRE' }, { jeton: acheteur.accessToken }),
      ),
    );

    expect(corps.refus_promo).toBe('expire');
    expect(corps.total).toBe(499);
    expect(corps.remise).toBe(0);
  });

  it('refuse un code en euros sur un panier en francs CFA', async () => {
    // L'appliquer reviendrait à convertir sans taux de change.
    await ajouterAuPanier(acheteur, 'le-lion-et-la-souris');

    const corps = await corpsJson<CorpsCommande>(
      await apercuCommande(
        postJson(
          '/api/orders',
          { zone_affichee: 'afrique', zone_encaissement: 'afrique', code_promo: 'CONTE2EUR' },
          { jeton: acheteur.accessToken },
        ),
      ),
    );

    expect(corps.refus_promo).toBe('devise_incompatible');
    expect(corps.total).toBe(1500);
  });

  it('ne rattache PAS un code refusé à la commande', async () => {
    // Sinon le gestionnaire de webhooks croirait devoir le décompter.
    await ajouterAuPanier(acheteur, 'la-tortue-et-le-lapin');

    const corps = await corpsJson<CorpsCommande>(
      await commander(
        postJson('/api/orders', { code_promo: 'EXPIRE' }, { jeton: acheteur.accessToken }),
      ),
    );

    const enBase = await queryOne<{ promo_code_id: string | null }>(
      `select promo_code_id from public.orders where id = $1`,
      [corps.commande_id],
    );
    expect(enBase?.promo_code_id).toBeNull();
  });

  it('ne décompte AUCUN usage à la création — c’est le paiement qui le fera', async () => {
    // Une commande créée ici est `en_attente` et peut être abandonnée.
    // Décompter dès maintenant consommerait le code pour des paniers jamais
    // réglés. L'enregistrement appartient au webhook (étape 9).
    const avant = await queryOne<{ usage_count: number }>(
      `select usage_count from public.promo_codes where code = 'BIENVENUE'`,
    );

    await ajouterAuPanier(acheteur, 'la-tortue-et-le-lapin');
    await commander(
      postJson('/api/orders', { code_promo: 'BIENVENUE' }, { jeton: acheteur.accessToken }),
    );

    const apres = await queryOne<{ usage_count: number }>(
      `select usage_count from public.promo_codes where code = 'BIENVENUE'`,
    );

    expect(apres?.usage_count).toBe(avant?.usage_count);
    const rachats = await query(`select 1 from public.promo_redemptions`);
    expect(rachats).toHaveLength(0);
  });
});

describe('divergence de zone', () => {
  it('exige une confirmation quand l’encaissement diffère de l’affichage', async () => {
    // D4 point 5 : « le total est recalculé et affiché avant confirmation.
    // Aucun montant n'est jamais modifié silencieusement. »
    await ajouterAuPanier(acheteur, 'le-lion-et-la-souris');

    // Compté AVANT : les tests précédents ont déjà passé des commandes pour ce
    // compte. Ce qui doit être prouvé, c'est qu'il ne s'en ajoute aucune.
    const avant = await query(`select 1 from public.orders where user_id = $1`, [acheteur.id]);

    const reponse = await commander(
      postJson(
        '/api/orders',
        { zone_affichee: 'afrique', zone_encaissement: 'international' },
        { jeton: acheteur.accessToken },
      ),
    );

    expect(reponse.status).toBe(409);
    expect((await corpsJson<ReponseErreur>(reponse)).erreur.code).toBe('confirmation_requise');

    // Rien n'a été écrit tant que le montant n'est pas confirmé.
    const apres = await query(`select 1 from public.orders where user_id = $1`, [acheteur.id]);
    expect(apres).toHaveLength(avant.length);

    // Et le panier est intact : l'utilisateur peut confirmer sans tout refaire.
    const panier = await corpsJson<{ lignes: unknown[] }>(
      await lirePanier(get('/api/cart', { jeton: acheteur.accessToken })),
    );
    expect(panier.lignes).toHaveLength(1);
  });

  it('accepte une fois le nouveau montant confirmé', async () => {
    await ajouterAuPanier(acheteur, 'le-lion-et-la-souris');

    const reponse = await commander(
      postJson(
        '/api/orders',
        {
          zone_affichee: 'afrique',
          zone_encaissement: 'international',
          total_confirme: 499,
        },
        { jeton: acheteur.accessToken },
      ),
    );

    expect(reponse.status).toBe(201);
    const corps = await corpsJson<CorpsCommande>(reponse);
    expect(corps.total).toBe(499);
    expect(corps.devise).toBe('EUR');
  });

  it('refuse un montant confirmé qui ne correspond pas', async () => {
    // La confirmation est un accusé de réception, jamais un prix : un montant
    // faux fait échouer la commande, il ne la modifie pas.
    await ajouterAuPanier(acheteur, 'le-lion-et-la-souris');

    const reponse = await commander(
      postJson(
        '/api/orders',
        { zone_affichee: 'afrique', zone_encaissement: 'international', total_confirme: 1 },
        { jeton: acheteur.accessToken },
      ),
    );

    expect(reponse.status).toBe(409);
  });

  it('ne demande rien quand les deux zones concordent', async () => {
    await ajouterAuPanier(acheteur, 'le-lion-et-la-souris');

    const reponse = await commander(
      postJson(
        '/api/orders',
        { zone_affichee: 'international', zone_encaissement: 'international' },
        { jeton: acheteur.accessToken },
      ),
    );

    expect(reponse.status).toBe(201);
  });
});

describe('commande créée', () => {
  it('naît en attente, jamais payée', async () => {
    // CLAUDE.md règle 5 : seul un webhook signé fait passer une commande en
    // `paye`. Aucune route de cette étape ne le fait.
    await ajouterAuPanier(acheteur, 'la-tortue-et-le-lapin');
    const corps = await corpsJson<CorpsCommande>(
      await commander(postJson('/api/orders', {}, { jeton: acheteur.accessToken })),
    );

    expect(corps.statut).toBe('en_attente');

    const enBase = await queryOne<{ statut: string; paye_le: string | null }>(
      `select statut, paye_le from public.orders where id = $1`,
      [corps.commande_id],
    );
    expect(enBase?.statut).toBe('en_attente');
    expect(enBase?.paye_le).toBeNull();
  });

  it('n’octroie AUCUN droit d’accès', async () => {
    // Le droit naît du paiement confirmé, jamais de la commande.
    await ajouterAuPanier(acheteur, 'la-tortue-et-le-lapin');
    await commander(postJson('/api/orders', {}, { jeton: acheteur.accessToken }));

    const droits = await query(`select 1 from public.entitlements where user_id = $1`, [
      acheteur.id,
    ]);
    expect(droits).toHaveLength(0);
  });

  it('vide le panier', async () => {
    await ajouterAuPanier(acheteur, 'la-tortue-et-le-lapin');
    await commander(postJson('/api/orders', {}, { jeton: acheteur.accessToken }));

    const corps = await corpsJson<{ lignes: unknown[] }>(
      await lirePanier(get('/api/cart', { jeton: acheteur.accessToken })),
    );
    expect(corps.lignes).toHaveLength(0);
  });

  it('refuse un panier vide', async () => {
    const reponse = await commander(postJson('/api/orders', {}, { jeton: acheteur.accessToken }));

    expect(reponse.status).toBe(409);
    expect((await corpsJson<ReponseErreur>(reponse)).erreur.code).toBe('panier_vide');
  });

  it('fige le prix : une évolution de la grille ne modifie pas la commande', async () => {
    // D4 point 6, et c'est la garantie qui protège l'acheteur comme le vendeur.
    await ajouterAuPanier(acheteur, 'la-tortue-et-le-lapin');
    const corps = await corpsJson<CorpsCommande>(
      await commander(postJson('/api/orders', {}, { jeton: acheteur.accessToken })),
    );

    const bookId = await idDuLivre('la-tortue-et-le-lapin');
    await query(
      `update public.book_prices set montant = 9999 where book_id = $1 and zone = 'international'`,
      [bookId],
    );

    try {
      const ligne = await queryOne<{ prix_unitaire: string }>(
        `select prix_unitaire::text from public.order_items where order_id = $1`,
        [corps.commande_id],
      );
      expect(ligne?.prix_unitaire).toBe('499');

      const commande = await queryOne<{ montant_total: string }>(
        `select montant_total::text from public.orders where id = $1`,
        [corps.commande_id],
      );
      expect(commande?.montant_total).toBe('499');
    } finally {
      await query(
        `update public.book_prices set montant = 499 where book_id = $1 and zone = 'international'`,
        [bookId],
      );
    }
  });

  it('conserve la langue choisie, à titre informatif', async () => {
    // D2 : la langue ne conditionne JAMAIS un droit. Elle sert à la facture et
    // aux statistiques de vente.
    await ajouterAuPanier(acheteur, 'kouassi-et-le-tam-tam', 'en');
    const corps = await corpsJson<CorpsCommande>(
      await commander(postJson('/api/orders', {}, { jeton: acheteur.accessToken })),
    );

    const ligne = await queryOne<{ langue: string }>(
      `select langue from public.order_items where order_id = $1`,
      [corps.commande_id],
    );
    expect(ligne?.langue).toBe('en');
  });
});

describe('historique', () => {
  it('liste les commandes de l’appelant', async () => {
    await ajouterAuPanier(acheteur, 'la-tortue-et-le-lapin');
    await commander(postJson('/api/orders', {}, { jeton: acheteur.accessToken }));

    const corps = await corpsJson<{ commandes: { id: string }[] }>(
      await listerCommandes(get('/api/orders', { jeton: acheteur.accessToken })),
    );

    expect(corps.commandes.length).toBeGreaterThan(0);
  });

  it('rend le détail d’une commande à son propriétaire', async () => {
    await ajouterAuPanier(acheteur, 'la-tortue-et-le-lapin');
    const creee = await corpsJson<CorpsCommande>(
      await commander(postJson('/api/orders', {}, { jeton: acheteur.accessToken })),
    );

    const reponse = await detailCommande(
      get(`/api/orders/${creee.commande_id}`, { jeton: acheteur.accessToken }),
      { params: Promise.resolve({ id: creee.commande_id }) },
    );

    expect(reponse.status).toBe(200);
  });
});

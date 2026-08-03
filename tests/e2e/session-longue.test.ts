import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { POST as connecter } from '@/app/api/auth/login/route';
import { POST as rafraichirRoute, reinitialiserQuotaRafraichissement } from '@/app/api/auth/refresh/route';
import { GET as catalogue } from '@/app/api/catalog/route';
import { GET as servirPageRoute } from '@/app/api/books/[id]/pages/[page]/route';
import { GET as lireReprise, PUT as enregistrerPage } from '@/app/api/reading/[bookId]/route';
import { GET as lirePanier, POST as ajouterAuPanier } from '@/app/api/cart/route';
import { POST as creerCommande } from '@/app/api/orders/route';
import { POST as ouvrirCheckout } from '@/app/api/checkout/route';
import { loginRateLimiter } from '@/lib/http/rate-limit';

import { closePool, query } from '../helpers/db';
import { corpsJson, get, postJson, type ReponseErreur } from '../helpers/http';
import { createTestUser, deleteTestUser, serviceClient, type TestUser } from '../helpers/users';
import { deposerFichiersDeDemonstration } from '../helpers/storage';

/**
 * LA SESSION SURVIT À LA PERTE DU JETON D'ACCÈS, EN PLEIN PARCOURS.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ CE FICHIER EXISTE PARCE QU'UN ANGLE MORT DE LA STRATÉGIE DE TEST A      │
 * │ LAISSÉ PASSER UN DÉFAUT PENDANT SEIZE ÉTAPES.                           │
 * │                                                                          │
 * │ Le projet a posé que l'horloge métier injectable gouverne les règles     │
 * │ métier, et que ce qu'un système EXTÉRIEUR applique utilise l'heure       │
 * │ réelle — en citant nommément la validité des jetons. La conséquence      │
 * │ n'avait pas été tirée : avancer l'horloge de trente jours n'expire aucun │
 * │ jeton, donc AUCUN test ne pouvait simuler une session longue, donc       │
 * │ l'absence de route de rafraîchissement était invisible.                  │
 * │                                                                          │
 * │ docs/PLAN.md §5 duodecies pose la règle générale qui en découle.         │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ CE QUE CE FICHIER SIMULE, ET CE QU'IL N'INVENTE PAS.                    │
 * │                                                                          │
 * │ Un jeton d'accès cesse d'être accepté pour deux raisons : il a EXPIRÉ,   │
 * │ ou il a été RÉVOQUÉ. Les routes ne les distinguent pas — `requireUser`   │
 * │ soumet le jeton à Supabase Auth et n'obtient qu'un oui ou un non. Le     │
 * │ chemin de reprise est donc rigoureusement le même.                       │
 * │                                                                          │
 * │ Ces tests provoquent le NON, sans attendre une heure et sans dépendre    │
 * │ d'un secret de signature. L'expiration réelle, elle, est éprouvée hors   │
 * │ porte par `npm run test:session-longue`, qui abaisse `jwt_expiry` et     │
 * │ redémarre la pile — voir docs/PLAN.md §5 quater, entrée S6.              │
 * └──────────────────────────────────────────────────────────────────────────┘
 */

interface CorpsSession {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}

let lecteur: TestUser;
let livreId: string;
let livreSlug: string;
let livreAchetableId: string;

/**
 * Rend un jeton d'accès inutilisable, sans toucher à sa lignée de
 * rafraîchissement.
 *
 * La signature d'un JWT porte sur l'en-tête et la charge utile. En altérer un
 * octet suffit à ce que Supabase Auth le refuse — exactement comme un jeton
 * périmé, et par le même chemin de code.
 */
function jetonMort(jeton: string): string {
  const parties = jeton.split('.');
  const signature = parties[2] ?? '';
  const premier = signature.charAt(0);
  return `${parties[0] ?? ''}.${parties[1] ?? ''}.${premier === 'A' ? 'B' : 'A'}${signature.slice(1)}`;
}

/** Le client suit ce que fera l'interface : sur 401, rafraîchir UNE fois. */
async function avecReprise(
  session: CorpsSession,
  appel: (jeton: string) => Promise<Response>,
): Promise<{ reponse: Response; session: CorpsSession; aRafraichi: boolean }> {
  const premiere = await appel(session.access_token);
  if (premiere.status !== 401) {
    return { reponse: premiere, session, aRafraichi: false };
  }

  const rafraichie = await rafraichirRoute(
    postJson('/api/auth/refresh', { refresh_token: session.refresh_token }),
  );
  if (rafraichie.status !== 200) {
    return { reponse: premiere, session, aRafraichi: false };
  }

  const neuve = await corpsJson<CorpsSession>(rafraichie);
  return { reponse: await appel(neuve.access_token), session: neuve, aRafraichi: true };
}

beforeAll(async () => {
  await deposerFichiersDeDemonstration();

  lecteur = await createTestUser();

  const publie = await query<{ id: string; slug: string }>(
    `select b.id, b.slug from public.books b
      where b.statut = 'publie' and b.gratuit = true
      order by b.slug limit 1`,
  );
  livreId = publie[0]?.id ?? '';
  livreSlug = publie[0]?.slug ?? '';

  const achetable = await query<{ id: string }>(
    `select b.id from public.books b
      where b.statut = 'publie' and b.disponible_achat = true
      order by b.slug limit 1`,
  );
  livreAchetableId = achetable[0]?.id ?? '';

  // Garde d'effectif : sans titre, tout ce fichier passerait sans rien lire.
  expect(livreId, 'aucun conte gratuit publié dans le jeu de démonstration').not.toBe('');
  expect(livreAchetableId, 'aucun conte achetable publié').not.toBe('');
}, 360_000);

afterAll(async () => {
  await deleteTestUser(lecteur);
  await closePool();
});

async function ouvrirSession(): Promise<CorpsSession> {
  loginRateLimiter.vider();
  reinitialiserQuotaRafraichissement();
  const reponse = await connecter(
    postJson('/api/auth/login', { email: lecteur.email, password: lecteur.password }),
  );
  expect(reponse.status).toBe(200);
  return await corpsJson<CorpsSession>(reponse);
}

describe('le jeton mort est bien mort — garde du fichier', () => {
  it('un jeton altéré est refusé par les routes gardées', async () => {
    // ┌────────────────────────────────────────────────────────────────────┐
    // │ SANS CE TEST, TOUT LE FICHIER SERAIT UNE VALIDATION VIDE.          │
    // │                                                                    │
    // │ Si `jetonMort` rendait un jeton encore valable, aucun 401 ne se    │
    // │ produirait, aucune reprise ne serait déclenchée, et les parcours   │
    // │ ci-dessous passeraient en ne prouvant strictement rien.            │
    // └────────────────────────────────────────────────────────────────────┘
    const session = await ouvrirSession();

    const vivant = await lireReprise(get(`/api/reading/${livreId}`, { jeton: session.access_token }), {
      params: Promise.resolve({ bookId: livreId }),
    });
    expect(vivant.status).toBe(200);

    const mort = await lireReprise(
      get(`/api/reading/${livreId}`, { jeton: jetonMort(session.access_token) }),
      { params: Promise.resolve({ bookId: livreId }) },
    );
    expect(mort.status).toBe(401);
  });
});

describe('expiration EN PLEINE LECTURE', () => {
  it('la lecture reprend à la même page, sans que l’enfant voie une erreur', async () => {
    const session = await ouvrirSession();

    // L'enfant lit, et sa progression est enregistrée.
    const ecriture = await enregistrerPage(
      postJson(`/api/reading/${livreId}`, { page: 3, langue: 'fr' }, { jeton: session.access_token }),
      { params: Promise.resolve({ bookId: livreId }) },
    );
    expect(ecriture.status).toBe(200);

    // Le jeton d'accès cesse d'être accepté au beau milieu du livre.
    const morte: CorpsSession = { ...session, access_token: jetonMort(session.access_token) };

    // ┌────────────────────────────────────────────────────────────────────┐
    // │ C'EST L'ÉCRITURE DE PROGRESSION QUI RÉVÈLE LA PERTE DE SESSION,    │
    // │ PAS LE SERVICE DES PAGES. Voir le test suivant, qui l'établit.     │
    // └────────────────────────────────────────────────────────────────────┘
    const suite = await avecReprise(morte, async (jeton) =>
      await enregistrerPage(
        postJson(`/api/reading/${livreId}`, { page: 4, langue: 'fr' }, { jeton }),
        { params: Promise.resolve({ bookId: livreId }) },
      ),
    );

    // LA reprise a bien eu lieu — sans elle, l'assertion suivante passerait
    // pour de mauvaises raisons.
    expect(suite.aRafraichi).toBe(true);
    expect(suite.reponse.status).toBe(200);

    // La page suivante se sert avec la session reprise.
    const page = await servirPageRoute(
      get(`/api/books/${livreId}/pages/4?langue=fr`, { jeton: suite.session.access_token }),
      { params: Promise.resolve({ id: livreId, page: '4' }) },
    );
    expect(page.status).toBe(200);

    const corps = await corpsJson<{ url: string; expire_le: string }>(page);
    // Une reprise qui rendrait une URL vide serait une reprise pour rien.
    expect(corps.url).toMatch(/^https?:\/\//);
    expect(Date.parse(corps.expire_le)).toBeGreaterThan(0);

    // ┌────────────────────────────────────────────────────────────────────┐
    // │ LA PROGRESSION N'EST PAS PERDUE — ET ON N'EN EXIGE PAS PLUS.       │
    // │                                                                    │
    // │ L'étape 12 REGROUPE les écritures : `enregistree: false` signale un │
    // │ regroupement, jamais un échec, et le client ne doit surtout pas     │
    // │ réessayer. Exiger ici la page 4 exactement reviendrait à exiger que │
    // │ le regroupement n'ait pas lieu — c'est-à-dire à tester le contraire │
    // │ de ce que le projet a décidé.                                       │
    // │                                                                    │
    // │ Ce que ce parcours doit prouver, et prouve : la perte de session    │
    // │ n'a RIEN effacé.                                                    │
    // └────────────────────────────────────────────────────────────────────┘
    const reprise = await lireReprise(
      get(`/api/reading/${livreId}?langue=fr`, { jeton: suite.session.access_token }),
      { params: Promise.resolve({ bookId: livreId }) },
    );
    expect(reprise.status).toBe(200);
    expect((await corpsJson<{ page: number }>(reprise)).page).toBeGreaterThanOrEqual(3);
  });

  it('le service des pages NE SIGNALE PAS la perte de session — il retombe en visiteur', async () => {
    // ┌────────────────────────────────────────────────────────────────────┐
    // │ CONSTAT ÉTABLI PAR CE TEST, ET IL COMMANDE LA CONCEPTION DU        │
    // │ LECTEUR (étape F6).                                                │
    // │                                                                    │
    // │ `/api/books/[id]/pages/[page]` est PUBLIQUE : elle sert l'extrait   │
    // │ au visiteur. Un jeton mort n'y produit donc jamais de 401 — il y    │
    // │ vaut « visiteur », ce qui est le comportement voulu.                │
    // │                                                                    │
    // │ Conséquence : un lecteur dont la session meurt en page 12 d'un      │
    // │ titre payant ne recevra pas « reconnectez-vous » mais un            │
    // │ `403 hors_extrait` — « achetez ce titre » — alors qu'il l'a déjà    │
    // │ acheté. L'interface doit donc surveiller la session AILLEURS que    │
    // │ sur cette route. C'est exactement le genre de détail qu'on          │
    // │ découvre en production si un test ne l'établit pas ici.             │
    // └────────────────────────────────────────────────────────────────────┘
    const session = await ouvrirSession();
    const mort = jetonMort(session.access_token);

    // Sur un conte GRATUIT, le visiteur lit tout : 200, et aucun signal.
    const gratuite = await servirPageRoute(
      get(`/api/books/${livreId}/pages/1?langue=fr`, { jeton: mort }),
      { params: Promise.resolve({ id: livreId, page: '1' }) },
    );
    expect(gratuite.status).toBe(200);
    expect((await corpsJson<{ motif: string }>(gratuite)).motif).toBe('free');

    // Sur un conte PAYANT, au-delà de l'extrait : 403, jamais 401.
    const payante = await servirPageRoute(
      get(`/api/books/${livreAchetableId}/pages/40?langue=fr`, { jeton: mort }),
      { params: Promise.resolve({ id: livreAchetableId, page: '40' }) },
    );
    expect([403, 404]).toContain(payante.status);
    expect(payante.status).not.toBe(401);
  });
});

describe('expiration ENTRE LE PANIER ET LE PAIEMENT', () => {
  it('le panier survit, la commande se crée, le tunnel s’ouvre', async () => {
    const session = await ouvrirSession();

    // ┌────────────────────────────────────────────────────────────────────┐
    // │ LE MOMENT LE PLUS COÛTEUX D'UNE EXPIRATION.                        │
    // │                                                                    │
    // │ Un panier perdu à l'instant du paiement est une vente perdue, et    │
    // │ l'utilisateur n'a aucun moyen de comprendre ce qui s'est passé.     │
    // └────────────────────────────────────────────────────────────────────┘
    const ajout = await ajouterAuPanier(
      postJson('/api/cart', { book_id: livreAchetableId, langue: 'fr' }, { jeton: session.access_token }),
    );
    expect(ajout.status).toBe(200);

    const morte: CorpsSession = { ...session, access_token: jetonMort(session.access_token) };

    // Le panier se relit après reprise, et il contient toujours le titre.
    const panier = await avecReprise(morte, async (jeton) =>
      await lirePanier(get('/api/cart', { jeton })),
    );
    expect(panier.aRafraichi).toBe(true);
    expect(panier.reponse.status).toBe(200);

    const contenu = await corpsJson<{ lignes: { livre_id: string }[] }>(panier.reponse);
    expect(contenu.lignes.map((l) => l.livre_id)).toContain(livreAchetableId);

    // La commande se crée avec la session reprise.
    const commande = await creerCommande(
      postJson('/api/orders', {}, { jeton: panier.session.access_token }),
    );
    expect(commande.status).toBe(201);
    const creee = await corpsJson<{ commande_id: string; statut: string }>(commande);
    expect(creee.statut).toBe('en_attente');

    // Et le tunnel de paiement s'ouvre. Sans rafraîchissement, tout ce
    // parcours s'arrêtait ici sur un 401 muet.
    const checkout = await ouvrirCheckout(
      postJson('/api/checkout', { commande_id: creee.commande_id }, { jeton: panier.session.access_token }),
    );
    expect(checkout.status).toBe(200);

    const tunnel = await corpsJson<{ url: string; statut_commande: string }>(checkout);
    expect(tunnel.url.length).toBeGreaterThan(0);
    // Rien n'est acquis : le droit naît du webhook signé, jamais d'ici.
    expect(tunnel.statut_commande).toBe('en_attente');

    await query(`delete from public.orders where id = $1`, [creee.commande_id]);
  });

  it('une reprise NE RESSUSCITE PAS une session révoquée', async () => {
    // ┌────────────────────────────────────────────────────────────────────┐
    // │ LE CONTRE-TEST DE TOUT CE FICHIER.                                 │
    // │                                                                    │
    // │ La reprise doit rattraper une expiration, JAMAIS une révocation.   │
    // │ Sans cette assertion, un rafraîchissement trop permissif rendrait   │
    // │ leur accès à des comptes suspendus — et les parcours ci-dessus le   │
    // │ célébreraient comme un succès.                                      │
    // └────────────────────────────────────────────────────────────────────┘
    const session = await ouvrirSession();

    await serviceClient()
      .from('users')
      .update({ statut: 'suspendu' })
      .eq('id', lecteur.id);

    const morte: CorpsSession = { ...session, access_token: jetonMort(session.access_token) };
    const tentative = await avecReprise(morte, async (jeton) =>
      await lirePanier(get('/api/cart', { jeton })),
    );

    expect(tentative.aRafraichi).toBe(false);
    expect(tentative.reponse.status).toBe(401);

    const echec = await rafraichirRoute(
      postJson('/api/auth/refresh', { refresh_token: session.refresh_token }),
    );
    expect(echec.status).toBe(401);
    expect((await corpsJson<ReponseErreur>(echec)).erreur.code).toBe('session_expiree');

    await serviceClient().from('users').update({ statut: 'actif' }).eq('id', lecteur.id);
  });
});

describe('le catalogue public ne demande jamais de reprise', () => {
  it('un jeton mort n’empêche pas de parcourir le catalogue', async () => {
    // Le catalogue est ouvert au visiteur : un jeton invalide y vaut un
    // visiteur, jamais un refus. Une interface qui déclencherait une reprise
    // sur cette route ferait clignoter la connexion sur la page d'accueil.
    const session = await ouvrirSession();
    const reponse = await catalogue(
      get(`/api/catalog?langue=fr&q=${encodeURIComponent(livreSlug.split('-')[0] ?? 'a')}`, {
        jeton: jetonMort(session.access_token),
      }),
    );
    expect(reponse.status).toBe(200);
  });
});

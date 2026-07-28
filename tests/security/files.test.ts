import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { GET as pageRoute } from '@/app/api/books/[id]/pages/[page]/route';
import { GET as fichierRoute } from '@/app/api/books/[id]/file/route';
import { dureeValidite } from '@/lib/storage/signed-url';
import {
  resetServerEnvCache,
  SIGNED_URL_TTL_FREE_MAX_SECONDS,
  SIGNED_URL_TTL_MAX_SECONDS,
} from '@/lib/config/env';

import { closePool, query, queryOne } from '../helpers/db';
import { corpsJson, get, type ReponseErreur } from '../helpers/http';
import { anonClient, createTestUser, deleteTestUser, type TestUser } from '../helpers/users';
import { deposerFichiersDeDemonstration } from '../helpers/storage';

/**
 * SERVICE DE FICHIERS PROTÉGÉ — §6.2, §9.4, §10.
 *
 * « Sans ce mécanisme, un utilisateur pourrait partager une URL de fichier et
 * contourner intégralement le modèle économique » (§6.2).
 *
 * Le test central de cette étape tient en une phrase : un abonné actif qui
 * appelle la route de téléchargement reçoit 403.
 */
let abonne: TestUser;
let acheteur: TestUser;
let visiteurConnecte: TestUser;
let livrePayant: string;
let livreGratuit: string;

const ctxPage = (id: string, page: string) => ({ params: Promise.resolve({ id, page }) });
const ctxFichier = (id: string) => ({ params: Promise.resolve({ id }) });

beforeAll(async () => {
  await deposerFichiersDeDemonstration();

  livrePayant =
    (await queryOne<{ id: string }>(`select id from public.books where slug = 'le-lion-et-la-souris'`))
      ?.id ?? '';
  livreGratuit =
    (await queryOne<{ id: string }>(`select id from public.books where slug = 'petit-baobab'`))?.id ??
    '';

  [abonne, acheteur, visiteurConnecte] = await Promise.all([
    createTestUser(),
    createTestUser(),
    createTestUser(),
  ]);

  await query(
    `insert into public.subscriptions
       (user_id, offre, statut, debut_periode, fin_periode, zone, devise, montant)
     values ($1, 'annuel', 'actif', public.app_now(), public.app_now() + interval '1 year',
             'international', 'EUR', 6900)`,
    [abonne.id],
  );

  const commande = await queryOne<{ id: string }>(
    `insert into public.orders (user_id, montant_total, devise, zone, statut, paye_le)
     values ($1, 499, 'EUR', 'international', 'paye', public.app_now()) returning id`,
    [acheteur.id],
  );
  await query(
    `insert into public.entitlements (user_id, book_id, type, source_id, peut_telecharger)
     values ($1, $2, 'achat', $3, true)`,
    [acheteur.id, livrePayant, commande?.id],
  );
});

afterAll(async () => {
  await deleteTestUser(abonne);
  await deleteTestUser(acheteur);
  await deleteTestUser(visiteurConnecte);
  await closePool();
});

describe('LA règle : l’abonnement ne donne jamais le téléchargement (§3.2)', () => {
  it('refuse le téléchargement à un abonné actif, qui peut pourtant lire le titre', async () => {
    // Le test le plus important de l'étape. Les deux appels portent sur le
    // MÊME titre et le MÊME utilisateur : seule la nature de l'accès change.
    const lecture = await pageRoute(
      get(`/api/books/${livrePayant}/pages/1`, { jeton: abonne.accessToken }),
      ctxPage(livrePayant, '1'),
    );
    expect(lecture.status).toBe(200);

    const telechargement = await fichierRoute(
      get(`/api/books/${livrePayant}/file`, { jeton: abonne.accessToken }),
      ctxFichier(livrePayant),
    );

    expect(telechargement.status).toBe(403);
    const corps = await corpsJson<ReponseErreur>(telechargement);
    expect(corps.erreur.code).toBe('telechargement_non_inclus');
    // Le message explique, sans quoi l'abonné croira à une panne.
    expect(corps.erreur.message).toMatch(/lecture en ligne/i);
  });

  it('accorde lecture ET téléchargement à un acheteur', async () => {
    const lecture = await pageRoute(
      get(`/api/books/${livrePayant}/pages/1`, { jeton: acheteur.accessToken }),
      ctxPage(livrePayant, '1'),
    );
    const telechargement = await fichierRoute(
      get(`/api/books/${livrePayant}/file`, { jeton: acheteur.accessToken }),
      ctxFichier(livrePayant),
    );

    expect(lecture.status).toBe(200);
    expect(telechargement.status).toBe(200);
    expect((await corpsJson<{ motif: string }>(telechargement)).motif).toBe('purchase');
  });

  it('refuse le téléchargement d’un conte GRATUIT à qui ne l’a pas acheté', async () => {
    // La gratuité porte sur la LECTURE. Un fichier téléchargeable offert serait
    // redistribuable sans limite.
    const lecture = await pageRoute(
      get(`/api/books/${livreGratuit}/pages/1`, { jeton: visiteurConnecte.accessToken }),
      ctxPage(livreGratuit, '1'),
    );
    const telechargement = await fichierRoute(
      get(`/api/books/${livreGratuit}/file`, { jeton: visiteurConnecte.accessToken }),
      ctxFichier(livreGratuit),
    );

    expect(lecture.status).toBe(200);
    expect(telechargement.status).toBe(403);
  });
});

describe('lecture', () => {
  it('sert une page à un visiteur non connecté, au titre de l’extrait', async () => {
    const reponse = await pageRoute(
      get(`/api/books/${livrePayant}/pages/1`),
      ctxPage(livrePayant, '1'),
    );

    expect(reponse.status).toBe(200);
    const corps = await corpsJson<{ page: { au_titre_de_l_extrait: boolean }; url: string }>(reponse);
    expect(corps.page.au_titre_de_l_extrait).toBe(true);
    expect(corps.url).toContain('token=');
  });

  it('arrête un visiteur à la limite de l’extrait', async () => {
    const reponse = await pageRoute(
      get(`/api/books/${livrePayant}/pages/6`),
      ctxPage(livrePayant, '6'),
    );

    expect(reponse.status).toBe(403);
    expect((await corpsJson<ReponseErreur>(reponse)).erreur.code).toBe('hors_extrait');
  });

  it('sert la résolution allégée à la demande (§5.1)', async () => {
    const reponse = await pageRoute(
      get(`/api/books/${livreGratuit}/pages/1?resolution=allegee`),
      ctxPage(livreGratuit, '1'),
    );

    expect(reponse.status).toBe(200);
    expect((await corpsJson<{ url: string }>(reponse)).url).toContain('allegee');
  });

  it('emprunte le MÊME chemin pour un conte gratuit', async () => {
    // docs/PLAN.md D3 point 7 : un chemin unique, seules la durée et la mise en
    // cache diffèrent. Deux chemins auraient fini par diverger sur le contrôle.
    const reponse = await pageRoute(
      get(`/api/books/${livreGratuit}/pages/6`),
      ctxPage(livreGratuit, '6'),
    );

    expect(reponse.status).toBe(200);
    const corps = await corpsJson<{ page: { au_titre_de_l_extrait: boolean }; motif: string }>(reponse);
    expect(corps.page.au_titre_de_l_extrait).toBe(false);
    expect(corps.motif).toBe('free');
  });

  it('ne met jamais un contenu payant en cache partagé', async () => {
    const payant = await pageRoute(
      get(`/api/books/${livrePayant}/pages/1`),
      ctxPage(livrePayant, '1'),
    );
    const gratuit = await pageRoute(
      get(`/api/books/${livreGratuit}/pages/1`),
      ctxPage(livreGratuit, '1'),
    );

    expect(payant.headers.get('cache-control')).toBe('private, no-store');
    expect(gratuit.headers.get('cache-control')).toMatch(/^public, max-age=/);
  });

  it('refuse un identifiant malformé et un numéro de page invalide', async () => {
    expect(
      (await pageRoute(get('/api/books/pas-un-uuid/pages/1'), ctxPage('pas-un-uuid', '1'))).status,
    ).toBe(404);
    expect(
      (await pageRoute(get(`/api/books/${livrePayant}/pages/0`), ctxPage(livrePayant, '0'))).status,
    ).toBe(400);
  });

  it('ne laisse pas deviner le nombre de pages d’un titre payant', async () => {
    // La borne de l'extrait est vérifiée AVANT l'existence de la page. Sans cet
    // ordre, un visiteur distinguerait « page absente » de « page interdite »
    // et retrouverait la longueur du livre en sondant page après page.
    const auDela = await pageRoute(
      get(`/api/books/${livrePayant}/pages/999`),
      ctxPage(livrePayant, '999'),
    );

    expect(auDela.status).toBe(403);
    expect((await corpsJson<ReponseErreur>(auDela)).erreur.code).toBe('hors_extrait');
  });

  it('signale en revanche une page absente à qui a le droit de lire le titre', async () => {
    // L'acheteur connaît déjà la longueur du livre : lui répondre 404 ne lui
    // apprend rien, et lui évite de chercher une erreur de droits inexistante.
    const reponse = await pageRoute(
      get(`/api/books/${livrePayant}/pages/999`, { jeton: acheteur.accessToken }),
      ctxPage(livrePayant, '999'),
    );

    expect(reponse.status).toBe(404);
  });
});

describe('durée de validité des URL signées (docs/PLAN.md D6)', () => {
  it('plafonne un contenu payant à 300 secondes, même si la configuration dit plus', () => {
    // Le plafond est appliqué DANS LE CODE : un `.env` recopié d'un autre
    // projet ne doit pas rendre un lien de contenu payant partageable pendant
    // des heures.
    const precedent = process.env['SIGNED_URL_TTL'];
    process.env['SIGNED_URL_TTL'] = '86400';
    resetServerEnvCache();

    try {
      expect(dureeValidite(false)).toBe(SIGNED_URL_TTL_MAX_SECONDS);
    } finally {
      if (precedent === undefined) delete process.env['SIGNED_URL_TTL'];
      else process.env['SIGNED_URL_TTL'] = precedent;
      resetServerEnvCache();
    }
  });

  it('plafonne un titre gratuit à 3600 secondes', () => {
    const precedent = process.env['SIGNED_URL_TTL_FREE'];
    process.env['SIGNED_URL_TTL_FREE'] = '999999';
    resetServerEnvCache();

    try {
      expect(dureeValidite(true)).toBe(SIGNED_URL_TTL_FREE_MAX_SECONDS);
    } finally {
      if (precedent === undefined) delete process.env['SIGNED_URL_TTL_FREE'];
      else process.env['SIGNED_URL_TTL_FREE'] = precedent;
      resetServerEnvCache();
    }
  });

  it('respecte une durée plus courte que le plafond', () => {
    const precedent = process.env['SIGNED_URL_TTL'];
    process.env['SIGNED_URL_TTL'] = '60';
    resetServerEnvCache();

    try {
      expect(dureeValidite(false)).toBe(60);
    } finally {
      if (precedent === undefined) delete process.env['SIGNED_URL_TTL'];
      else process.env['SIGNED_URL_TTL'] = precedent;
      resetServerEnvCache();
    }
  });

  it('n’applique jamais la durée longue à un fichier téléchargeable', async () => {
    // Même pour un titre gratuit : la gratuité porte sur la lecture, jamais sur
    // le téléchargement. Un lien de fichier valable une heure serait partageable.
    const reponse = await fichierRoute(
      get(`/api/books/${livrePayant}/file`, { jeton: acheteur.accessToken }),
      ctxFichier(livrePayant),
    );

    const corps = await corpsJson<{ expire_le: string }>(reponse);
    const secondes = (new Date(corps.expire_le).getTime() - Date.now()) / 1000;
    expect(secondes).toBeLessThanOrEqual(SIGNED_URL_TTL_MAX_SECONDS + 5);
  });
});

describe('bucket privés', () => {
  it('refusent l’accès direct sans URL signée', async () => {
    // §6.2 : c'est ce refus qui empêche de contourner le modèle économique en
    // partageant une URL.
    const chemin = await queryOne<{ chemin_haute: string }>(
      `select chemin_haute from public.book_pages limit 1`,
    );
    const complet = chemin?.chemin_haute ?? '';
    const bucket = complet.slice(0, complet.indexOf('/'));
    const objet = complet.slice(complet.indexOf('/') + 1);

    const { data, error } = await anonClient().storage.from(bucket).download(objet);

    expect(error).not.toBeNull();
    expect(data).toBeNull();
  });

  it('n’émettent pas d’URL publique exploitable', async () => {
    const { data } = anonClient().storage.from('book-pages').getPublicUrl('nimporte/quoi.webp');
    const reponse = await fetch(data.publicUrl);

    expect(reponse.ok).toBe(false);
  });

  it('déclarent bien les trois bucket de livre comme privés', async () => {
    const buckets = await query<{ id: string; public: boolean }>(
      `select id, public from storage.buckets order by id`,
    );
    const parId = new Map(buckets.map((b) => [b.id, b.public]));

    expect(parId.get('book-sources')).toBe(false);
    expect(parId.get('book-pages')).toBe(false);
    expect(parId.get('book-downloads')).toBe(false);
    // Les couvertures sont publiques, et c'est délibéré : ce sont des arguments
    // de vente, ils doivent être indexables (§5.4).
    expect(parId.get('covers')).toBe(true);
  });
});

describe('accès au téléchargement', () => {
  it('exige un compte', async () => {
    const reponse = await fichierRoute(
      get(`/api/books/${livrePayant}/file`),
      ctxFichier(livrePayant),
    );

    expect(reponse.status).toBe(401);
  });

  it('refuse un utilisateur sans droit', async () => {
    const reponse = await fichierRoute(
      get(`/api/books/${livrePayant}/file`, { jeton: visiteurConnecte.accessToken }),
      ctxFichier(livrePayant),
    );

    expect(reponse.status).toBe(403);
    expect((await corpsJson<ReponseErreur>(reponse)).erreur.message).toMatch(/ne possédez pas/i);
  });

  it('refuse une langue dont la traduction n’est pas publiée', async () => {
    const reponse = await fichierRoute(
      get(`/api/books/${livrePayant}/file?langue=en`, { jeton: acheteur.accessToken }),
      ctxFichier(livrePayant),
    );

    expect(reponse.status).toBe(404);
  });

  it('sert les deux formats', async () => {
    for (const format of ['pdf', 'epub'] as const) {
      const reponse = await fichierRoute(
        get(`/api/books/${livrePayant}/file?format=${format}`, { jeton: acheteur.accessToken }),
        ctxFichier(livrePayant),
      );
      expect({ format, statut: reponse.status }).toEqual({ format, statut: 200 });
    }
  });

  it('refuse un format inconnu', async () => {
    const reponse = await fichierRoute(
      get(`/api/books/${livrePayant}/file?format=mobi`, { jeton: acheteur.accessToken }),
      ctxFichier(livrePayant),
    );

    expect(reponse.status).toBe(400);
  });
});

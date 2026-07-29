import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { GET as lireProgression, PUT as ecrireProgression } from '@/app/api/reading/[bookId]/route';
import { enregistrerProgression, reinitialiserRegroupement } from '@/lib/reading/progress';
import { getAccess } from '@/lib/access/engine';

import { closePool, query, queryOne } from '../helpers/db';
import { corpsJson, get, type ReponseErreur } from '../helpers/http';
import { createTestUser, deleteTestUser, type TestUser } from '../helpers/users';

/**
 * Progression de lecture — §4.2 F7.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LE PIÈGE DE L'ÉTAPE : deux versions linguistiques d'un même livre n'ont │
 * │ pas forcément le même nombre de pages.                                  │
 * │                                                                          │
 * │ `kouassi-et-le-tam-tam` fait 20 pages en français et 16 en anglais dans │
 * │ le jeu de démonstration — divergence posée délibérément, parce qu'elle   │
 * │ est réaliste : deux versions sont deux PDF distincts, et un texte        │
 * │ traduit se recompose.                                                    │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
let lecteur: TestUser;
let autre: TestUser;
let livreBilingue: string; // 20 pages FR, 16 pages EN
let livreAbonnement: string; // couvert par l'abonnement, pour la perte d'accès

function contexte(bookId: string) {
  return { params: Promise.resolve({ bookId }) };
}

function ecrire(user: TestUser, bookId: string, corps: Record<string, unknown>): Request {
  return new Request(`http://localhost:3000/api/reading/${bookId}`, {
    method: 'PUT',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${user.accessToken}`,
    },
    body: JSON.stringify(corps),
  });
}

beforeAll(async () => {
  lecteur = await createTestUser();
  autre = await createTestUser();

  const bilingue = await queryOne<{ id: string }>(
    `select id from public.books where slug = 'kouassi-et-le-tam-tam'`,
  );
  livreBilingue = bilingue!.id;

  const abonnement = await queryOne<{ id: string }>(
    `select id from public.books where slug = 'le-lion-et-la-souris'`,
  );
  livreAbonnement = abonnement!.id;

  // Le lecteur POSSÈDE le titre bilingue : la progression exige un droit de
  // lecture effectif.
  const commande = await queryOne<{ id: string }>(
    `insert into public.orders (user_id, montant_total, devise, zone, statut, paye_le)
     values ($1, 499, 'EUR', 'international', 'paye', public.app_now()) returning id`,
    [lecteur.id],
  );
  await query(
    `insert into public.entitlements (user_id, book_id, type, source_id, peut_telecharger)
     values ($1, $2, 'achat', $3, true)`,
    [lecteur.id, livreBilingue, commande!.id],
  );
});

beforeEach(async () => {
  await query(`delete from public.reading_progress where user_id = $1`, [lecteur.id]);
  // Le regroupement vit en mémoire : sans remise à zéro, une écriture d'un test
  // précédent absorberait celle du suivant.
  reinitialiserRegroupement();
});

afterAll(async () => {
  await deleteTestUser(lecteur);
  await deleteTestUser(autre);
  await closePool();
});

describe('le jeu de démonstration porte bien la divergence', () => {
  it('a deux versions de longueurs différentes', async () => {
    // Sans cette divergence, le cas principal de l'étape ne serait pas
    // éprouvable — et le test suivant passerait pour de mauvaises raisons.
    const versions = await query<{ langue: string; pages: string }>(
      `select t.langue, count(bp.id)::text as pages
         from public.book_translations t
         left join public.book_pages bp on bp.translation_id = t.id
        where t.book_id = $1
        group by t.langue order by t.langue`,
      [livreBilingue],
    );

    expect(versions).toEqual([
      { langue: 'en', pages: '16' },
      { langue: 'fr', pages: '20' },
    ]);
  });
});

describe('PAGINATION DIVERGENTE — la reprise ne renvoie jamais hors du livre', () => {
  it('BORNE la reprise à la longueur de la version ouverte', () => {
    // Page 19 en français ; la version anglaise n'en compte que 16.
    return (async () => {
      await enregistrerProgression(lecteur.id, livreBilingue, 'fr', 19);

      const corps = await corpsJson<{
        page: number;
        reprise_depuis: string | null;
        ramenee_a_la_fin: boolean;
      }>(
        await lireProgression(
          get(`/api/reading/${livreBilingue}?langue=en`, { jeton: lecteur.accessToken }),
          contexte(livreBilingue),
        ),
      );

      expect(corps.page).toBe(16);
      expect(corps.reprise_depuis).toBe('fr');
      expect(corps.ramenee_a_la_fin).toBe(true);
    })();
  });

  it('reprend sans borner quand la page existe dans les deux versions', async () => {
    await enregistrerProgression(lecteur.id, livreBilingue, 'fr', 12);

    const corps = await corpsJson<{ page: number; ramenee_a_la_fin: boolean }>(
      await lireProgression(
        get(`/api/reading/${livreBilingue}?langue=en`, { jeton: lecteur.accessToken }),
        contexte(livreBilingue),
      ),
    );

    expect(corps.page).toBe(12);
    expect(corps.ramenee_a_la_fin).toBe(false);
  });

  it('PRÉFÈRE la progression de la langue ouverte', async () => {
    await enregistrerProgression(lecteur.id, livreBilingue, 'fr', 19);
    reinitialiserRegroupement();
    await enregistrerProgression(lecteur.id, livreBilingue, 'en', 5);

    const corps = await corpsJson<{ page: number; reprise_depuis: string | null }>(
      await lireProgression(
        get(`/api/reading/${livreBilingue}?langue=en`, { jeton: lecteur.accessToken }),
        contexte(livreBilingue),
      ),
    );

    expect(corps.page).toBe(5);
    expect(corps.reprise_depuis).toBe('en');
  });

  it('REFUSE d’enregistrer une page qui n’existe pas dans cette version', async () => {
    // Page 19 est valide en français, pas dans une version anglaise de seize
    // pages. Accepter l'écriture rendrait la borne de lecture inutile.
    const reponse = await ecrireProgression(
      ecrire(lecteur, livreBilingue, { langue: 'en', page: 19 }),
      contexte(livreBilingue),
    );

    expect(reponse.status).toBe(400);
    expect((await corpsJson<ReponseErreur>(reponse)).erreur.champs?.['page']).toBeDefined();
  });

  it('accepte cette même page dans la version française', async () => {
    const reponse = await ecrireProgression(
      ecrire(lecteur, livreBilingue, { langue: 'fr', page: 19 }),
      contexte(livreBilingue),
    );

    expect(reponse.status).toBe(200);
  });

  it('conserve les deux progressions séparément', async () => {
    await enregistrerProgression(lecteur.id, livreBilingue, 'fr', 19);
    reinitialiserRegroupement();
    await enregistrerProgression(lecteur.id, livreBilingue, 'en', 5);

    const lignes = await query<{ langue: string; derniere_page: number }>(
      `select langue, derniere_page from public.reading_progress
        where user_id = $1 and book_id = $2 order by langue`,
      [lecteur.id, livreBilingue],
    );

    expect(lignes).toEqual([
      { langue: 'en', derniere_page: 5 },
      { langue: 'fr', derniere_page: 19 },
    ]);
  });
});

describe('regroupement des écritures', () => {
  it('absorbe une écriture trop rapprochée, sans la signaler comme un échec', async () => {
    // Un enfant qui feuillette produirait une écriture par page. Le client ne
    // doit pas réessayer : il défferait le regroupement.
    const premiere = await ecrireProgression(
      ecrire(lecteur, livreBilingue, { langue: 'fr', page: 3 }),
      contexte(livreBilingue),
    );
    const seconde = await ecrireProgression(
      ecrire(lecteur, livreBilingue, { langue: 'fr', page: 4 }),
      contexte(livreBilingue),
    );

    expect(premiere.status).toBe(200);
    expect((await corpsJson<{ enregistree: boolean }>(premiere)).enregistree).toBe(true);

    // Succès aussi : le regroupement n'est pas une erreur.
    expect(seconde.status).toBe(200);
    expect((await corpsJson<{ enregistree: boolean }>(seconde)).enregistree).toBe(false);

    const ligne = await queryOne<{ derniere_page: number }>(
      `select derniere_page from public.reading_progress
        where user_id = $1 and book_id = $2 and langue = 'fr'`,
      [lecteur.id, livreBilingue],
    );
    expect(ligne?.derniere_page).toBe(3);
  });

  it('n’écrit pas deux fois la même page', async () => {
    await ecrireProgression(
      ecrire(lecteur, livreBilingue, { langue: 'fr', page: 7 }),
      contexte(livreBilingue),
    );
    reinitialiserRegroupement();

    const seconde = await ecrireProgression(
      ecrire(lecteur, livreBilingue, { langue: 'fr', page: 7 }),
      contexte(livreBilingue),
    );

    // Le cas du lecteur qui laisse l'album ouvert.
    expect((await corpsJson<{ enregistree: boolean }>(seconde)).enregistree).toBe(false);
  });
});

describe('horodatage', () => {
  it('vient du SERVEUR, jamais du client', async () => {
    // Deux appareils aux horloges décalées feraient reculer la progression.
    // Un champ d'horodatage envoyé par le client doit être ignoré.
    const avant = Date.now();
    await ecrireProgression(
      ecrire(lecteur, livreBilingue, {
        langue: 'fr',
        page: 5,
        maj_le: '1999-01-01T00:00:00Z',
      }),
      contexte(livreBilingue),
    );

    const ligne = await queryOne<{ maj_le: string }>(
      `select maj_le from public.reading_progress where user_id = $1 and book_id = $2`,
      [lecteur.id, livreBilingue],
    );

    const enregistre = new Date(ligne!.maj_le).getTime();
    expect(enregistre).toBeGreaterThanOrEqual(avant - 5_000);
    expect(new Date(ligne!.maj_le).getUTCFullYear()).toBe(new Date().getUTCFullYear());
  });

  it('utilise l’heure RÉELLE, non l’horloge métier', async () => {
    // C'est la seule colonne du schéma dans ce cas, et l'exception est
    // délibérée : elle arbitre une concurrence entre appareils, elle ne date
    // pas un fait métier. Le défaut de la colonne le prouve.
    const defaut = await queryOne<{ defaut: string }>(
      `select column_default as defaut
         from information_schema.columns
        where table_name = 'reading_progress' and column_name = 'maj_le'`,
    );

    expect(defaut?.defaut).toContain('now()');
    expect(defaut?.defaut).not.toContain('app_now');
  });
});

describe('droits', () => {
  it('exige un compte connecté', async () => {
    const reponse = await lireProgression(
      get(`/api/reading/${livreBilingue}`),
      contexte(livreBilingue),
    );

    expect(reponse.status).toBe(401);
  });

  it('REFUSE d’écrire sur un titre auquel on n’a aucun accès', async () => {
    // Sans cette condition, la table deviendrait un moyen de sonder
    // l'existence d'un identifiant de livre — et un journal des titres qu'on a
    // tenté d'ouvrir sans y avoir droit.
    //
    // Un BROUILLON est le cas le plus net : `reason` y vaut `none`, pas même
    // l'extrait.
    const brouillon = await queryOne<{ id: string }>(
      `select id from public.books where slug = 'le-lievre-et-la-tortue'`,
    );

    const reponse = await ecrireProgression(
      ecrire(autre, brouillon!.id, { langue: 'fr', page: 3 }),
      contexte(brouillon!.id),
    );

    expect(reponse.status).toBe(403);
    expect(
      await query(`select 1 from public.reading_progress where user_id = $1`, [autre.id]),
    ).toHaveLength(0);
  });

  it('REFUSE l’écriture à qui n’a droit qu’à l’EXTRAIT', async () => {
    // ┌──────────────────────────────────────────────────────────────────────┐
    // │ Condition alignée sur la politique RLS de l'étape 4, qui exige       │
    // │ `can_read`. Le serveur passe par `service_role` et contourne RLS :   │
    // │ si les deux divergeaient, la même écriture serait acceptée par un    │
    // │ chemin et refusée par l'autre.                                       │
    // │                                                                      │
    // │ Trois pages d'extrait ne valent pas une reprise, et persister le     │
    // │ parcours de quelqu'un sans accès au titre reviendrait à tenir un     │
    // │ journal de ce qu'il a tenté d'ouvrir.                                │
    // └──────────────────────────────────────────────────────────────────────┘
    const acces = await getAccess(autre.id, livreAbonnement);
    expect(acces.reason).toBe('preview');
    expect(acces.canRead).toBe(false);

    const reponse = await ecrireProgression(
      ecrire(autre, livreAbonnement, { langue: 'fr', page: 2 }),
      contexte(livreAbonnement),
    );

    expect(reponse.status).toBe(403);
  });

  it('applique la MÊME condition que la politique RLS', async () => {
    // Le contrôle qui empêche la divergence de se reformer : la politique
    // exige `can_read`, le service aussi. Une écriture directe par un client
    // soumis à RLS doit échouer exactement là où le service refuse.
    const { error } = await autre.client.from('reading_progress').insert({
      user_id: autre.id,
      book_id: livreAbonnement,
      langue: 'fr',
      derniere_page: 2,
    });

    expect(error).not.toBeNull();
  });
});

describe('LA PROGRESSION SURVIT À LA PERTE D’ACCÈS', () => {
  it('reste lisible après expiration d’un abonnement', async () => {
    // ┌──────────────────────────────────────────────────────────────────────┐
    // │ Un réabonnement doit reprendre là où l'enfant s'était arrêté. La     │
    // │ progression n'est pas un droit d'accès : l'effacer à l'expiration    │
    // │ punirait le lecteur d'avoir interrompu son abonnement.               │
    // └──────────────────────────────────────────────────────────────────────┘
    await query(
      `insert into public.subscriptions
         (user_id, offre, statut, debut_periode, fin_periode, zone, devise, montant)
       values ($1, 'mensuel', 'actif', public.app_now(),
               public.app_now() + interval '1 month', 'international', 'EUR', 799)`,
      [autre.id],
    );

    try {
      await ecrireProgression(
        ecrire(autre, livreAbonnement, { langue: 'fr', page: 4 }),
        contexte(livreAbonnement),
      );

      // L'abonnement expire.
      await query(
        `update public.subscriptions set statut = 'expire' where user_id = $1`,
        [autre.id],
      );

      const acces = await getAccess(autre.id, livreAbonnement);
      expect(acces.canRead).toBe(false);

      // La progression, elle, est intacte et toujours lisible.
      const corps = await corpsJson<{ page: number }>(
        await lireProgression(
          get(`/api/reading/${livreAbonnement}`, { jeton: autre.accessToken }),
          contexte(livreAbonnement),
        ),
      );
      expect(corps.page).toBe(4);
    } finally {
      await query(`delete from public.subscriptions where user_id = $1`, [autre.id]);
      await query(`delete from public.reading_progress where user_id = $1`, [autre.id]);
    }
  });
});

describe('données conservées', () => {
  it('se limitent à la dernière page et à l’horodatage', async () => {
    // ┌──────────────────────────────────────────────────────────────────────┐
    // │ La progression est une donnée COMPORTEMENTALE sur la lecture d'un    │
    // │ enfant. Pas d'historique de sessions, pas de durée, pas de parcours  │
    // │ page par page — ce serait un passif au regard de §11.2, et CLAUDE.md │
    // │ interdit déjà toute donnée d'enfant.                                 │
    // │                                                                      │
    // │ Ce test échouera le jour où quelqu'un ajoutera une colonne « pour    │
    // │ mesurer l'engagement ». C'est exactement ce qu'on attend de lui.     │
    // └──────────────────────────────────────────────────────────────────────┘
    const colonnes = await query<{ column_name: string }>(
      `select column_name from information_schema.columns
        where table_schema = 'public' and table_name = 'reading_progress'
        order by column_name`,
    );

    expect(colonnes.map((c) => c.column_name)).toEqual([
      'book_id',
      'derniere_page',
      'langue',
      'maj_le',
      'user_id',
    ]);
  });

  it('ne conserve qu’une ligne par livre et par langue', async () => {
    // Une table qui accumulerait une ligne par consultation serait un
    // historique de lecture, c'est-à-dire précisément ce qu'on refuse.
    for (const page of [2, 5, 9]) {
      reinitialiserRegroupement();
      await enregistrerProgression(lecteur.id, livreBilingue, 'fr', page);
    }

    const lignes = await query(
      `select 1 from public.reading_progress where user_id = $1 and book_id = $2`,
      [lecteur.id, livreBilingue],
    );
    expect(lignes).toHaveLength(1);
  });
});

import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { closePool, query, queryOne } from '../helpers/db';
import { createTestUser, deleteTestUser, type TestUser } from '../helpers/users';

/**
 * L'ASSOCIATION DAVE — ce que l'administration lit et écrit.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ CES TESTS VISENT LES RÈGLES, PAS LES REQUÊTES.                          │
 * │                                                                          │
 * │ Une fonction qui rend des lignes se vérifie à l'œil en la lançant une    │
 * │ fois. Ce qui se vérifie mal, et qui casse en silence, ce sont les REFUS  │
 * │ et les EFFETS DE BORD : un mot du mois qui écrase son prédécesseur au    │
 * │ lieu de l'archiver, un nombre de places qui descend sous le nombre       │
 * │ d'inscrits, une région retirée d'un formulaire qui reste en base.        │
 * │                                                                          │
 * │ Chaque test ci-dessous nomme le défaut qu'il interdit.                   │
 * └──────────────────────────────────────────────────────────────────────────┘
 */

let editeur: TestUser;
const comptes: TestUser[] = [];
const evenements: string[] = [];

beforeAll(async () => {
  editeur = await createTestUser({ admin: true });
});

afterEach(async () => {
  if (evenements.length > 0) {
    await query(`delete from public.association_events where id = any($1::uuid[])`, [evenements]);
    evenements.length = 0;
  }
  while (comptes.length > 0) {
    const compte = comptes.pop();
    if (compte) await deleteTestUser(compte);
  }
  await query(`delete from public.association_comments where texte like 'essai %'`);
  await query(`delete from public.association_words where texte like 'essai %'`);
  await query(`delete from public.association_campaigns where intitule like 'essai %'`);
});

afterAll(async () => {
  await deleteTestUser(editeur);
  await closePool();
});

async function unContenu(): Promise<string> {
  const ligne = await queryOne<{ id: string }>(
    `select id from public.association_contents where statut = 'publie' order by slug limit 1`,
  );
  return ligne?.id ?? '';
}

async function unEvenement(places = 2): Promise<string> {
  const ligne = await queryOne<{ id: string }>(
    `select id from public.admin_enregistrer_evenement(
       $1, null, 'atelier_presentiel', 'Atelier d''essai',
       public.app_now() + interval '20 days', $2::smallint, 'Douala')`,
    [editeur.id, places],
  );
  const id = ligne?.id ?? '';
  evenements.push(id);
  return id;
}

describe('le rythme hebdomadaire', () => {
  it('rend quatre JEUDIS, dans l’ordre, à partir du prochain', async () => {
    /*
     * Le jeudi est la promesse faite aux adhérents : un contenu par semaine.
     * Un calcul décalé d'un jour ferait planifier le mercredi, et la promesse
     * serait tenue un jour trop tôt chaque semaine sans que rien ne le dise.
     */
    /*
     * LE JOUR DE LA SEMAINE EST DEMANDÉ À LA BASE, PAS AU PILOTE.
     *
     * Une colonne `date` revient en `Date` JavaScript posée à MINUIT LOCAL :
     * à l'est de Greenwich, `getUTCDay()` lit alors la veille, et le test
     * échouait sur un jeudi parfaitement juste. Demander `isodow` à Postgres
     * éprouve ce que la fonction calcule, sans passer par une conversion qui
     * n'a rien à voir avec la règle.
     */
    const jeudis = await query<{ jour: Date; isodow: string; rang: string }>(
      `select jour,
              extract(isodow from jour)::text as isodow,
              row_number() over (order by jour)::text as rang
         from public.admin_prochains_jeudis()`,
    );

    expect(jeudis).toHaveLength(4);
    expect(jeudis.map((j) => j.isodow)).toEqual(['4', '4', '4', '4']);
    expect(jeudis.map((j) => j.rang)).toEqual(['1', '2', '3', '4']);

    // Sept jours entre deux jeudis consécutifs, sans trou ni doublon.
    const ecarts = await query<{ ecart: string }>(
      `with j as (select jour from public.admin_prochains_jeudis())
       select (jour - lag(jour) over (order by jour))::text as ecart from j offset 1`,
    );
    expect(ecarts.map((e) => e.ecart)).toEqual(['7', '7', '7']);
  });
});

describe('la modération d’un commentaire', () => {
  async function unCommentaire(): Promise<{ id: string; auteur: TestUser }> {
    const auteur = await createTestUser();
    comptes.push(auteur);
    const ligne = await queryOne<{ id: string }>(
      `insert into public.association_comments (content_id, user_id, texte)
       values ($1, $2, 'essai de commentaire') returning id`,
      [await unContenu(), auteur.id],
    );
    return { id: ligne?.id ?? '', auteur };
  }

  it('naît EN ATTENTE, quoi qu’on en dise à l’insertion', async () => {
    // La valeur par défaut est toute la protection : un auteur qui poserait
    // son propre statut publierait lui-même, et la modération serait décorative.
    const { id } = await unCommentaire();
    const ligne = await queryOne<{ statut: string }>(
      `select statut from public.association_comments where id = $1`,
      [id],
    );

    expect(ligne?.statut).toBe('en_attente');
  });

  it('approuve, et retient QUI a décidé', async () => {
    const { id } = await unCommentaire();
    await query(`select * from public.admin_moderer_commentaire($1, $2, 'publie')`, [
      editeur.id,
      id,
    ]);

    const ligne = await queryOne<{ statut: string; modere_par: string; modere_le: Date }>(
      `select statut, modere_par, modere_le from public.association_comments where id = $1`,
      [id],
    );

    expect(ligne?.statut).toBe('publie');
    expect(ligne?.modere_par).toBe(editeur.id);
    expect(ligne?.modere_le).not.toBeNull();
  });

  it('REFUSE de remettre en attente', async () => {
    /*
     * Un message renvoyé dans la file y reviendrait indéfiniment sans que
     * rien dise pourquoi. C'est l'arbitrage déjà pris pour les avis (0072) :
     * modérer, c'est trancher.
     */
    const { id } = await unCommentaire();

    await expect(
      query(`select * from public.admin_moderer_commentaire($1, $2, 'en_attente')`, [
        editeur.id,
        id,
      ]),
    ).rejects.toThrow();
  });

  it('compte les messages en attente dans « à modérer »', async () => {
    const avant = await queryOne<{ a_moderer: string }>(
      `select a_moderer from public.admin_stats_association()`,
    );
    await unCommentaire();
    const apres = await queryOne<{ a_moderer: string }>(
      `select a_moderer from public.admin_stats_association()`,
    );

    expect(Number(apres?.a_moderer) - Number(avant?.a_moderer)).toBe(1);
  });
});

describe('un événement', () => {
  it('REFUSE de descendre sous le nombre d’inscrits', async () => {
    /*
     * L'écran afficherait « -1 place restante », ou pire se tairait, et une
     * personne se présenterait sans place. Le refus vit en base parce que
     * deux écrans pourraient poser la même modification.
     */
    const id = await unEvenement(2);
    const inscrit = await createTestUser();
    comptes.push(inscrit);
    await query(
      `insert into public.association_event_registrations (event_id, user_id) values ($1, $2)`,
      [id, inscrit.id],
    );

    await expect(
      query(
        `select * from public.admin_enregistrer_evenement(
           $1, $2, 'atelier_presentiel', 'Atelier d''essai',
           public.app_now() + interval '20 days', 0::smallint, 'Douala')`,
        [editeur.id, id],
      ),
    ).rejects.toThrow(/inscrit/i);
  });

  it('compte les places restantes en base, jamais dans l’écran', async () => {
    const id = await unEvenement(3);
    const inscrit = await createTestUser();
    comptes.push(inscrit);
    await query(
      `insert into public.association_event_registrations (event_id, user_id) values ($1, $2)`,
      [id, inscrit.id],
    );

    const ligne = await queryOne<{ restantes: number }>(
      `select public.association_places_restantes($1) as restantes`,
      [id],
    );
    expect(ligne?.restantes).toBe(2);
  });

  it('n’a pas de lieu quand il est EN LIGNE', async () => {
    // Sans la contrainte, un écran afficherait « En ligne » sous une adresse
    // de salle, et personne ne saurait laquelle des deux croire.
    await expect(
      query(
        `select * from public.admin_enregistrer_evenement(
           $1, null, 'seminaire_en_ligne', 'Essai en ligne',
           public.app_now() + interval '5 days', 20::smallint, 'Douala', 'https://exemple.test')`,
        [editeur.id],
      ),
    ).rejects.toThrow();
  });
});

describe('le mot du mois', () => {
  it('ARCHIVE le précédent au lieu de l’écraser', async () => {
    /*
     * Un historique ne se reconstitue pas après coup : ce qui a été écrasé
     * est perdu, et c'est le jour où on le cherche qu'on s'en aperçoit.
     */
    await query(`select * from public.admin_enregistrer_mot_du_mois($1, 'essai premier mot')`, [
      editeur.id,
    ]);
    await query(`select * from public.admin_enregistrer_mot_du_mois($1, 'essai second mot')`, [
      editeur.id,
    ]);

    const tous = await query<{ texte: string; actif: boolean }>(
      `select texte, actif from public.association_words where texte like 'essai %' order by cree_le`,
    );

    expect(tous.map((m) => m.texte)).toEqual(['essai premier mot', 'essai second mot']);
    expect(tous.map((m) => m.actif)).toEqual([false, true]);
  });

  it('n’en rend QU’UN — celui qui est affiché', async () => {
    await query(`select * from public.admin_enregistrer_mot_du_mois($1, 'essai premier mot')`, [
      editeur.id,
    ]);
    await query(`select * from public.admin_enregistrer_mot_du_mois($1, 'essai second mot')`, [
      editeur.id,
    ]);

    const lus = await query<{ texte: string }>(`select texte from public.admin_lire_mot_du_mois()`);
    expect(lus).toHaveLength(1);
    expect(lus[0]?.texte).toBe('essai second mot');
  });
});

describe('la campagne', () => {
  it('somme les régions, et ne stocke pas le total', async () => {
    await query(
      `select * from public.admin_enregistrer_campagne($1, null, 'essai rentree', 500, null, $2::jsonb)`,
      [editeur.id, JSON.stringify([{ region: 'Ouest', kits: 148 }, { region: 'Centre', kits: 67 }])],
    );

    const ligne = await queryOne<{ total: number; regions: unknown[] }>(
      `select total, regions from public.admin_lire_campagne()`,
    );

    expect(ligne?.total).toBe(215);
    expect(ligne?.regions).toHaveLength(2);
  });

  it('RETIRE une région absente du bloc enregistré', async () => {
    /*
     * Le bloc fait foi, comme pour les versions d'un témoignage (0073). Sans
     * cela, retirer une région demanderait un second geste que l'écran
     * n'offre pas — et la région resterait, visible des adhérents.
     */
    const cree = await queryOne<{ id: string }>(
      `select id from public.admin_enregistrer_campagne($1, null, 'essai rentree', 500, null, $2::jsonb)`,
      [editeur.id, JSON.stringify([{ region: 'Ouest', kits: 148 }, { region: 'Centre', kits: 67 }])],
    );

    await query(
      `select * from public.admin_enregistrer_campagne($1, $2, 'essai rentree', 500, null, $3::jsonb)`,
      [editeur.id, cree?.id, JSON.stringify([{ region: 'Ouest', kits: 150 }])],
    );

    const ligne = await queryOne<{ total: number; regions: { region: string }[] }>(
      `select total, regions from public.admin_lire_campagne()`,
    );

    expect(ligne?.regions.map((r) => r.region)).toEqual(['Ouest']);
    expect(ligne?.total).toBe(150);
  });

  it('n’a qu’UNE campagne active à la fois', async () => {
    await query(
      `select * from public.admin_enregistrer_campagne($1, null, 'essai premiere', 100, null, '[]'::jsonb)`,
      [editeur.id],
    );
    await query(
      `select * from public.admin_enregistrer_campagne($1, null, 'essai seconde', 200, null, '[]'::jsonb)`,
      [editeur.id],
    );

    const actives = await query<{ intitule: string }>(
      `select intitule from public.association_campaigns where actif`,
    );
    expect(actives).toHaveLength(1);
    expect(actives[0]?.intitule).toBe('essai seconde');
  });
});

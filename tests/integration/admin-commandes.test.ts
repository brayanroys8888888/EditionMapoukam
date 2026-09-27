import { afterAll, afterEach, describe, expect, it } from 'vitest';

import { closePool, query, queryOne } from '../helpers/db';
import { createTestUser, deleteTestUser, type TestUser } from '../helpers/users';

/**
 * L'ÉCRAN DES COMMANDES — ce que la base doit lui rendre (migrations 0089, 0090).
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ TROIS RÈGLES, ET AUCUNE NE SE VOIT EN RELISANT L'ÉCRAN.                 │
 * │                                                                          │
 * │ 1. Un acheteur ANONYMISÉ ne doit reparaître NI par son nom, NI par son   │
 * │    courriel, NI par la recherche. L'écran affichait déjà l'adresse       │
 * │    masquée ; la 0089 lui ajoute le NOM, et c'est précisément le genre    │
 * │    d'ajout qui défait le droit à l'oubli sans que personne ne s'en       │
 * │    aperçoive — la colonne se remplit, l'écran a l'air plus complet.      │
 * │                                                                          │
 * │ 2. Les compteurs de segments et la liste doivent MONTRER LA MÊME CHOSE.  │
 * │    Ce sont deux fonctions, avec deux prédicats de recherche écrits deux  │
 * │    fois. Le jour où ils divergent, le segment annonce des lignes que le  │
 * │    clic ne montre pas — et c'est toujours le compteur qu'on croit.       │
 * │                                                                          │
 * │ 3. Le numéro doit être UNIQUE et croissant. Il sert à se comprendre au   │
 * │    téléphone : deux commandes « EM-1048 » rendraient la conversation     │
 * │    impossible, et rien dans l'écran ne le signalerait.                   │
 * └──────────────────────────────────────────────────────────────────────────┘
 */

interface LigneCommande {
  id: string;
  numero: string;
  nom: string | null;
  email: string | null;
  devise: string;
  statut: string;
  acheteur_anonymise: boolean;
  premier_titre: string | null;
  nb_lignes: number;
}

interface LigneCompte {
  statut: string;
  nb: string;
}

/** Les commandes fabriquées ici, effacées après chaque test. */
const aEffacer: string[] = [];
const comptes: TestUser[] = [];

afterEach(async () => {
  if (aEffacer.length > 0) {
    await query(`delete from public.order_items where order_id = any($1::uuid[])`, [aEffacer]);
    await query(`delete from public.orders where id = any($1::uuid[])`, [aEffacer]);
    aEffacer.length = 0;
  }
  while (comptes.length > 0) {
    const compte = comptes.pop();
    if (compte) await deleteTestUser(compte);
  }
});

afterAll(async () => {
  await closePool();
});

/**
 * Une commande, écrite DIRECTEMENT.
 *
 * Pas par le tunnel : ce fichier éprouve des fonctions de LECTURE, et faire
 * passer chaque cas par un webhook signé mesurerait la chaîne de paiement en
 * plus de ce qu'on veut voir. Les tests du tunnel existent, ailleurs, et ce
 * sont eux qui garantissent qu'une vraie commande naît bien ainsi.
 */
async function commande(
  userId: string,
  options: { statut?: string; devise?: string; bookId?: string } = {},
): Promise<string> {
  const ligne = await queryOne<{ id: string }>(
    `insert into public.orders (user_id, montant_total, devise, zone, statut)
     values ($1, 1500, $2, case when $2 = 'XAF' then 'afrique'::public.price_zone
                                else 'international'::public.price_zone end, $3)
     returning id`,
    [userId, options.devise ?? 'EUR', options.statut ?? 'paye'],
  );
  const id = ligne?.id ?? '';
  aEffacer.push(id);

  if (options.bookId) {
    await query(
      `insert into public.order_items (order_id, book_id, langue, prix_unitaire, devise, zone)
       values ($1, $2, 'fr', 1500, $3, 'international')`,
      [id, options.bookId, options.devise ?? 'EUR'],
    );
  }
  return id;
}

async function lister(
  filtres: { statut?: string; devise?: string; recherche?: string } = {},
): Promise<LigneCommande[]> {
  return await query<LigneCommande>(
    `select * from public.admin_lister_commandes($1, null, 1, 100, $2, $3)`,
    [filtres.statut ?? null, filtres.devise ?? null, filtres.recherche ?? null],
  );
}

describe('le numéro de commande', () => {
  it('est attribué automatiquement, unique et croissant', async () => {
    const acheteur = await createTestUser();
    comptes.push(acheteur);

    const premiere = await commande(acheteur.id);
    const seconde = await commande(acheteur.id);

    const numeros = await query<{ id: string; numero: string }>(
      `select id, numero::text from public.orders where id = any($1::uuid[]) order by numero`,
      [[premiere, seconde]],
    );

    expect(numeros).toHaveLength(2);
    expect(Number(numeros[1]?.numero)).toBeGreaterThan(Number(numeros[0]?.numero));
  });

  it('refuse un doublon — la contrainte existe, pas seulement le défaut', async () => {
    const acheteur = await createTestUser();
    comptes.push(acheteur);

    const premiere = await commande(acheteur.id);
    const seconde = await commande(acheteur.id);

    const pris = await queryOne<{ numero: string }>(
      `select numero::text from public.orders where id = $1`,
      [premiere],
    );

    await expect(
      query(`update public.orders set numero = $1 where id = $2`, [pris?.numero, seconde]),
    ).rejects.toThrow();
  });
});

describe('un acheteur anonymisé', () => {
  it('ne rend NI son nom NI son courriel', async () => {
    const acheteur = await createTestUser();
    comptes.push(acheteur);
    await query(`update public.users set nom_complet = 'Nadège Fotso' where id = $1`, [
      acheteur.id,
    ]);

    const id = await commande(acheteur.id);

    const avant = (await lister()).find((l) => l.id === id);
    expect(avant?.nom).toBe('Nadège Fotso');
    expect(avant?.email).toBe(acheteur.email);

    await query(`select public.anonymize_user($1)`, [acheteur.id]);

    const apres = (await lister()).find((l) => l.id === id);
    expect(apres, 'la commande survit : c’est une pièce comptable').toBeDefined();
    expect(apres?.acheteur_anonymise).toBe(true);
    /*
     * Le NOM est le nouveau risque : la 0089 l'ajoute à une fonction qui
     * masquait déjà le courriel. Le rendre ici recomposerait l'identité par
     * l'autre bout — et la colonne aurait l'air simplement mieux remplie.
     */
    expect(apres?.nom).toBeNull();
    expect(apres?.email).toBeNull();
  });

  it('n’est plus retrouvable par la recherche', async () => {
    const acheteur = await createTestUser();
    comptes.push(acheteur);
    await query(`update public.users set nom_complet = 'Hervé Ndongo' where id = $1`, [
      acheteur.id,
    ]);
    const id = await commande(acheteur.id);

    expect((await lister({ recherche: 'Ndongo' })).map((l) => l.id)).toContain(id);

    await query(`select public.anonymize_user($1)`, [acheteur.id]);

    /*
     * Chercher son nom après l'effacement défairait depuis un champ de
     * recherche ce que le droit à l'oubli a fait en base. La commande reste
     * atteignable par son NUMÉRO — c'est la pièce comptable, pas la personne.
     */
    expect((await lister({ recherche: 'Ndongo' })).map((l) => l.id)).not.toContain(id);

    const numero = await queryOne<{ numero: string }>(
      `select numero::text from public.orders where id = $1`,
      [id],
    );
    expect((await lister({ recherche: numero?.numero ?? '' })).map((l) => l.id)).toContain(id);
  });
});

describe('les filtres', () => {
  it('la devise ne rend que la devise demandée', async () => {
    const acheteur = await createTestUser();
    comptes.push(acheteur);
    const enEuros = await commande(acheteur.id, { devise: 'EUR' });
    const enFrancs = await commande(acheteur.id, { devise: 'XAF' });

    const ids = (await lister({ devise: 'XAF' })).map((l) => l.id);
    expect(ids).toContain(enFrancs);
    expect(ids).not.toContain(enEuros);
  });

  it('la recherche trouve par le SLUG d’une ligne de commande', async () => {
    const acheteur = await createTestUser();
    comptes.push(acheteur);

    const livre = await queryOne<{ id: string; slug: string }>(
      `select id, slug from public.books order by slug limit 1`,
    );
    expect(livre, 'le jeu de démonstration doit porter au moins un livre').toBeDefined();

    const id = await commande(acheteur.id, { bookId: livre?.id });

    const trouvees = await lister({ recherche: livre?.slug ?? '' });
    expect(trouvees.map((l) => l.id)).toContain(id);
    expect(trouvees.find((l) => l.id === id)?.premier_titre).toBe(livre?.slug);
  });
});

describe('les compteurs de segments', () => {
  async function compter(filtres: { devise?: string; recherche?: string } = {}) {
    const lignes = await query<LigneCompte>(
      `select * from public.admin_compter_commandes_par_statut($1, $2)`,
      [filtres.devise ?? null, filtres.recherche ?? null],
    );
    return new Map(lignes.map((l) => [l.statut, Number(l.nb)]));
  }

  it('rend TOUS les statuts, y compris ceux à zéro', async () => {
    /*
     * Un `group by` seul ferait disparaître le segment d'un statut jamais
     * rencontré — et l'écran perdrait un filtre au lieu de le montrer vide.
     */
    const comptages = await compter();
    for (const statut of ['en_attente', 'paye', 'echoue', 'rembourse']) {
      expect(comptages.has(statut), `segment ${statut} absent`).toBe(true);
    }
  });

  it('DIT LE MÊME NOMBRE que la liste, sur le même filtre', async () => {
    const acheteur = await createTestUser();
    comptes.push(acheteur);
    await query(`update public.users set nom_complet = 'Awa Diallo' where id = $1`, [acheteur.id]);

    await commande(acheteur.id, { statut: 'paye' });
    await commande(acheteur.id, { statut: 'paye' });
    await commande(acheteur.id, { statut: 'rembourse' });

    /*
     * Le prédicat de recherche est écrit DEUX FOIS — dans la liste et dans le
     * comptage. C'est ce test, et lui seul, qui empêche les deux copies de
     * diverger : sans lui, un segment annoncerait « Payée 2 » et le clic
     * montrerait trois lignes.
     */
    const comptages = await compter({ recherche: 'Awa Diallo' });
    for (const statut of ['paye', 'rembourse']) {
      const liste = await lister({ statut, recherche: 'Awa Diallo' });
      expect(comptages.get(statut), `désaccord sur ${statut}`).toBe(liste.length);
    }
  });

  it('suit le filtre de DEVISE, jamais celui de statut', async () => {
    const acheteur = await createTestUser();
    comptes.push(acheteur);
    await query(`update public.users set nom_complet = 'Paul Tchoumi' where id = $1`, [
      acheteur.id,
    ]);

    await commande(acheteur.id, { statut: 'paye', devise: 'XAF' });
    await commande(acheteur.id, { statut: 'echoue', devise: 'EUR' });

    const enFrancs = await compter({ devise: 'XAF', recherche: 'Paul Tchoumi' });
    expect(enFrancs.get('paye')).toBe(1);
    expect(enFrancs.get('echoue')).toBe(0);

    /*
     * Et le statut, lui, reste hors de son propre filtre : les deux lignes
     * sont comptées quel que soit le segment coché, sans quoi cocher « Payée »
     * mettrait tous les autres segments à zéro et le contrôle deviendrait un
     * cul-de-sac.
     */
    const toutes = await compter({ recherche: 'Paul Tchoumi' });
    expect(toutes.get('paye')).toBe(1);
    expect(toutes.get('echoue')).toBe(1);
  });
});

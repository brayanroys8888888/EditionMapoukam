import { afterAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';

import { GET as noticeRoute, POST as anonymiser } from '@/app/api/account/anonymize/route';
import { POST as inscrire } from '@/app/api/auth/register/route';
import { POST as connecter } from '@/app/api/auth/login/route';
import { GET as profil } from '@/app/api/auth/me/route';
import { loginRateLimiter } from '@/lib/http/rate-limit';

import { closePool, query, queryOne } from '../helpers/db';
import { corpsJson, get, postJson, type ReponseErreur } from '../helpers/http';
import { createTestUser, deleteTestUser, deleteTestUserByEmail, type TestUser } from '../helpers/users';

/**
 * Cycle de vie d'un compte, du droit à l'effacement à la purge comptable.
 *
 * Le principe éprouvé ici : le droit à l'effacement (RGPD art. 17) et les
 * obligations comptables ne s'opposent pas. L'article 17.3.b écarte
 * l'effacement lorsque la conservation répond à une obligation légale. Deux
 * périmètres coexistent donc — les données de compte, effaçables, et les
 * pièces comptables, conservées puis purgées à échéance.
 */
const aNettoyer: string[] = [];

afterAll(async () => {
  for (const email of aNettoyer) await deleteTestUserByEmail(email);
  await closePool();
});

/** Compte muni d'une commande payée, d'une facture et de données personnelles. */
async function compteAvecHistorique(): Promise<{
  utilisateur: TestUser;
  orderId: string;
  invoiceId: string;
  livreId: string;
}> {
  const utilisateur = await createTestUser();
  aNettoyer.push(utilisateur.email);

  const livre = await queryOne<{ id: string }>(
    `select id from public.books where slug = 'le-lion-et-la-souris'`,
  );
  const livreId = livre?.id ?? '';

  const commande = await queryOne<{ id: string }>(
    `insert into public.orders (user_id, montant_total, devise, zone, statut, paye_le)
     values ($1, 499, 'EUR', 'international', 'paye', public.app_now()) returning id`,
    [utilisateur.id],
  );
  const orderId = commande?.id ?? '';

  await query(
    `insert into public.order_items (order_id, book_id, langue, prix_unitaire, devise, zone)
     values ($1, $2, 'fr', 499, 'EUR', 'international')`,
    [orderId, livreId],
  );

  // Données personnelles, toutes destinées à disparaître.
  await query(
    `insert into public.entitlements (user_id, book_id, type, source_id, peut_telecharger)
     values ($1, $2, 'achat', $3, true)`,
    [utilisateur.id, livreId, orderId],
  );
  await query(
    `insert into public.reading_progress (user_id, book_id, derniere_page) values ($1, $2, 7)`,
    [utilisateur.id, livreId],
  );
  await query(
    `insert into public.download_logs (user_id, book_id, langue, format) values ($1, $2, 'fr', 'pdf')`,
    [utilisateur.id, livreId],
  );
  await query(`insert into public.favorites (user_id, book_id) values ($1, $2)`, [
    utilisateur.id,
    livreId,
  ]);
  const panier = await queryOne<{ id: string }>(
    `insert into public.carts (user_id) values ($1) returning id`,
    [utilisateur.id],
  );
  await query(
    `insert into public.cart_items (cart_id, book_id, langue) values ($1, $2, 'fr')`,
    [panier?.id, livreId],
  );

  const facture = await queryOne<{ id: string }>(
    `select id from public.emettre_facture($1, 10)`,
    [orderId],
  );

  return { utilisateur, orderId, invoiceId: facture?.id ?? '', livreId };
}

describe('plus aucune cascade depuis users', () => {
  it('n’a aucune clé étrangère vers users en on delete cascade', async () => {
    // Une cascade oubliée emporterait l'historique commercial au premier
    // effacement de compte, sans bruit.
    const cascades = await query<{ table_source: string; contrainte: string }>(`
      select src.relname as table_source, c.conname as contrainte
      from pg_constraint c
      join pg_class src on src.oid = c.conrelid
      join pg_class cible on cible.oid = c.confrelid
      join pg_namespace n on n.oid = cible.relnamespace
      where c.contype = 'f'
        and n.nspname = 'public'
        and cible.relname = 'users'
        and c.confdeltype = 'c'
      order by src.relname
    `);

    expect(cascades).toEqual([]);
  });

  it('n’attache plus public.users à auth.users', async () => {
    // C'est ce détachement qui permet de supprimer l'identité
    // d'authentification tout en conservant la ligne métier.
    const contrainte = await queryOne(`
      select 1 from pg_constraint c
      join pg_class src on src.oid = c.conrelid
      where c.contype = 'f' and src.relname = 'users' and c.conname = 'users_id_fkey'
    `);

    expect(contrainte).toBeUndefined();
  });
});

describe('factures', () => {
  it('portent leur propre copie de l’identité de facturation', async () => {
    const { utilisateur, invoiceId } = await compteAvecHistorique();
    try {
      const facture = await queryOne<{ facture_email: string; numero: string; lignes: unknown[] }>(
        `select facture_email, numero, lignes from public.invoices where id = $1`,
        [invoiceId],
      );

      expect(facture?.facture_email).toBe(utilisateur.email);
      expect(facture?.numero).toMatch(/^F-\d{4}-\d{6}$/);
      expect(facture?.lignes).toHaveLength(1);
    } finally {
      await deleteTestUser(utilisateur);
    }
  });

  it('sont immuables : toute modification est refusée par la base', async () => {
    // Imposé par un déclencheur, non par convention : une convention ne
    // survit pas à la première correction faite « juste cette fois-ci ».
    const { utilisateur, invoiceId } = await compteAvecHistorique();
    try {
      await expect(
        query(`update public.invoices set montant_ttc = 1 where id = $1`, [invoiceId]),
      ).rejects.toThrow(/immuable/i);

      await expect(
        query(`update public.invoices set facture_nom = 'Autre' where id = $1`, [invoiceId]),
      ).rejects.toThrow(/immuable/i);
    } finally {
      await deleteTestUser(utilisateur);
    }
  });

  it('sont numérotées sans trou', async () => {
    const premier = await compteAvecHistorique();
    const second = await compteAvecHistorique();
    try {
      const numeros = await query<{ numero: string }>(
        `select numero from public.invoices where id in ($1, $2) order by numero`,
        [premier.invoiceId, second.invoiceId],
      );

      const suites = numeros.map((n) => Number(n.numero.split('-')[2]));
      expect(suites[1]).toBe((suites[0] ?? 0) + 1);
    } finally {
      await deleteTestUser(premier.utilisateur);
      await deleteTestUser(second.utilisateur);
    }
  });

  it('ne s’émettent que sur une commande payée', async () => {
    const utilisateur = await createTestUser();
    try {
      const commande = await queryOne<{ id: string }>(
        `insert into public.orders (user_id, montant_total, devise, zone, statut)
         values ($1, 499, 'EUR', 'international', 'en_attente') returning id`,
        [utilisateur.id],
      );

      await expect(
        query(`select id from public.emettre_facture($1, 10)`, [commande?.id]),
      ).rejects.toThrow(/commande payée/);
    } finally {
      await deleteTestUser(utilisateur);
    }
  });
});

describe('anonymisation', () => {
  it('efface les données de compte et conserve les pièces comptables', async () => {
    const { utilisateur, orderId, invoiceId, livreId } = await compteAvecHistorique();
    try {
      await query(`select public.anonymize_user($1)`, [utilisateur.id]);

      const compte = await queryOne<{
        email: string;
        nom_complet: string | null;
        statut: string;
        anonymise_le: Date | null;
      }>(`select email, nom_complet, statut::text, anonymise_le from public.users where id = $1`, [
        utilisateur.id,
      ]);

      expect(compte?.statut).toBe('anonymise');
      expect(compte?.nom_complet).toBeNull();
      expect(compte?.anonymise_le).not.toBeNull();
      // Jeton non réversible : ni l'adresse d'origine, ni son empreinte.
      expect(compte?.email).toMatch(/^anonyme-[0-9a-f]{32}@anonymise\.invalid$/);
      expect(compte?.email).not.toContain(utilisateur.email);

      // Données personnelles supprimées définitivement.
      for (const table of ['entitlements', 'reading_progress', 'download_logs', 'favorites', 'carts']) {
        const restes = await query(`select 1 from public.${table} where user_id = $1`, [
          utilisateur.id,
        ]);
        expect({ table, restes }).toEqual({ table, restes: [] });
      }
      const lignesPanier = await query(
        `select 1 from public.cart_items ci join public.carts c on c.id = ci.cart_id where c.user_id = $1`,
        [utilisateur.id],
      );
      expect(lignesPanier).toEqual([]);

      // Pièces comptables conservées en l'état.
      expect(await query(`select 1 from public.orders where id = $1`, [orderId])).toHaveLength(1);
      expect(await query(`select 1 from public.order_items where order_id = $1`, [orderId])).toHaveLength(1);

      const facture = await queryOne<{ facture_email: string }>(
        `select facture_email from public.invoices where id = $1`,
        [invoiceId],
      );
      // La facture garde l'adresse figée à son émission : c'est ce qui la rend
      // exploitable après l'anonymisation du compte.
      expect(facture?.facture_email).toBe(utilisateur.email);

      expect(livreId.length).toBeGreaterThan(0);
    } finally {
      await deleteTestUser(utilisateur);
    }
  });

  it('laisse le chiffre d’affaires agrégé INCHANGÉ', async () => {
    // Le test qui donne son sens à toute la correction : si l'anonymisation
    // faisait bouger le chiffre d'affaires, elle détruirait de la comptabilité.
    const { utilisateur, orderId } = await compteAvecHistorique();
    try {
      const mesurer = async () =>
        queryOne<{ total: string; nb: string }>(
          `select coalesce(sum(montant_total), 0)::text as total, count(*)::text as nb
           from public.orders where statut = 'paye'`,
        );
      const mesurerFactures = async () =>
        queryOne<{ total: string; nb: string }>(
          `select coalesce(sum(montant_ttc), 0)::text as total, count(*)::text as nb
           from public.invoices`,
        );

      const avantCommandes = await mesurer();
      const avantFactures = await mesurerFactures();

      await query(`select public.anonymize_user($1)`, [utilisateur.id]);

      expect(await mesurer()).toEqual(avantCommandes);
      expect(await mesurerFactures()).toEqual(avantFactures);
      expect(orderId.length).toBeGreaterThan(0);
    } finally {
      await deleteTestUser(utilisateur);
    }
  });

  it('est idempotente', async () => {
    const { utilisateur } = await compteAvecHistorique();
    try {
      await query(`select public.anonymize_user($1)`, [utilisateur.id]);
      const premiereAdresse = await queryOne<{ email: string }>(
        `select email from public.users where id = $1`,
        [utilisateur.id],
      );

      await query(`select public.anonymize_user($1)`, [utilisateur.id]);
      const secondeAdresse = await queryOne<{ email: string }>(
        `select email from public.users where id = $1`,
        [utilisateur.id],
      );

      // Une seconde anonymisation ne doit ni échouer, ni régénérer un jeton.
      expect(secondeAdresse?.email).toBe(premiereAdresse?.email);
    } finally {
      await deleteTestUser(utilisateur);
    }
  });

  it('interdit toute réactivation du compte', async () => {
    const { utilisateur } = await compteAvecHistorique();
    try {
      await query(`select public.anonymize_user($1)`, [utilisateur.id]);

      await expect(
        query(`update public.users set statut = 'actif' where id = $1`, [utilisateur.id]),
      ).rejects.toThrow(/ne peut pas être réactivé/);
    } finally {
      await deleteTestUser(utilisateur);
    }
  });

  it('empêche la reconnexion avec les anciens identifiants', async () => {
    loginRateLimiter.vider();
    const { utilisateur } = await compteAvecHistorique();
    try {
      await query(`select public.anonymize_user($1)`, [utilisateur.id]);

      const reponse = await connecter(
        postJson('/api/auth/login', { email: utilisateur.email, password: utilisateur.password }),
      );
      expect(reponse.status).toBe(401);

      // Un jeton encore en circulation ne doit pas rouvrir le compte.
      const avecJeton = await profil(get('/api/auth/me', { jeton: utilisateur.accessToken }));
      expect(avecJeton.status).toBe(401);
    } finally {
      await deleteTestUser(utilisateur);
    }
  });

  it('libère l’ancienne adresse email pour une nouvelle inscription', async () => {
    const { utilisateur } = await compteAvecHistorique();
    const ancienneAdresse = utilisateur.email;
    try {
      await query(`select public.anonymize_user($1)`, [utilisateur.id]);

      const reponse = await inscrire(
        postJson('/api/auth/register', { email: ancienneAdresse, password: 'MotDePasse2026' }),
      );

      expect(reponse.status).toBe(201);
      // Un compte NEUF, sans lien avec l'ancien.
      const comptes = await query<{ id: string; statut: string }>(
        `select id, statut::text from public.users where email = $1`,
        [ancienneAdresse],
      );
      expect(comptes).toHaveLength(1);
      expect(comptes[0]?.statut).toBe('actif');
      expect(comptes[0]?.id).not.toBe(utilisateur.id);
    } finally {
      await deleteTestUserByEmail(ancienneAdresse);
      await deleteTestUser(utilisateur);
    }
  });
});

describe('information préalable (obligation d’information)', () => {
  it('énonce ce qui est effacé, ce qui est conservé, et pour combien de temps', async () => {
    const utilisateur = await createTestUser();
    try {
      const reponse = await noticeRoute(
        get('/api/account/anonymize', { jeton: utilisateur.accessToken }),
      );

      expect(reponse.status).toBe(200);
      const corps = await corpsJson<{
        notice: { supprime: string[]; conserve: string[]; duree: string; irreversible: string };
      }>(reponse);

      expect(corps.notice.supprime.length).toBeGreaterThan(0);
      expect(corps.notice.conserve.join(' ')).toMatch(/factures/i);
      expect(corps.notice.duree).toMatch(/10 ans/);
      expect(corps.notice.irreversible).toMatch(/irréversible/i);
    } finally {
      await deleteTestUser(utilisateur);
    }
  });

  it('exige une confirmation explicite', async () => {
    const utilisateur = await createTestUser();
    try {
      const sansConfirmation = await anonymiser(
        postJson('/api/account/anonymize', {}, { jeton: utilisateur.accessToken }),
      );

      expect(sansConfirmation.status).toBe(400);
      expect((await corpsJson<ReponseErreur>(sansConfirmation)).erreur.code).toBe('requete_invalide');

      const compte = await queryOne<{ statut: string }>(
        `select statut::text from public.users where id = $1`,
        [utilisateur.id],
      );
      expect(compte?.statut).toBe('actif');
    } finally {
      await deleteTestUser(utilisateur);
    }
  });

  it('anonymise le compte de l’appelant, et lui seul', async () => {
    const [alice, bob] = await Promise.all([createTestUser(), createTestUser()]);
    try {
      const reponse = await anonymiser(
        postJson('/api/account/anonymize', { confirmation: true }, { jeton: alice.accessToken }),
      );

      expect(reponse.status).toBe(204);

      const statuts = await query<{ id: string; statut: string }>(
        `select id, statut::text from public.users where id in ($1, $2)`,
        [alice.id, bob.id],
      );
      expect(statuts.find((s) => s.id === alice.id)?.statut).toBe('anonymise');
      expect(statuts.find((s) => s.id === bob.id)?.statut).toBe('actif');
    } finally {
      await deleteTestUser(alice);
      await deleteTestUser(bob);
    }
  });

  it('refuse un visiteur non connecté', async () => {
    const reponse = await anonymiser(postJson('/api/account/anonymize', { confirmation: true }));

    expect(reponse.status).toBe(401);
  });
});

describe('purge à échéance de conservation', () => {
  it('ne touche pas une facture encore dans sa durée de conservation', async () => {
    const { utilisateur, invoiceId } = await compteAvecHistorique();
    try {
      await query(`select * from public.purge_expired_invoices(public.app_now())`);

      expect(await query(`select 1 from public.invoices where id = $1`, [invoiceId])).toHaveLength(1);
    } finally {
      await deleteTestUser(utilisateur);
    }
  });

  it('supprime la facture échue, sa commande, puis le compte anonymisé orphelin', async () => {
    // Conserver indéfiniment est une infraction au même titre que ne pas
    // conserver assez longtemps. L'échéance est atteinte en avançant l'instant
    // passé à la fonction, jamais en attendant dix ans.
    const { utilisateur, orderId, invoiceId } = await compteAvecHistorique();
    let compteSupprime = false;
    try {
      await query(`select public.anonymize_user($1)`, [utilisateur.id]);

      const rapport = await queryOne<{
        factures_supprimees: number;
        commandes_supprimees: number;
        comptes_supprimes: number;
      }>(`select * from public.purge_expired_invoices(public.app_now() + interval '11 years')`);

      expect(rapport?.factures_supprimees).toBeGreaterThanOrEqual(1);
      expect(rapport?.commandes_supprimees).toBeGreaterThanOrEqual(1);
      expect(rapport?.comptes_supprimes).toBeGreaterThanOrEqual(1);

      expect(await query(`select 1 from public.invoices where id = $1`, [invoiceId])).toEqual([]);
      expect(await query(`select 1 from public.orders where id = $1`, [orderId])).toEqual([]);
      expect(await query(`select 1 from public.order_items where order_id = $1`, [orderId])).toEqual([]);

      const restes = await query(`select 1 from public.users where id = $1`, [utilisateur.id]);
      expect(restes).toEqual([]);
      compteSupprime = true;
    } finally {
      if (!compteSupprime) await deleteTestUser(utilisateur);
    }
  });

  it('épargne un compte encore vivant, même si sa facture est échue', async () => {
    // La purge n'efface un compte que s'il est anonymisé ET devenu orphelin.
    const { utilisateur, invoiceId } = await compteAvecHistorique();
    try {
      await query(`select * from public.purge_expired_invoices(public.app_now() + interval '11 years')`);

      expect(await query(`select 1 from public.invoices where id = $1`, [invoiceId])).toEqual([]);
      const compte = await queryOne<{ statut: string }>(
        `select statut::text from public.users where id = $1`,
        [utilisateur.id],
      );
      expect(compte?.statut).toBe('actif');
    } finally {
      await deleteTestUser(utilisateur);
    }
  });
});

describe('les statistiques ne dépendent pas de users', () => {
  it('agrège le chiffre d’affaires sans jointure sur les comptes', async () => {
    // §14 : les statistiques s'appuient sur orders et invoices, jamais sur
    // users. Un compte anonymisé ne doit donc pas les fausser.
    const { utilisateur } = await compteAvecHistorique();
    try {
      const avant = await queryOne<{ total: string }>(
        `select coalesce(sum(montant_ttc), 0)::text as total from public.invoices`,
      );

      await query(`select public.anonymize_user($1)`, [utilisateur.id]);

      const apres = await queryOne<{ total: string }>(
        `select coalesce(sum(montant_ttc), 0)::text as total from public.invoices`,
      );

      expect(apres?.total).toBe(avant?.total);
      expect(randomUUID().length).toBeGreaterThan(0);
    } finally {
      await deleteTestUser(utilisateur);
    }
  });
});

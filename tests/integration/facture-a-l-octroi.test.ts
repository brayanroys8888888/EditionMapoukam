import { afterAll, afterEach, describe, expect, it } from 'vitest';

import { closePool, query, queryOne, supprimerCommandes } from '../helpers/db';
import { createTestUser, deleteTestUser, type TestUser } from '../helpers/users';

/**
 * ╔═══════════════════════════════════════════════════════════════════════════╗
 * ║ UNE COMMANDE PAYÉE ÉMET SA FACTURE — migration 0094.                      ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LE DÉFAUT QUE CE FICHIER EMPÊCHE DE REVENIR.                            │
 * │                                                                          │
 * │ `emettre_facture` existait depuis l'étape des factures — complète,       │
 * │ testée pour elle-même — et PERSONNE ne l'appelait. Quatre commandes      │
 * │ payées, zéro facture.                                                    │
 * │                                                                          │
 * │ Rien ne le signalait. La route `GET /api/orders/{id}/invoice` répond     │
 * │ 404 pour une facture absente EXACTEMENT comme pour une commande impayée, │
 * │ et la liste d'administration rend simplement un numéro de facture nul.   │
 * │ Un client qui réclamait sa facture n'obtenait rien, et l'écran donnait   │
 * │ raison au silence.                                                       │
 * │                                                                          │
 * │ Les tests de `emettre_facture` passaient tous : ils l'appelaient         │
 * │ eux-mêmes. C'est le CHAÎNON qui manquait, et un chaînon ne se teste pas  │
 * │ en testant ses deux bouts.                                               │
 * └──────────────────────────────────────────────────────────────────────────┘
 */

const aEffacer: string[] = [];
const comptes: TestUser[] = [];

afterEach(async () => {
  if (aEffacer.length > 0) {
    // La facture retient la commande en `on delete restrict` ; le reste cascade.
    await supprimerCommandes({ ids: aEffacer });
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

/** Une commande EN ATTENTE, avec une ligne — prête à être honorée. */
async function commandeEnAttente(userId: string): Promise<string> {
  const livre = await queryOne<{ id: string }>(`select id from public.books order by slug limit 1`);
  const ligne = await queryOne<{ id: string }>(
    `insert into public.orders (user_id, montant_total, devise, zone, statut)
     values ($1, 1500, 'EUR', 'international', 'en_attente')
     returning id`,
    [userId],
  );
  const id = ligne?.id ?? '';
  aEffacer.push(id);

  await query(
    `insert into public.order_items (order_id, book_id, langue, prix_unitaire, devise, zone)
     values ($1, $2, 'fr', 1500, 'EUR', 'international')`,
    [id, livre?.id],
  );
  return id;
}

async function facturesDe(orderId: string) {
  return await query<{ numero: string; montant_ttc: string; lignes: unknown[] }>(
    `select numero, montant_ttc::text, lignes from public.invoices where order_id = $1`,
    [orderId],
  );
}

describe('l’octroi d’une commande', () => {
  it('ÉMET la facture, dans le même geste', async () => {
    const acheteur = await createTestUser();
    comptes.push(acheteur);
    const id = await commandeEnAttente(acheteur.id);

    expect(await facturesDe(id), 'aucune facture avant paiement').toHaveLength(0);

    await query(`select * from public.fulfill_order($1)`, [id]);

    const factures = await facturesDe(id);
    expect(factures, 'une commande payée SANS facture est le défaut qu’on répare').toHaveLength(1);
    expect(Number(factures[0]?.montant_ttc)).toBe(1500);
    /*
     * Les lignes sont FIGÉES dans la facture : le titre au moment de l'achat,
     * pour qu'elle reste lisible même si le catalogue évolue.
     */
    expect(factures[0]?.lignes).toHaveLength(1);
  });

  it('n’en émet pas une seconde au rejeu du webhook', async () => {
    const acheteur = await createTestUser();
    comptes.push(acheteur);
    const id = await commandeEnAttente(acheteur.id);

    await query(`select * from public.fulfill_order($1)`, [id]);
    const premier = await facturesDe(id);

    // Un prestataire réel réémet ses événements tant qu'il n'a pas eu un 200.
    const rejeu = await queryOne<{ deja_traite: boolean }>(
      `select deja_traite from public.fulfill_order($1)`,
      [id],
    );
    expect(rejeu?.deja_traite).toBe(true);

    const apres = await facturesDe(id);
    expect(apres).toHaveLength(1);
    /*
     * ET LE MÊME NUMÉRO. Un second tirage ne créerait pas seulement un
     * doublon : il consommerait une place dans une séquence comptable SANS
     * TROU, et le dégât survivrait à la suppression du doublon.
     */
    expect(apres[0]?.numero).toBe(premier[0]?.numero);
  });

  it('n’émet rien pour une commande échouée', async () => {
    const acheteur = await createTestUser();
    comptes.push(acheteur);
    const id = await commandeEnAttente(acheteur.id);

    await query(`select public.fail_order($1)`, [id]);
    expect(await facturesDe(id)).toHaveLength(0);
  });

  it('laisse la facture en place après un remboursement', async () => {
    const acheteur = await createTestUser();
    comptes.push(acheteur);
    const id = await commandeEnAttente(acheteur.id);

    await query(`select * from public.fulfill_order($1)`, [id]);
    const avant = await facturesDe(id);

    await query(`select * from public.refund_order($1)`, [id]);

    /*
     * Une facture est une pièce comptable : un remboursement ne la défait pas,
     * il s'ajoute à l'histoire. L'effacer laisserait un trou dans la séquence.
     */
    const apres = await facturesDe(id);
    expect(apres).toHaveLength(1);
    expect(apres[0]?.numero).toBe(avant[0]?.numero);
  });
});

describe('la base garantit UNE facture par commande', () => {
  it('refuse une seconde, même écrite directement', async () => {
    const acheteur = await createTestUser();
    comptes.push(acheteur);
    const id = await commandeEnAttente(acheteur.id);
    await query(`select * from public.fulfill_order($1)`, [id]);

    /*
     * Le verrou de ligne de `fulfill_order` est la protection NORMALE ; l'index
     * est la dernière ligne de défense, comme celui d'`entitlements` l'est pour
     * les droits. Ce test éprouve la seconde, en contournant la première.
     */
    await expect(
      query(
        `insert into public.invoices (numero, user_id, order_id, facture_nom, facture_email,
           lignes, montant_ht, montant_ttc, devise, zone, conservation_jusqu_au)
         select 'F-DOUBLON', user_id, id, 'X', 'x@x.test', '[]'::jsonb, 1, 1, devise, zone,
                public.app_now()
           from public.orders where id = $1`,
        [id],
      ),
    ).rejects.toThrow();
  });

  it('émettre deux fois rend la MÊME facture, sans tirer de numéro', async () => {
    const acheteur = await createTestUser();
    comptes.push(acheteur);
    const id = await commandeEnAttente(acheteur.id);
    await query(`select * from public.fulfill_order($1)`, [id]);

    const seconde = await queryOne<{ numero: string }>(
      `select (public.emettre_facture($1)).numero`,
      [id],
    );
    const factures = await facturesDe(id);
    expect(factures).toHaveLength(1);
    expect(seconde?.numero).toBe(factures[0]?.numero);
  });
});

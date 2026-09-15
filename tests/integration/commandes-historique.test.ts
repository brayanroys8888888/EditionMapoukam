import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { listerCommandesDe } from '@/lib/orders/lecture';
import { closePool, query, queryOne } from '../helpers/db';
import { createTestUser, deleteTestUser, type TestUser } from '../helpers/users';

/**
 * HISTORIQUE DES COMMANDES — `listerCommandesDe`.
 *
 * La page « Mes commandes » lisait les commandes elle-même, avec la clé de
 * service. La lecture vit désormais dans `src/lib/orders/lecture.ts`, et ce
 * fichier garde ce qui compte : un client voit SES commandes, et celles-là
 * seulement.
 *
 * Les commandes sont posées directement en base : ce qui est éprouvé ici est
 * la LECTURE, pas le tunnel de commande, qui a ses propres tests.
 */

let proprietaire: TestUser;
let autre: TestUser;
let livre: { id: string; titre_fr: string; titre_en: string | null };
let ancienne: string;
let recente: string;

async function poserCommande(user: TestUser, montant: number): Promise<string> {
  const commande = await queryOne<{ id: string }>(
    `insert into public.orders (user_id, montant_total, devise, zone)
     values ($1, $2, 'EUR', 'international') returning id`,
    [user.id, montant],
  );
  if (!commande) throw new Error('Commande non créée');

  await query(
    `insert into public.order_items (order_id, book_id, langue, prix_unitaire, devise, zone)
     values ($1, $2, 'fr', $3, 'EUR', 'international')`,
    [commande.id, livre.id, montant],
  );
  return commande.id;
}

beforeAll(async () => {
  proprietaire = await createTestUser();
  autre = await createTestUser();

  const trouve = await queryOne<{ id: string; titre_fr: string; titre_en: string | null }>(
    `select b.id, fr.titre as titre_fr, en.titre as titre_en
       from public.books b
       join public.book_translations fr on fr.book_id = b.id and fr.langue = 'fr'
       left join public.book_translations en on en.book_id = b.id and en.langue = 'en'
      order by (en.titre is null), b.slug
      limit 1`,
  );
  if (!trouve) throw new Error('Aucun titre traduit dans le jeu de démonstration');
  livre = trouve;

  ancienne = await poserCommande(proprietaire, 499);
  recente = await poserCommande(proprietaire, 799);
});

afterAll(async () => {
  // `deleteTestUser` efface aussi les commandes des comptes de test.
  await deleteTestUser(proprietaire);
  await deleteTestUser(autre);
  await closePool();
});

describe('listerCommandesDe — les commandes du client, et les siennes seulement', () => {
  it('rend les commandes du client, de la plus récente à la plus ancienne', async () => {
    const commandes = await listerCommandesDe(proprietaire.id, 'fr');
    const ids = commandes.map((c) => c.id);

    expect(ids).toEqual([recente, ancienne]);
    expect(commandes[0]).toMatchObject({ montant_total: 799, devise: 'EUR', statut: 'en_attente' });
  });

  it('ne rend JAMAIS les commandes d’un autre client', async () => {
    const commandes = await listerCommandesDe(autre.id, 'fr');

    expect(commandes.map((c) => c.id)).not.toContain(recente);
    expect(commandes.map((c) => c.id)).not.toContain(ancienne);
    expect(commandes).toEqual([]);
  });

  it('nomme chaque ligne dans la langue demandée', async () => {
    const [commande] = await listerCommandesDe(proprietaire.id, 'fr');
    expect(commande?.titres).toEqual([livre.titre_fr]);
  });

  it('se replie sur une autre langue quand la demandée manque, sans rien inventer', async () => {
    const [commande] = await listerCommandesDe(proprietaire.id, 'en');
    expect(commande?.titres).toEqual([livre.titre_en ?? livre.titre_fr]);
  });
});

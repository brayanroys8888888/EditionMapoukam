import { createServiceClient, type AppSupabaseClient } from '@/lib/supabase/clients';
import type { TitreAchetable } from '@/domain/orders/types';
import { logger } from '@/lib/logger';

/**
 * Panier — §4.2 F9.
 *
 * Un panier actif par utilisateur, créé à la volée au premier ajout. La table
 * porte une contrainte d'unicité sur `user_id` : il ne peut pas y en avoir deux.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LE PANIER NE PORTE AUCUN PRIX.                                          │
 * │                                                                          │
 * │ `cart_items` ne contient qu'un identifiant de livre et une langue. Le    │
 * │ prix n'est résolu qu'au moment de commander, en relisant `book_prices`.  │
 * │ Figer un prix dans le panier aurait créé une seconde source de vérité —  │
 * │ celle que le client voit — et l'écart entre les deux serait devenu une   │
 * │ faille commerciale plutôt qu'un simple bogue d'affichage.               │
 * └──────────────────────────────────────────────────────────────────────────┘
 */

export type RefusAjout = 'livre_introuvable' | 'non_disponible_achat' | 'deja_possede';

/** Identifiant du panier de l'utilisateur, créé si besoin. */
export async function panierDe(
  userId: string,
  options: { client?: AppSupabaseClient } = {},
): Promise<string> {
  const client = options.client ?? createServiceClient();

  const existant = await client.from('carts').select('id').eq('user_id', userId).maybeSingle();
  if (existant.data) return existant.data.id;

  // `upsert` plutôt qu'`insert` : deux onglets qui ajoutent au panier en même
  // temps déclencheraient sinon une violation d'unicité sur le second.
  const cree = await client
    .from('carts')
    .upsert({ user_id: userId }, { onConflict: 'user_id' })
    .select('id')
    .single();

  if (cree.error || !cree.data) {
    throw new Error(`Panier indisponible : ${cree.error.message}`);
  }
  return cree.data.id;
}

/**
 * Ajoute un titre au panier.
 *
 * Les refus sont vérifiés ICI, à l'ajout, en plus de l'être à la commande. Le
 * double contrôle est voulu : découvrir au moment de payer qu'un titre du
 * panier n'était pas achetable est une mauvaise expérience, et le contrôle de
 * la commande reste celui qui fait autorité.
 */
export async function ajouterAuPanier(
  userId: string,
  bookId: string,
  langue: 'fr' | 'en',
  options: { client?: AppSupabaseClient } = {},
): Promise<{ ok: true } | { ok: false; raison: RefusAjout }> {
  const client = options.client ?? createServiceClient();

  const livre = await client
    .from('books')
    .select('id, statut, disponible_achat')
    .eq('id', bookId)
    .maybeSingle();

  // Un brouillon et un identifiant inconnu se répondent pareil : sans quoi le
  // catalogue à venir serait devinable un identifiant à la fois.
  if (!livre.data || livre.data.statut !== 'publie') {
    return { ok: false, raison: 'livre_introuvable' };
  }
  if (!livre.data.disponible_achat) {
    return { ok: false, raison: 'non_disponible_achat' };
  }

  const possede = await client
    .from('entitlements')
    .select('id')
    .eq('user_id', userId)
    .eq('book_id', bookId)
    .maybeSingle();

  if (possede.data) {
    return { ok: false, raison: 'deja_possede' };
  }

  const cartId = await panierDe(userId, { client });

  // Un titre déjà présent n'est pas une erreur : le panier n'a pas de quantité,
  // un achat est perpétuel et ne s'achète qu'une fois (§3.2).
  const { error } = await client
    .from('cart_items')
    .upsert({ cart_id: cartId, book_id: bookId, langue }, { onConflict: 'cart_id,book_id' });

  if (error) {
    throw new Error(`Ajout au panier impossible : ${error.message}`);
  }

  logger.info('Titre ajouté au panier', { userId, bookId });
  return { ok: true };
}

/** Retire un titre du panier. */
export async function retirerDuPanier(
  userId: string,
  bookId: string,
  options: { client?: AppSupabaseClient } = {},
): Promise<boolean> {
  const client = options.client ?? createServiceClient();
  const cartId = await panierDe(userId, { client });

  const { error, count } = await client
    .from('cart_items')
    .delete({ count: 'exact' })
    .eq('cart_id', cartId)
    .eq('book_id', bookId);

  if (error) {
    throw new Error(`Retrait du panier impossible : ${error.message}`);
  }
  return (count ?? 0) > 0;
}

/** Vide le panier. */
export async function viderPanier(
  userId: string,
  options: { client?: AppSupabaseClient } = {},
): Promise<void> {
  const client = options.client ?? createServiceClient();
  const cartId = await panierDe(userId, { client });

  const { error } = await client.from('cart_items').delete().eq('cart_id', cartId);
  if (error) {
    throw new Error(`Vidage du panier impossible : ${error.message}`);
  }
}

/**
 * Contenu du panier, prêt à être tarifé.
 *
 * Le titre affiché est celui de la version linguistique choisie à l'ajout. La
 * langue reste INFORMATIVE : elle ne conditionne aucun droit (D2 point 2).
 */
export async function titresDuPanier(
  userId: string,
  options: { client?: AppSupabaseClient } = {},
): Promise<TitreAchetable[]> {
  const client = options.client ?? createServiceClient();
  const cartId = await panierDe(userId, { client });

  const { data, error } = await client
    .from('cart_items')
    .select(
      `book_id, langue, ajoute_le,
       books!inner(id, statut, disponible_achat,
                   book_prices(zone, montant, devise),
                   book_translations(langue, titre, statut))`,
    )
    .eq('cart_id', cartId)
    .order('ajoute_le', { ascending: true });

  if (error) {
    throw new Error(`Panier illisible : ${error.message}`);
  }
  if (!data || data.length === 0) return [];

  // Une seule requête pour tous les droits, plutôt qu'une par ligne : un panier
  // de dix titres ferait sinon dix allers-retours.
  const possedes = await client
    .from('entitlements')
    .select('book_id')
    .eq('user_id', userId)
    .in(
      'book_id',
      data.map((ligne) => ligne.book_id),
    );

  const dejaPossedes = new Set((possedes.data ?? []).map((e) => e.book_id));

  return data.map((ligne) => {
    const traductions = ligne.books.book_translations;
    const choisie =
      traductions.find((t) => t.langue === ligne.langue && t.statut === 'publie') ??
      traductions.find((t) => t.statut === 'publie');

    return {
      bookId: ligne.book_id,
      // Repli sur l'identifiant plutôt que sur une chaîne vide : un panier dont
      // une ligne s'afficherait sans nom serait incompréhensible.
      titre: choisie?.titre ?? ligne.book_id,
      langue: ligne.langue as 'fr' | 'en',
      disponibleAchat: ligne.books.disponible_achat,
      publie: ligne.books.statut === 'publie',
      dejaPossede: dejaPossedes.has(ligne.book_id),
      // `zone` est déjà typée par l'énumération générée depuis le schéma :
      // aucune conversion n'est nécessaire, et en écrire une masquerait un
      // futur écart entre le type de la base et celui du domaine.
      prix: ligne.books.book_prices.map((p) => ({
        zone: p.zone,
        montant: p.montant,
        devise: p.devise,
      })),
    };
  });
}

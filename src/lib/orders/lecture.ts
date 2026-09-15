import type { AppSupabaseClient } from '@/lib/supabase/clients';
import { createServiceClient } from '@/lib/supabase/clients';
import { urlsCouverture } from '@/lib/storage/covers';

/**
 * Lecture d'une commande, pour son propriétaire et pour lui seul.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LE FILTRE SUR `user_id` EST DANS LA REQUÊTE, JAMAIS APRÈS.              │
 * │                                                                          │
 * │ La commande d'autrui n'est donc jamais chargée : elle rend `null`,       │
 * │ exactement comme un identifiant inconnu. L'appelant produit un 404, et   │
 * │ non un 403 — un 403 confirmerait que la commande existe, ce qui suffit à │
 * │ savoir qu'une personne a acheté quelque chose.                           │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Extrait ici parce que la PAGE de règlement en a besoin autant que la route :
 * un test d'architecture interdit la clé de service hors de `src/app/api`, et
 * recopier la requête dans l'écran aurait fini par y oublier le filtre.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ POURQUOI LES LIGNES SONT LUES ICI, ET PAS DANS L'ÉCRAN.                 │
 * │                                                                          │
 * │ Le récapitulatif du prototype montre les titres, leurs couvertures et    │
 * │ leurs prix — pas seulement un montant. Sans eux, la colonne de droite    │
 * │ dit « 16,97 € » sans dire de quoi, au moment précis où l'on hésite.      │
 * │                                                                          │
 * │ Trois lectures, jamais une par ligne : la commande, les traductions, les │
 * │ couvertures. Aucune ne rouvre un droit — l'utilisateur a lui-même passé  │
 * │ cette commande, et le filtre `user_id` ci-dessus l'a déjà prouvé.        │
 * └──────────────────────────────────────────────────────────────────────────┘
 */

/** Une ligne de commande, prête à être dessinée. */
export interface LigneCommandeLue {
  livre_id: string;
  langue: string;
  /** `null` quand la traduction achetée a disparu depuis — jamais une invention. */
  titre: string | null;
  slug: string | null;
  couverture: string | null;
  age_min: number | null;
  age_max: number | null;
  nb_pages: number | null;
  /**
   * LE PRIX PAYÉ, EN ENTIER, ET IL RESTE UN ENTIER.
   *
   * Sa mise en forme appartient à `formateur(lireDevise(...))`, côté serveur :
   * le franc CFA n'a pas de sous-unité, et une division par cent écrite dans
   * un écran multiplierait l'erreur par cent sur une zone entière.
   */
  prix_unitaire: number;
}

export interface CommandeLue {
  id: string;
  montant_total: number;
  devise: string;
  statut: string;
  /** Zéro quand aucun code promotionnel n'a été retenu. */
  remise: number;
  lignes: readonly LigneCommandeLue[];
}

/** Titre, slug, couverture et pagination de chaque (livre, langue) commandé. */
async function detailDesLignes(
  client: AppSupabaseClient,
  livres: readonly string[],
): Promise<Map<string, Omit<LigneCommandeLue, 'livre_id' | 'langue' | 'prix_unitaire'>>> {
  const resultat = new Map<string, Omit<LigneCommandeLue, 'livre_id' | 'langue' | 'prix_unitaire'>>();
  if (livres.length === 0) return resultat;

  /*
   * La pagination vit sur `book_translations` et non sur `books` : deux
   * versions linguistiques d'un même conte n'ont pas forcément le même nombre
   * de pages. La clé combine donc le livre ET la langue — un même conte acheté
   * en français et en anglais est deux lignes, avec deux titres.
   */
  const { data } = await client
    .from('book_translations')
    .select('book_id, langue, titre, nb_pages, books(slug, couverture_jeton, age_min, age_max)')
    .in('book_id', [...livres]);

  for (const ligne of data ?? []) {
    const livre = ligne.books as unknown as {
      slug: string;
      couverture_jeton: string | null;
      age_min: number | null;
      age_max: number | null;
    } | null;
    if (!livre) continue;

    resultat.set(`${ligne.book_id}:${ligne.langue}`, {
      titre: ligne.titre,
      slug: livre.slug,
      // `urlsCouverture` est le SEUL endroit qui connaisse la convention de
      // chemin — la reconstituer ici la ferait vivre à deux endroits.
      couverture: urlsCouverture(livre.couverture_jeton)?.vignette ?? null,
      age_min: livre.age_min,
      age_max: livre.age_max,
      nb_pages: ligne.nb_pages,
    });
  }

  return resultat;
}

const DETAIL_ABSENT = {
  titre: null,
  slug: null,
  couverture: null,
  age_min: null,
  age_max: null,
  nb_pages: null,
} as const;

export async function lireCommandeDe(
  userId: string,
  commandeId: string,
  options: { client?: AppSupabaseClient } = {},
): Promise<CommandeLue | null> {
  const client = options.client ?? createServiceClient();

  const { data } = await client
    .from('orders')
    .select('id, montant_total, devise, statut, remise, order_items(book_id, langue, prix_unitaire)')
    .eq('id', commandeId)
    .eq('user_id', userId)
    .maybeSingle();

  if (!data) return null;

  const details = await detailDesLignes(
    client,
    data.order_items.map((ligne) => ligne.book_id),
  );

  return {
    id: data.id,
    montant_total: data.montant_total,
    devise: data.devise,
    statut: data.statut,
    remise: data.remise,
    lignes: data.order_items.map((ligne) => ({
      livre_id: ligne.book_id,
      langue: ligne.langue,
      prix_unitaire: ligne.prix_unitaire,
      ...(details.get(`${ligne.book_id}:${ligne.langue}`) ?? DETAIL_ABSENT),
    })),
  };
}

/** Une commande de l'historique du client, prête à être dessinée. */
export interface CommandeHistorique {
  id: string;
  cree_le: string;
  montant_total: number;
  devise: string;
  statut: string;
  prestataire: string;
  /**
   * Un titre par ligne, dans la langue demandée quand elle existe, sinon dans
   * une autre. `null` quand aucune traduction ne subsiste — jamais une invention.
   */
  titres: (string | null)[];
}

/**
 * L'historique des commandes d'un client, de la plus récente à la plus ancienne.
 *
 * Même garde que `lireCommandeDe` : le filtre `user_id` est DANS la requête,
 * et les commandes d'autrui ne sont jamais chargées. Deux lectures, jamais une
 * par commande : les commandes, puis les titres de tous leurs livres.
 */
export async function listerCommandesDe(
  userId: string,
  langue: string,
  options: { client?: AppSupabaseClient } = {},
): Promise<CommandeHistorique[]> {
  const client = options.client ?? createServiceClient();

  const { data } = await client
    .from('orders')
    .select('id, cree_le, montant_total, devise, statut, prestataire, order_items(book_id)')
    .eq('user_id', userId)
    .order('cree_le', { ascending: false });

  const commandes = data ?? [];
  const livres = [...new Set(commandes.flatMap((c) => c.order_items.map((ligne) => ligne.book_id)))];

  const titres = new Map<string, string | null>();
  if (livres.length > 0) {
    const { data: traductions } = await client
      .from('book_translations')
      .select('book_id, langue, titre')
      .in('book_id', livres);

    for (const traduction of traductions ?? []) {
      // La langue demandée l'emporte ; à défaut, la première trouvée.
      if (traduction.langue === langue || !titres.has(traduction.book_id)) {
        titres.set(traduction.book_id, traduction.titre);
      }
    }
  }

  return commandes.map((c) => ({
    id: c.id,
    cree_le: c.cree_le,
    montant_total: c.montant_total,
    devise: c.devise,
    statut: c.statut,
    prestataire: c.prestataire,
    titres: c.order_items.map((ligne) => titres.get(ligne.book_id) ?? null),
  }));
}

import { createServiceClient } from '@/lib/supabase/clients';
import type { AppSupabaseClient } from '@/lib/supabase/clients';
import { ACCES_REFUSE, type AccessDecision, type AccessDecisionParLivre } from '@/domain/access/types';

/**
 * Appelant typé du moteur de droits.
 *
 * Ce module NE DÉCIDE RIEN. Il appelle la fonction PostgreSQL `access_for_books`
 * et traduit sa réponse en types TypeScript. Toute règle écrite ici serait un
 * doublon de la base, donc une divergence en puissance — et la divergence
 * porterait sur qui a le droit de lire quoi.
 *
 * L'appel se fait avec le rôle de service, parce que la fonction doit lire
 * `entitlements` et `subscriptions` pour le compte d'un utilisateur qui n'a pas
 * le droit de les lire lui-même. C'est cohérent avec CLAUDE.md règle 4 : c'est
 * le SERVEUR qui vérifie les droits, à chaque requête.
 */
interface LigneAcces {
  book_id: string;
  can_read: boolean;
  can_download: boolean;
  reason: AccessDecision['reason'];
}

/**
 * Droits d'un utilisateur sur plusieurs titres, en UNE seule requête.
 *
 * À privilégier systématiquement dès qu'il y a plus d'un titre : l'affichage
 * d'un catalogue de 40 contes ne doit pas déclencher 40 allers-retours.
 *
 * @param userId `null` pour un visiteur non connecté — chemin nominal, testé.
 */
export async function getAccessForBooks(
  userId: string | null,
  bookIds: readonly string[],
  options: { client?: AppSupabaseClient; at?: Date } = {},
): Promise<Map<string, AccessDecision>> {
  const resultat = new Map<string, AccessDecision>();
  if (bookIds.length === 0) return resultat;

  const client = options.client ?? createServiceClient();

  // Le générateur de types de Supabase déclare `p_user` non nullable, alors
  // que le paramètre SQL accepte NULL — c'est même le chemin nominal du
  // visiteur non connecté, et il est testé. La conversion assume cet écart
  // entre le type généré et la signature réelle de la fonction.
  const arguments_ = {
    p_user: userId,
    p_books: [...bookIds],
    ...(options.at ? { p_at: options.at.toISOString() } : {}),
  } as unknown as { p_user: string; p_books: string[] };

  const { data, error } = await client.rpc('access_for_books', arguments_);

  if (error) {
    // Un moteur de droits en échec ne doit jamais « ouvrir par défaut » : on
    // laisse remonter l'erreur plutôt que de renvoyer un accès permissif.
    throw new Error(`Résolution des droits impossible : ${error.message}`);
  }

  for (const ligne of (data ?? []) as LigneAcces[]) {
    resultat.set(ligne.book_id, {
      canRead: ligne.can_read,
      canDownload: ligne.can_download,
      reason: ligne.reason,
    });
  }
  return resultat;
}

/**
 * Droits d'un utilisateur sur un titre.
 *
 * Un identifiant inconnu renvoie le refus le plus net plutôt qu'une erreur :
 * du point de vue de l'appelant, un livre inexistant et un livre interdit se
 * ressemblent, et c'est très bien ainsi.
 */
export async function getAccess(
  userId: string | null,
  bookId: string,
  options: { client?: AppSupabaseClient; at?: Date } = {},
): Promise<AccessDecision> {
  const decisions = await getAccessForBooks(userId, [bookId], options);
  return decisions.get(bookId) ?? ACCES_REFUSE;
}

/** Variante ordonnée, pratique pour construire une réponse de catalogue. */
export async function getAccessListe(
  userId: string | null,
  bookIds: readonly string[],
  options: { client?: AppSupabaseClient; at?: Date } = {},
): Promise<AccessDecisionParLivre[]> {
  const decisions = await getAccessForBooks(userId, bookIds, options);
  return bookIds.map((bookId) => ({
    bookId,
    ...(decisions.get(bookId) ?? ACCES_REFUSE),
  }));
}

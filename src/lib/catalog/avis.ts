import { createAnonClient, createUserClient } from '@/lib/supabase/clients';
import { logger } from '@/lib/logger';

/**
 * LES AVIS D'UN TITRE, POUR UN ÉCRAN RENDU CÔTÉ SERVEUR.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ POURQUOI CE MODULE PLUTÔT QU'UN APPEL À `/api/books/[id]/reviews`.      │
 * │                                                                          │
 * │ La fiche est rendue sur le serveur. Passer par sa propre route HTTP y    │
 * │ ajouterait un aller-retour réseau complet — sur une machine où le        │
 * │ public visé est décrit comme « en Afrique francophone sur connexion      │
 * │ lente », c'est du temps offert pour rien.                                │
 * │                                                                          │
 * │ Ce qui compte, c'est que la RÈGLE reste la même : ce module interroge la │
 * │ table avec le JETON DE L'APPELANT, exactement comme la route. Les deux   │
 * │ politiques de lecture de `book_reviews` s'appliquent donc à l'identique, │
 * │ et aucun `where` écrit ici ne décide de ce qui est visible.              │
 * │                                                                          │
 * │ La clé de service n'entre pas dans ce fichier. Elle contournerait RLS,   │
 * │ c'est-à-dire la seule chose qui protège les avis en attente.             │
 * └──────────────────────────────────────────────────────────────────────────┘
 */

/** Un avis publié, tel que la fiche l'affiche. */
export interface AvisPublie {
  id: string;
  note: number;
  texte: string;
  auteur: string;
  cree_le: string;
}

/**
 * L'avis de l'appelant, quel que soit son statut.
 *
 * `statut` est rendu tel quel : c'est lui qui fait dire « en attente de
 * validation » plutôt que de laisser croire l'avis perdu.
 */
export interface AvisPropre extends AvisPublie {
  statut: string;
  motif_rejet: string | null;
}

export interface AvisDuLivre {
  publies: AvisPublie[];
  moyenne: number | null;
  mien: AvisPropre | null;
}

const VIDE: AvisDuLivre = { publies: [], moyenne: null, mien: null };

/** Combien d'avis la fiche affiche au plus. Au-delà, la page devient un forum. */
const PLAFOND = 50;

/**
 * Les avis d'un titre.
 *
 * Ne lève jamais : une fiche doit s'afficher même sans ses avis. Une section
 * absente vaut mieux qu'une page en erreur sur un titre qu'on veut vendre.
 */
export async function lireAvis(
  bookId: string,
  appelant: { id: string; accessToken: string } | null,
): Promise<AvisDuLivre> {
  const client = appelant ? createUserClient(appelant.accessToken) : createAnonClient();

  const { data, error } = await client
    .from('book_reviews')
    .select('id, book_id, note, texte, auteur_affiche, statut, cree_le')
    .eq('book_id', bookId)
    .order('cree_le', { ascending: false })
    .limit(PLAFOND);

  if (error) {
    logger.error('Avis illisibles', { detail: error.message });
    return VIDE;
  }

  const lignes = (data ?? []) as unknown as {
    id: string;
    note: number;
    texte: string;
    auteur_affiche: string;
    statut: string;
    cree_le: string;
  }[];

  const publies = lignes
    .filter((ligne) => ligne.statut === 'publie')
    .map((ligne) => ({
      id: ligne.id,
      note: ligne.note,
      texte: ligne.texte,
      auteur: ligne.auteur_affiche,
      cree_le: ligne.cree_le,
    }));

  /*
   * L'avis de l'appelant est demandé À PART.
   *
   * `user_id` n'est pas dans les colonnes lisibles par `anon` : la requête
   * ci-dessus ne peut donc pas porter la marque qui permettrait de le
   * reconnaître. Le déduire par élimination ne marcherait que tant qu'il est
   * en attente, et le perdrait dès qu'il est publié — c'est-à-dire au moment
   * précis où son auteur veut le corriger.
   */
  let mien: AvisPropre | null = null;

  if (appelant) {
    const { data: propre } = await client
      .from('book_reviews')
      .select('id, note, texte, auteur_affiche, statut, cree_le, motif_rejet')
      .eq('book_id', bookId)
      .eq('user_id', appelant.id)
      .maybeSingle();

    if (propre) {
      mien = {
        id: propre.id,
        note: propre.note,
        texte: propre.texte,
        auteur: propre.auteur_affiche,
        statut: propre.statut,
        cree_le: propre.cree_le,
        motif_rejet: propre.motif_rejet,
      };
    }
  }

  return {
    publies,
    /*
     * La moyenne est calculée sur les avis DÉJÀ RENDUS, plutôt que demandée à
     * `book_review_summary`. Les deux compteraient les mêmes lignes ; un
     * second aller-retour pour un résultat en main n'achèterait rien.
     *
     * Arrondie au dixième, comme elle s'affiche — « 4,3 » et non
     * « 4,333333 ». L'arrondi est de la PRÉSENTATION, et il est fait une fois
     * ici plutôt que dans chacun des deux thèmes.
     */
    moyenne:
      publies.length > 0
        ? Math.round(
            (publies.reduce((somme, avis) => somme + avis.note, 0) / publies.length) * 10,
          ) / 10
        : null,
    mien,
  };
}

import { z } from 'zod';

import { identifierAppelant, requireUser } from '@/lib/auth/session';
import { created, errors, noContent, ok } from '@/lib/http/responses';
import { parseJsonBody } from '@/lib/http/validate';
import { createAnonClient, createUserClient } from '@/lib/supabase/clients';
import { logger } from '@/lib/logger';

/**
 * LES AVIS DES LECTEURS SUR UN TITRE — migration 0072.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LA DEUXIÈME ROUTE DU PROJET À PASSER PAR LE CLIENT DE L'UTILISATEUR.    │
 * │                                                                          │
 * │ Elle suit `api/favorites` mot pour mot, et pour la même raison :          │
 * │ `book_reviews` porte des politiques RLS propriétaires — `user_id =        │
 * │ auth.uid()` en écriture, en correction et en retrait. En interrogeant la  │
 * │ table avec le JETON DE L'APPELANT, l'isolation est appliquée PAR LA       │
 * │ BASE, et non par un `where` que ce fichier pourrait oublier au prochain   │
 * │ remaniement.                                                             │
 * │                                                                          │
 * │ La clé de service n'apparaît nulle part ici. Elle serait plus commode —   │
 * │ et elle contournerait précisément ce qui protège les avis les uns des     │
 * │ autres.                                                                  │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ QUI A LE DROIT D'ÉCRIRE UN AVIS N'EST PAS DÉCIDÉ ICI.                   │
 * │                                                                          │
 * │ La politique `book_reviews_ecriture` l'exige : titre publié, et           │
 * │ `(access_for(uid, book_id)).can_read`. C'est l'UNIQUE implémentation du   │
 * │ droit de lire, celle qu'appellent déjà la lecture en ligne et le          │
 * │ téléchargement. Le refus arrive donc de la base, pas d'un test recopié.   │
 * │                                                                          │
 * │ Cette route ne fait que TRANSPORTER : elle valide la forme avec Zod, et   │
 * │ traduit un refus en réponse HTTP.                                        │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Le statut n'est jamais transmis : il n'est ni dans les schémas ci-dessous,
 * ni dans les privilèges de colonne accordés à `authenticated`. Un avis naît
 * `en_attente`, et seule l'administration le publie.
 */

/** Les bornes viennent des contraintes SQL, à l'identique. */
const NOTE_MIN = 1;
const NOTE_MAX = 5;
const TEXTE_MIN = 10;
const TEXTE_MAX = 2000;
const AUTEUR_MAX = 60;

const depotSchema = z.object({
  note: z.int().min(NOTE_MIN).max(NOTE_MAX),
  texte: z.string().trim().min(TEXTE_MIN).max(TEXTE_MAX),
  /**
   * Le nom AFFICHÉ, choisi par l'auteur — « Sophie D. », « Une maman ».
   *
   * Il n'est pas déduit du compte : l'adresse électronique est une donnée
   * personnelle, et le prénom du profil n'a jamais été donné pour être publié
   * sous un avis lisible par tout le monde.
   */
  auteur_affiche: z.string().trim().min(1).max(AUTEUR_MAX),
});

/** La correction porte sur les mêmes champs — et sur eux seuls. */
const correctionSchema = depotSchema.partial().refine(
  (v) => v.note !== undefined || v.texte !== undefined || v.auteur_affiche !== undefined,
  { message: 'Aucun champ à modifier.', path: ['texte'] },
);

interface LigneAvis {
  id: string;
  book_id: string;
  note: number;
  texte: string;
  auteur_affiche: string;
  statut: string;
  cree_le: string;
}

/**
 * Les avis d'un titre.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ PUBLIQUE, MAIS PAS AVEUGLE À QUI DEMANDE.                               │
 * │                                                                          │
 * │ Un visiteur non connecté lit les avis PUBLIÉS. Un lecteur connecté lit    │
 * │ les mêmes, PLUS le sien quel que soit son statut : c'est ainsi qu'il voit │
 * │ « en attente de validation » au lieu de croire son avis perdu.           │
 * │                                                                          │
 * │ Aucune de ces deux règles n'est écrite ici. Elles sont les deux           │
 * │ politiques de lecture de la table, et il suffit d'interroger la base avec │
 * │ le bon client pour que la bonne s'applique.                              │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export async function GET(
  request: Request,
  contexte: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await contexte.params;
  if (!z.uuid().safeParse(id).success) return errors.introuvable();

  const appelant = await identifierAppelant(request);
  const client = appelant ? createUserClient(appelant.accessToken) : createAnonClient();

  const { data, error } = await client
    .from('book_reviews')
    .select('id, book_id, note, texte, auteur_affiche, statut, cree_le')
    .eq('book_id', id)
    .order('cree_le', { ascending: false })
    .limit(100);

  if (error) {
    logger.error('Avis illisibles', { detail: error.message });
    return errors.interne(error.message);
  }

  const lignes = (data ?? []) as unknown as LigneAvis[];
  const publies = lignes.filter((ligne) => ligne.statut === 'publie');

  /*
   * L'avis DE L'APPELANT, demandé À PART.
   *
   * Il serait tentant de le retrouver dans la liste ci-dessus — la politique
   * `book_reviews_lecture_propre` l'y a mis. Mais `user_id` n'est pas dans les
   * colonnes lisibles par `anon`, et la requête publique ne peut donc pas
   * porter la seule marque qui permettrait de le reconnaître. Le chercher par
   * élimination ne marcherait que tant qu'il est en attente, et perdrait le
   * sien dès qu'il est publié — c'est-à-dire au moment où il veut le corriger.
   */
  const mien = appelant
    ? (
        await client
          .from('book_reviews')
          .select('id, book_id, note, texte, auteur_affiche, statut, cree_le')
          .eq('book_id', id)
          .eq('user_id', appelant.id)
          .maybeSingle()
      ).data
    : null;

  return ok({
    avis: publies.map((ligne) => ({
      id: ligne.id,
      note: ligne.note,
      texte: ligne.texte,
      auteur: ligne.auteur_affiche,
      cree_le: ligne.cree_le,
    })),
    /*
     * La MOYENNE est recalculée sur ce que la base a rendu, et non demandée à
     * `book_review_summary` : les deux compteraient les mêmes lignes, et un
     * second aller-retour pour un résultat déjà en main serait du temps
     * d'attente offert à une connexion lente.
     */
    synthese:
      publies.length > 0
        ? {
            nombre: publies.length,
            moyenne:
              Math.round(
                (publies.reduce((somme, ligne) => somme + ligne.note, 0) / publies.length) * 10,
              ) / 10,
          }
        : null,
    /*
     * L'avis de l'appelant est rendu À PART plutôt que mêlé à la liste :
     * l'écran en fait autre chose. Il y attache un formulaire, un état de
     * modération et un bouton de retrait, là où les autres avis ne sont que du
     * texte.
     */
    mien: mien
      ? {
          id: mien.id,
          note: mien.note,
          texte: mien.texte,
          auteur: mien.auteur_affiche,
          statut: mien.statut,
          cree_le: mien.cree_le,
        }
      : null,
  });
}

export async function POST(
  request: Request,
  contexte: { params: Promise<{ id: string }> },
): Promise<Response> {
  const garde = await requireUser(request);
  if (!garde.ok) return garde.response;

  const { id } = await contexte.params;
  if (!z.uuid().safeParse(id).success) return errors.introuvable();

  const corps = await parseJsonBody(request, depotSchema);
  if (!corps.ok) return corps.response;

  const client = createUserClient(garde.appelant.accessToken);

  /*
   * L'EXISTENCE EST VÉRIFIÉE, PLUTÔT QUE DÉDUITE D'UN CODE D'ERREUR.
   *
   * Même raison qu'aux favoris : un titre inconnu violerait la clé étrangère,
   * et traduire ce code en 404 ferait dépendre une réponse HTTP du pilote
   * PostgREST, qui ne le garantit pas.
   */
  const livre = await client
    .from('books')
    .select('id')
    .eq('id', id)
    .eq('statut', 'publie')
    .maybeSingle();

  if (!livre.data) return errors.introuvable();

  // `user_id` vient de la SESSION, jamais du corps. La politique le
  // revérifierait — et c'est bien pour cela qu'on la laisse faire.
  const { error } = await client.from('book_reviews').insert({
    book_id: id,
    user_id: garde.appelant.id,
    note: corps.data.note,
    texte: corps.data.texte,
    auteur_affiche: corps.data.auteur_affiche,
  });

  if (error) {
    /*
     * Deux refus attendus, et une panne.
     *
     * `23505` est l'unicité `(book_id, user_id)` : un lecteur n'a qu'un avis
     * par titre, et le second passe par `PATCH`. `42501` est le refus de la
     * politique — le titre n'est pas lisible par ce compte. Aucun des deux
     * n'est une erreur du serveur, et les rendre en 500 ferait lire « panne »
     * à un lecteur qui a simplement cliqué deux fois.
     */
    if (error.code === '23505') {
      return errors.validation({ _: ['Vous avez déjà donné votre avis sur ce titre.'] });
    }
    if (error.code === '42501') return errors.interdit();

    logger.error('Dépôt d’avis impossible', { detail: error.message });
    return errors.interne(error.message);
  }

  return created({ depose: true });
}

/**
 * Corriger son propre avis.
 *
 * Le déclencheur `book_reviews_remise_en_moderation` le repasse en attente dès
 * que le contenu change : un avis validé puis réécrit ne reste pas publié avec
 * un texte que personne n'a relu.
 */
export async function PATCH(
  request: Request,
  contexte: { params: Promise<{ id: string }> },
): Promise<Response> {
  const garde = await requireUser(request);
  if (!garde.ok) return garde.response;

  const { id } = await contexte.params;
  if (!z.uuid().safeParse(id).success) return errors.introuvable();

  const corps = await parseJsonBody(request, correctionSchema);
  if (!corps.ok) return corps.response;

  const client = createUserClient(garde.appelant.accessToken);

  // Ni `eq('user_id', …)` ni `eq('statut', …)` : la politique de correction
  // limite déjà les lignes atteignables à celles de l'appelant, et les
  // privilèges de colonne limitent les champs. Le redire ici ferait une
  // seconde implémentation d'une règle qui en a déjà une.
  const { data, error } = await client
    .from('book_reviews')
    .update({
      ...(corps.data.note !== undefined ? { note: corps.data.note } : {}),
      ...(corps.data.texte !== undefined ? { texte: corps.data.texte } : {}),
      ...(corps.data.auteur_affiche !== undefined
        ? { auteur_affiche: corps.data.auteur_affiche }
        : {}),
    })
    .eq('book_id', id)
    .select('id')
    .maybeSingle();

  if (error) {
    logger.error('Correction d’avis impossible', { detail: error.message });
    return errors.interne(error.message);
  }

  // Aucune ligne touchée : l'appelant n'a pas d'avis sur ce titre. C'est un
  // 404, pas un 403 — dire « il existe mais il n'est pas à vous » apprendrait
  // quelque chose sur l'avis de quelqu'un d'autre.
  if (!data) return errors.introuvable();

  return ok({ corrige: true });
}

/** Retirer son avis — un droit, y compris une fois publié. */
export async function DELETE(
  request: Request,
  contexte: { params: Promise<{ id: string }> },
): Promise<Response> {
  const garde = await requireUser(request);
  if (!garde.ok) return garde.response;

  const { id } = await contexte.params;
  if (!z.uuid().safeParse(id).success) return errors.introuvable();

  const client = createUserClient(garde.appelant.accessToken);

  const { error } = await client.from('book_reviews').delete().eq('book_id', id);

  if (error) {
    logger.error('Retrait d’avis impossible', { detail: error.message });
    return errors.interne(error.message);
  }

  // Idempotent : retirer deux fois le même avis n'est pas une erreur.
  return noContent();
}

import { z } from 'zod';

import { gardeAdmin, refusEnReponse } from '@/lib/admin/route-helpers';
import { modererAvis, supprimerAvis } from '@/lib/admin/service';
import { errors, fail, noContent, ok } from '@/lib/http/responses';
import { parseJsonBody } from '@/lib/http/validate';

/**
 * MODÉRER UN AVIS — migration 0072.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ PUBLIER, REFUSER, SUPPRIMER — TROIS GESTES QUI NE SE VALENT PAS.        │
 * │                                                                          │
 * │ `publie` fait paraître l'avis sur la fiche du titre.                      │
 * │                                                                          │
 * │ `rejete` ne le fait PAS disparaître pour son auteur : il le revoit sur la │
 * │ fiche, avec le motif, et peut le corriger — la correction le remet        │
 * │ automatiquement en attente, par un déclencheur, sans qu'aucun écran ait   │
 * │ à y penser. C'est ce qui distingue un refus d'un effacement silencieux.   │
 * │                                                                          │
 * │ `DELETE` efface. L'auteur peut alors en écrire un nouveau, ce que         │
 * │ l'unicité `(book_id, user_id)` lui interdisait tant que le premier        │
 * │ existait. À réserver aux contenus qu'on ne veut pas garder du tout.       │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ L'ACTEUR VIENT DE LA SESSION, JAMAIS DU CORPS.                          │
 * │                                                                          │
 * │ `garde.acteur.id` est le premier paramètre des deux fonctions `admin_*`,  │
 * │ et `admin_poser_acteur` y revérifie le rôle EN BASE. Le corps de la       │
 * │ requête ne porte que la décision et son motif.                            │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
/*
 * Deux valeurs, et non trois : `admin_moderer_avis` REFUSE `en_attente`, au
 * motif que moderer un avis, c'est le publier ou le refuser — pas le reposer
 * sur la pile. Le schema dit ici la meme chose que la base, non pour la
 * rejouer, mais pour que le refus arrive en 400 nomme plutot qu'en 422
 * generique. La regle, elle, n'a qu'une implementation, et elle est en base.
 */
const decisionSchema = z.object({
  decision: z.enum(['publie', 'rejete']),
  // Le motif est RENDU À L'AUTEUR sur la fiche : c'est un message, pas une note
  // interne. La base l'efface d'elle-même quand un avis repasse en `publie`.
  motif: z.string().trim().max(500).nullable().default(null),
});

export async function PATCH(
  request: Request,
  contexte: { params: Promise<{ id: string }> },
): Promise<Response> {
  const garde = await gardeAdmin(request);
  if (!garde.ok) return garde.response;

  const corps = await parseJsonBody(request, decisionSchema);
  if (!corps.ok) return corps.response;

  const { id } = await contexte.params;
  if (!z.uuid().safeParse(id).success) return errors.introuvable();

  const resultat = await modererAvis(garde.acteur.id, id, corps.data.decision, corps.data.motif);

  if (!resultat.ok) {
    /*
     * `admin_moderer_avis` n'a plus qu'une règle métier à opposer, la décision
     * étant déjà bornée à deux valeurs par le schéma : un refus sans motif. On
     * le NOMME plutôt que de rendre « refusé par une règle métier », qui
     * laisserait l'éditeur chercher laquelle.
     */
    if (resultat.raison === 'regle_metier') {
      return fail(422, {
        code: 'motif_de_refus_requis',
        message: 'Un refus doit porter son motif : il est rendu à son auteur.',
      });
    }
    return refusEnReponse(resultat.raison);
  }

  return ok(resultat.donnees);
}

export async function DELETE(
  request: Request,
  contexte: { params: Promise<{ id: string }> },
): Promise<Response> {
  const garde = await gardeAdmin(request);
  if (!garde.ok) return garde.response;

  const { id } = await contexte.params;
  if (!z.uuid().safeParse(id).success) return errors.introuvable();

  const resultat = await supprimerAvis(garde.acteur.id, id);
  if (!resultat.ok) return refusEnReponse(resultat.raison);

  return noContent();
}

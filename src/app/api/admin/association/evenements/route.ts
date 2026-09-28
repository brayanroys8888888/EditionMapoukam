import { z } from 'zod';

import { gardeAdmin, refusEnReponse } from '@/lib/admin/route-helpers';
import { enregistrerEvenementAssociation } from '@/lib/admin/service';
import { fail, ok } from '@/lib/http/responses';
import { parseJsonBody } from '@/lib/http/validate';

/**
 * L'AGENDA — ateliers, séminaires en ligne et formations.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LE LIEU ET LE LIEN S'EXCLUENT, ET C'EST LA BASE QUI TRANCHE.            │
 * │                                                                          │
 * │ Un séminaire en ligne n'a pas de salle, un atelier en présentiel n'a pas │
 * │ d'adresse de connexion. Une contrainte le dit sur la table ; ce schéma   │
 * │ ne la rejoue pas — il transporte les deux champs et laisse la base       │
 * │ refuser, pour qu'il n'y ait qu'un seul endroit où la règle vit.          │
 * │                                                                          │
 * │ Le refus de RÉDUIRE les places sous le nombre d'inscrits vit au même     │
 * │ endroit, et pour la même raison : deux écrans pourraient poser la même   │
 * │ modification.                                                            │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
const evenementSchema = z.object({
  id: z.uuid().nullish(),
  type: z.enum(['atelier_presentiel', 'seminaire_en_ligne', 'formation_enseignants']),
  titre: z.string().trim().min(1).max(200),
  debut_le: z.iso.datetime({ offset: true }),
  places: z.int().min(1).max(10_000),
  lieu: z.string().trim().max(200).nullish(),
  lien: z.url().max(500).nullish(),
  description: z.string().trim().max(2000).default(''),
  publics: z
    .array(z.enum(['parents', 'enseignants', 'pro_handicap', 'donateurs', 'partenaires']))
    .max(5)
    .default([]),
});

export async function PUT(request: Request): Promise<Response> {
  const garde = await gardeAdmin(request);
  if (!garde.ok) return garde.response;

  const corps = await parseJsonBody(request, evenementSchema);
  if (!corps.ok) return corps.response;

  const resultat = await enregistrerEvenementAssociation(garde.acteur.id, {
    id: corps.data.id ?? null,
    type: corps.data.type,
    titre: corps.data.titre,
    debutLe: corps.data.debut_le,
    places: corps.data.places,
    lieu: corps.data.lieu ?? null,
    lien: corps.data.lien ?? null,
    description: corps.data.description,
    publics: corps.data.publics,
  });

  if (!resultat.ok) {
    /*
     * Le refus des places est NOMMÉ, parce qu'il se corrige : l'éditeur doit
     * lire « des gens sont déjà inscrits », pas « action impossible ». Les
     * autres refus métier gardent leur code générique.
     */
    if (resultat.raison === 'regle_metier') {
      return fail(422, {
        code: 'evenement_refuse',
        message:
          'Enregistrement refusé : vérifiez le nombre de places, et qu’un séminaire en ligne n’a pas de lieu.',
      });
    }
    return refusEnReponse(resultat.raison);
  }

  return ok({ evenement: resultat.donnees });
}

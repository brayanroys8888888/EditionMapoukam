import { z } from 'zod';

import { gardeAdmin, refusEnReponse } from '@/lib/admin/route-helpers';
import { publierTemoignage } from '@/lib/admin/service';
import { errors, fail, ok } from '@/lib/http/responses';
import { parseJsonBody } from '@/lib/http/validate';

/**
 * PUBLIER OU RETIRER UN TÉMOIGNAGE — migration 0073.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ CE QUI MANQUE POUR PUBLIER EST DÉCIDÉ EN BASE, PAS ICI.                 │
 * │                                                                          │
 * │ `admin_publier_temoignage` refuse un témoignage sans texte français : la  │
 * │ page d'accueil afficherait sinon une signature sous un guillemet vide.    │
 * │ Cette route ne rejoue pas le contrôle — elle NOMME le refus, comme        │
 * │ `POST /api/admin/books/publication` le fait pour                          │
 * │ `manques_pour_publication`.                                              │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * L'écran envoie l'état VOULU, et non « bascule » : deux onglets ouverts
 * inverseraient sinon deux fois un statut touché une seule fois.
 */
const publicationSchema = z.object({ publie: z.boolean() });

export async function PUT(
  request: Request,
  contexte: { params: Promise<{ id: string }> },
): Promise<Response> {
  const garde = await gardeAdmin(request);
  if (!garde.ok) return garde.response;

  const corps = await parseJsonBody(request, publicationSchema);
  if (!corps.ok) return corps.response;

  const { id } = await contexte.params;
  if (!z.uuid().safeParse(id).success) return errors.introuvable();

  const resultat = await publierTemoignage(garde.acteur.id, id, corps.data.publie);

  if (!resultat.ok) {
    if (resultat.raison === 'regle_metier') {
      return fail(422, {
        code: 'texte_francais_absent',
        message: 'Ce témoignage n’est pas publiable : il lui manque son texte français.',
      });
    }
    return refusEnReponse(resultat.raison);
  }

  return ok(resultat.donnees);
}

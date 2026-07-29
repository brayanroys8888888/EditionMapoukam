import { z } from 'zod';

import { gardeAdmin, refusEnReponse } from '@/lib/admin/route-helpers';
import { changerPublication } from '@/lib/admin/service';
import { ok } from '@/lib/http/responses';
import { parseJsonBody } from '@/lib/http/validate';

/**
 * Publication et archivage — à l'unité ou en lot (§4.3 F10).
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ PUBLIER QUARANTE TITRES D'UN COUP NE CONTOURNE RIEN.                    │
 * │                                                                          │
 * │ L'action groupée est le chemin par lequel les validations s'échappent     │
 * │ d'ordinaire : on écrit la version « rapide » avec un `where id = any(…)`, │
 * │ et le contrôle qui existait pour un titre n'existe plus pour quarante.    │
 * │                                                                          │
 * │ D'où un SEUL point d'entrée, qui prend toujours une liste — même pour un  │
 * │ titre unique. Deux chemins auraient fini par diverger, et c'est le chemin │
 * │ groupé qui aurait perdu la validation.                                   │
 * │                                                                          │
 * │ En base, le lot est une boucle sur le chemin unitaire : le déclencheur    │
 * │ `books_valider_publication` s'applique à chaque ligne, et un seul titre   │
 * │ incomplet fait échouer TOUT le lot. Quarante titres publiés à moitié      │
 * │ seraient pires qu'un refus — il faudrait deviner lesquels sont passés.    │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
const corpsSchema = z.object({
  // Le plafond de 100 est aussi appliqué en base : une action groupée doit
  // rester une action, pas un import.
  book_ids: z.array(z.uuid()).min(1).max(100),
  statut: z.enum(['brouillon', 'publie', 'archive']),
});

export async function PUT(request: Request): Promise<Response> {
  const garde = await gardeAdmin(request);
  if (!garde.ok) return garde.response;

  const corps = await parseJsonBody(request, corpsSchema);
  if (!corps.ok) return corps.response;

  const resultat = await changerPublication(
    garde.acteur.id,
    corps.data.book_ids,
    corps.data.statut,
  );

  if (!resultat.ok) {
    // Un refus de règle métier, ici, est presque toujours un titre incomplet :
    // la réponse renvoie donc vers la liste des manques plutôt que d'énoncer un
    // échec opaque.
    if (resultat.raison === 'regle_metier') {
      return Response.json(
        {
          erreur: {
            code: 'publication_refusee',
            message:
              'Au moins un titre n’est pas publiable. Consultez la liste des manques dans le catalogue.',
          },
        },
        { status: 422, headers: { 'content-type': 'application/json; charset=utf-8' } },
      );
    }
    return refusEnReponse(resultat.raison);
  }

  return ok({ titres: resultat.donnees });
}

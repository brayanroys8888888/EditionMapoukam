import { z } from 'zod';

import { gardeAdmin, refusEnReponse } from '@/lib/admin/route-helpers';
import { publierContenuAssociation } from '@/lib/admin/service';
import { errors, fail, ok } from '@/lib/http/responses';
import { parseJsonBody } from '@/lib/http/validate';

/**
 * PUBLIER OU DÉPUBLIER UN CONTENU ASSOCIATIF — §3.6.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ CE QUI MANQUE POUR PUBLIER EST DÉCIDÉ EN BASE, PAS ICI.                 │
 * │                                                                          │
 * │ `admin_publier_contenu_association` refuse un contenu sans version        │
 * │ française : c'est elle qui fait foi, et sur laquelle toutes les autres    │
 * │ se replient. Un contenu publié sans elle s'afficherait sous son slug.     │
 * │                                                                          │
 * │ Cette route ne rejoue pas le contrôle — elle NOMME le refus. C'est le     │
 * │ même partage que pour les titres : `manques_pour_publication` décide,     │
 * │ `POST /api/admin/books/publication` traduit.                             │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ DÉPUBLIER FERME L'ADRESSE, ET C'EST UN GESTE ORDINAIRE.                 │
 * │                                                                          │
 * │ `association_liste` et `association_contenu` ne rendent que les contenus  │
 * │ publiés : un contenu retiré redevient un 404, pour tout le monde et sans  │
 * │ délai. Rien ne s'y rattache — l'adhésion ne se vend pas contenu par       │
 * │ contenu — donc dépublier n'ôte de droit à personne.                      │
 * └──────────────────────────────────────────────────────────────────────────┘
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

  const resultat = await publierContenuAssociation(garde.acteur.id, id, corps.data.publie);

  if (!resultat.ok) {
    if (resultat.raison === 'regle_metier') {
      return fail(422, {
        // Un code À PART, et non `publication_refusee` : celui-là est déjà
        // traduit par « au moins un titre n'est pas publiable, consultez la
        // liste des manques dans le catalogue », qui enverrait l'éditeur
        // chercher dans le mauvais écran ce qui manque à un tout autre objet.
        code: 'version_francaise_absente',
        message:
          'Ce contenu n’est pas publiable : il lui manque sa version française, titre compris.',
      });
    }
    return refusEnReponse(resultat.raison);
  }

  return ok(resultat.donnees);
}

import { z } from 'zod';

import { gardeAdmin, refusEnReponse } from '@/lib/admin/route-helpers';
import { enregistrerTemoignage, lireTemoignage, supprimerTemoignage } from '@/lib/admin/service';
import { errors, noContent, ok } from '@/lib/http/responses';
import { parseJsonBody } from '@/lib/http/validate';
import { temoignageSchema } from '../route';

/**
 * UN TÉMOIGNAGE — lecture, écriture, suppression. Migration 0073.
 *
 * `PUT` et non `PATCH` : le corps porte l'état COMPLET du témoignage tel que
 * l'écran l'affiche. Un formulaire sans JavaScript renvoie tous ses champs à
 * chaque envoi, et prétendre distinguer « absent » de « vidé » sur un tel
 * formulaire mènerait à des effacements qu'on croirait des oublis.
 *
 * La seule exception est le tableau des versions, dont la règle vit en base :
 * une langue absente est laissée intacte, une langue au texte vide est
 * supprimée. L'écran envoie toujours les deux langues, donc la distinction ne
 * lui sert pas — mais elle sert à l'API, et elle n'est écrite qu'une fois.
 */
export async function GET(
  request: Request,
  contexte: { params: Promise<{ id: string }> },
): Promise<Response> {
  const garde = await gardeAdmin(request);
  if (!garde.ok) return garde.response;

  const { id } = await contexte.params;
  if (!z.uuid().safeParse(id).success) return errors.introuvable();

  const resultat = await lireTemoignage(id);
  if (!resultat.ok) return refusEnReponse(resultat.raison);
  if (resultat.donnees === null) return errors.introuvable();

  return ok(resultat.donnees);
}

export async function PUT(
  request: Request,
  contexte: { params: Promise<{ id: string }> },
): Promise<Response> {
  const garde = await gardeAdmin(request);
  if (!garde.ok) return garde.response;

  const corps = await parseJsonBody(request, temoignageSchema);
  if (!corps.ok) return corps.response;

  const { id } = await contexte.params;
  if (!z.uuid().safeParse(id).success) return errors.introuvable();

  const resultat = await enregistrerTemoignage(garde.acteur.id, {
    id,
    auteur: corps.data.auteur,
    ordre: corps.data.ordre,
    versions: corps.data.versions,
  });
  if (!resultat.ok) return refusEnReponse(resultat.raison);

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

  const resultat = await supprimerTemoignage(garde.acteur.id, id);
  if (!resultat.ok) return refusEnReponse(resultat.raison);

  return noContent();
}

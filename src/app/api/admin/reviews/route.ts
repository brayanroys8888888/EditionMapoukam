import { z } from 'zod';

import { gardeAdmin, refusEnReponse } from '@/lib/admin/route-helpers';
import { listerAvis } from '@/lib/admin/service';
import { ok } from '@/lib/http/responses';
import { parseSearchParams } from '@/lib/http/validate';

/**
 * LA FILE DE MODÉRATION DES AVIS — migration 0072.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ CETTE ROUTE VOIT CE QUE LE PUBLIC NE VOIT PAS.                          │
 * │                                                                          │
 * │ `book_reviews` est fermée par RLS : le public ne lit que les avis         │
 * │ `publie`, un lecteur connecté voit en plus le sien, et personne ne voit   │
 * │ la file d'attente. `admin_lister_avis` est `security definer` et n'est    │
 * │ exécutable que par `service_role` — c'est ce qui rend la modération       │
 * │ possible, et c'est aussi ce qui rend la garde obligatoire.                │
 * │                                                                          │
 * │ Elle rend en outre l'ADRESSE ÉLECTRONIQUE de l'auteur, seule surface du   │
 * │ dépôt où elle accompagne un avis. Un `gardeAdmin` oublié ici serait une   │
 * │ fuite de données personnelles, pas seulement un écran mal fermé.          │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Pas de pagination : la file d'attente d'une maison d'édition de dix titres se
 * compte en dizaines de lignes, et une pagination sur une file qu'on traite du
 * haut vers le bas ferait perdre la place à chaque décision prise.
 */
const filtreSchema = z.object({
  statut: z.enum(['en_attente', 'publie', 'rejete']).optional(),
  book: z.uuid().optional(),
});

export async function GET(request: Request): Promise<Response> {
  const garde = await gardeAdmin(request);
  if (!garde.ok) return garde.response;

  const filtre = parseSearchParams(request, filtreSchema);
  if (!filtre.ok) return filtre.response;

  const resultat = await listerAvis({
    ...(filtre.data.statut !== undefined ? { statut: filtre.data.statut } : {}),
    ...(filtre.data.book !== undefined ? { book: filtre.data.book } : {}),
  });
  if (!resultat.ok) return refusEnReponse(resultat.raison);

  return ok({ avis: resultat.donnees });
}

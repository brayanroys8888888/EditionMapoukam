import { z } from 'zod';

import { requireUser } from '@/lib/auth/session';
import { ok, errors } from '@/lib/http/responses';
import { retirerDuPanier } from '@/lib/orders/cart';

/**
 * Retrait d'un titre du panier — §4.2 F9.
 *
 * L'identifiant qui circule est celui du LIVRE, jamais celui de la ligne de
 * panier : le panier visé est toujours celui de l'appelant, et une ligne
 * appartenant à quelqu'un d'autre n'est donc pas atteignable, même en
 * connaissant son identifiant.
 */
export async function DELETE(
  request: Request,
  contexte: { params: Promise<{ bookId: string }> },
): Promise<Response> {
  const garde = await requireUser(request);
  if (!garde.ok) return garde.response;

  const { bookId } = await contexte.params;
  if (!z.uuid().safeParse(bookId).success) return errors.introuvable();

  const retire = await retirerDuPanier(garde.appelant.id, bookId);
  if (!retire) return errors.introuvable();

  return ok({ retire: true });
}

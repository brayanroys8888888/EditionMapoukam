import { z } from 'zod';

import { requireUser } from '@/lib/auth/session';
import { errors, noContent } from '@/lib/http/responses';
import { createUserClient } from '@/lib/supabase/clients';
import { logger } from '@/lib/logger';

/**
 * Retrait d'un favori — §4.2 F7.
 *
 * L'identifiant qui circule est celui du LIVRE, jamais celui de la ligne : le
 * favori visé est toujours celui de l'appelant, et celui d'autrui n'est donc
 * pas atteignable, même en connaissant son identifiant. Même parti pris que le
 * retrait d'une ligne de panier.
 *
 * La politique RLS de `favorites` l'impose en second, indépendamment de ce
 * fichier.
 */
export async function DELETE(
  request: Request,
  contexte: { params: Promise<{ bookId: string }> },
): Promise<Response> {
  const garde = await requireUser(request);
  if (!garde.ok) return garde.response;

  const { bookId } = await contexte.params;
  if (!z.uuid().safeParse(bookId).success) return errors.introuvable();

  const { error } = await createUserClient(garde.appelant.accessToken)
    .from('favorites')
    .delete()
    .eq('book_id', bookId)
    .eq('user_id', garde.appelant.id);

  if (error) {
    logger.error('Retrait de favori impossible', { detail: error.message });
    return errors.interne(error.message);
  }

  // 204 même si la ligne n'existait pas : retirer ce qui n'est pas là est le
  // résultat demandé. Distinguer les deux cas renseignerait sur le contenu
  // d'une bibliothèque sans rien apporter à l'utilisateur.
  return noContent();
}

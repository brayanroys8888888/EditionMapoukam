import { z } from 'zod';

import { requireUser } from '@/lib/auth/session';
import { ok, errors } from '@/lib/http/responses';
import { createServiceClient } from '@/lib/supabase/clients';

/**
 * Détail d'une commande — §4.2 F8.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LA COMMANDE D'AUTRUI RENVOIE 404, JAMAIS 403.                           │
 * │                                                                          │
 * │ Un 403 confirmerait que la commande EXISTE. En sondant des identifiants, │
 * │ on apprendrait combien de commandes la boutique a passées et à quel      │
 * │ rythme. Un identifiant inconnu et la commande d'un autre se répondent    │
 * │ donc exactement pareil.                                                  │
 * │                                                                          │
 * │ Le filtre sur `user_id` est appliqué dans la requête elle-même : la      │
 * │ ligne d'autrui n'est jamais chargée, même pour être écartée ensuite.     │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export async function GET(
  request: Request,
  contexte: { params: Promise<{ id: string }> },
): Promise<Response> {
  const garde = await requireUser(request);
  if (!garde.ok) return garde.response;

  const { id } = await contexte.params;
  if (!z.uuid().safeParse(id).success) return errors.introuvable();

  const client = createServiceClient();
  const { data } = await client
    .from('orders')
    .select(
      `id, montant_total, devise, zone, statut, remise, cree_le, paye_le,
       order_items(book_id, langue, prix_unitaire, devise)`,
    )
    .eq('id', id)
    .eq('user_id', garde.appelant.id)
    .maybeSingle();

  if (!data) return errors.introuvable();

  return ok({
    id: data.id,
    montant_total: data.montant_total,
    devise: data.devise,
    zone: data.zone,
    statut: data.statut,
    remise: data.remise,
    cree_le: data.cree_le,
    paye_le: data.paye_le,
    lignes: data.order_items.map((ligne) => ({
      livre_id: ligne.book_id,
      langue: ligne.langue,
      prix_unitaire: ligne.prix_unitaire,
      devise: ligne.devise,
    })),
  });
}

import { garderConsole } from '@/lib/dev/guard';
import { errors, ok } from '@/lib/http/responses';
import { createServiceClient } from '@/lib/supabase/clients';
import { getClock } from '@/lib/clock';

/**
 * État courant, pour alimenter la console.
 *
 * LECTURE SEULE. La console lit pour proposer des actions pertinentes — payer
 * telle commande, annuler tel abonnement — mais toute transition passe par un
 * événement signé, jamais par une écriture d'ici.
 */
export async function GET(): Promise<Response> {
  const refus = garderConsole();
  if (refus) return refus;

  const client = createServiceClient();

  const [commandes, abonnements, webhooks] = await Promise.all([
    client
      .from('orders')
      .select('id, user_id, montant_total, devise, zone, statut, cree_le')
      .order('cree_le', { ascending: false })
      .limit(25),
    client
      .from('subscriptions')
      .select('id, user_id, offre, statut, debut_periode, fin_periode, zone')
      .order('cree_le', { ascending: false })
      .limit(25),
    client
      .from('webhook_events')
      .select('id, event_id, type, signature_valide, recu_le, traite_le')
      .order('recu_le', { ascending: false })
      .limit(25),
  ]);

  const erreur = commandes.error ?? abonnements.error ?? webhooks.error;
  if (erreur) return errors.interne(erreur.message);

  return ok({
    maintenant: getClock().now().toISOString(),
    commandes: commandes.data,
    abonnements: abonnements.data,
    webhooks: webhooks.data,
  });
}

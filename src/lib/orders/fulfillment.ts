import { createServiceClient, type AppSupabaseClient } from '@/lib/supabase/clients';
import { logger } from '@/lib/logger';

/**
 * Exécution d'un paiement — §9.1.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ SEUL POINT DU DÉPÔT QUI CRÉE UN DROIT D'ACCÈS PAYANT.                   │
 * │                                                                          │
 * │ CLAUDE.md règle 5 : « Les webhooks sont la seule source de vérité sur    │
 * │ l'état d'un paiement. Une redirection de navigateur ne déclenche jamais  │
 * │ l'octroi d'un droit. » Ce module n'est appelé que par le gestionnaire de │
 * │ webhooks, après vérification de signature.                              │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Le travail réel est fait par des fonctions PostgreSQL (migration 0023) :
 * passer la commande en `paye` et créer les droits doivent être une seule
 * opération, et seule la base sait le garantir. Ce module ne fait que les
 * appeler et traduire leurs erreurs.
 *
 * Écart d'emplacement avec docs/PLAN.md, qui annonçait
 * `src/domain/orders/fulfillment.ts` : `src/domain` est réservé au calcul pur,
 * sans base ni horloge. Même convention qu'à l'étape 7.
 */

export interface ResultatOctroi {
  /** Vrai si la commande était déjà payée : le rejeu n'a rien réécrit. */
  dejaTraite: boolean;
  nbDroits: number;
}

/** Passe une commande en `paye` et crée ses droits, atomiquement. */
export async function honorerCommande(
  orderId: string,
  options: {
    referencePaiement?: string | null;
    webhookEventId?: string | null;
    client?: AppSupabaseClient;
  } = {},
): Promise<ResultatOctroi> {
  const client = options.client ?? createServiceClient();

  const { data, error } = await client.rpc('fulfill_order', {
    p_order_id: orderId,
    p_reference_paiement: options.referencePaiement ?? null,
    p_webhook_event_id: options.webhookEventId ?? null,
  } as never);

  if (error) {
    throw new Error(`Octroi impossible pour la commande ${orderId} : ${error.message}`);
  }

  // La fonction rend une table d'une seule ligne.
  const ligne = (data as { deja_traite: boolean; nb_droits: number }[] | null)?.[0];
  if (!ligne) {
    throw new Error(`Octroi sans résultat pour la commande ${orderId}.`);
  }

  logger.info(ligne.deja_traite ? 'Paiement déjà traité, rejeu ignoré' : 'Paiement honoré', {
    orderId,
    nbDroits: ligne.nb_droits,
  });

  return { dejaTraite: ligne.deja_traite, nbDroits: ligne.nb_droits };
}

/** Marque une commande en échec. N'octroie jamais de droit. */
export async function echouerCommande(
  orderId: string,
  options: {
    motif?: string | null;
    webhookEventId?: string | null;
    client?: AppSupabaseClient;
  } = {},
): Promise<boolean> {
  const client = options.client ?? createServiceClient();

  const { data, error } = await client.rpc('fail_order', {
    p_order_id: orderId,
    p_motif: options.motif ?? null,
    p_webhook_event_id: options.webhookEventId ?? null,
  } as never);

  if (error) {
    throw new Error(`Échec non enregistré pour la commande ${orderId} : ${error.message}`);
  }

  logger.info('Paiement en échec enregistré', { orderId, applique: data === true });
  return data === true;
}

/** Rembourse une commande et retire les droits qu'elle avait octroyés. */
export async function rembourserCommande(
  orderId: string,
  options: { webhookEventId?: string | null; client?: AppSupabaseClient } = {},
): Promise<number> {
  const client = options.client ?? createServiceClient();

  const { data, error } = await client.rpc('refund_order', {
    p_order_id: orderId,
    p_webhook_event_id: options.webhookEventId ?? null,
  } as never);

  if (error) {
    throw new Error(`Remboursement impossible pour la commande ${orderId} : ${error.message}`);
  }

  const retires = typeof data === 'number' ? data : 0;
  logger.info('Remboursement enregistré', { orderId, droitsRetires: retires });
  return retires;
}

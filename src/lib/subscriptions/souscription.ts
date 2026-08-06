import type { AppSupabaseClient } from '@/lib/supabase/clients';
import { getPaymentProvider } from '@/adapters/registry';
import { getBusinessSettings } from '@/lib/settings/business-settings';
import { getServerEnv } from '@/lib/config/env';
import { zonePourPays } from '@/domain/orders/zones';
import type { Zone } from '@/domain/orders/types';

/**
 * Ce qu'il faut savoir avant d'ouvrir une souscription.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ EXTRAIT POUR QU'IL N'Y AIT QU'UNE SEULE RÉPONSE À « COMBIEN ? ».        │
 * │                                                                          │
 * │ Deux routes ont besoin de ce calcul : celle qui ouvre la souscription    │
 * │ chez le prestataire, et celle qui simule l'événement signé du            │
 * │ prestataire. Elles doivent trouver le MÊME montant, la MÊME devise et la │
 * │ MÊME zone — sans quoi un abonnement serait ouvert à un prix et créé à un │
 * │ autre, et personne ne verrait l'écart avant la première facture.         │
 * │                                                                          │
 * │ Trois fois dans ce projet, une règle écrite deux fois a rendu deux        │
 * │ verdicts opposés (docs/PLAN.md §5 quinquies). Celle-ci n'est écrite       │
 * │ qu'ici.                                                                  │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LA ZONE VIENT DU PRESTATAIRE, JAMAIS DU CLIENT.                         │
 * │                                                                          │
 * │ §3.3 : elle est déterminée par le pays du moyen de paiement, et non par  │
 * │ l'adresse IP ni par un champ soumis. Un pays inconnu retombe sur         │
 * │ `international`, la grille la plus chère : une donnée manquante ne doit  │
 * │ jamais valoir remise.                                                    │
 * │                                                                          │
 * │ Elle sera FIGÉE sur l'abonnement à sa création, et jamais recalculée aux │
 * │ renouvellements (D4 point 7).                                           │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export interface PreparationSouscription {
  zone: Zone;
  devise: string;
  /** Montant de chaque formule, dans la plus petite unité de la devise. */
  montants: Record<'mensuel' | 'annuel', number>;
  /** Durée de l'essai gratuit, en jours (§3.4). Zéro pour aucun essai. */
  joursEssai: number;
  /** L'abonnement est-il ouvert à la souscription (§3.3) ? */
  ouvert: boolean;
}

export async function preparerSouscription(
  client: { userId: string; email: string },
  options: { client?: AppSupabaseClient } = {},
): Promise<PreparationSouscription> {
  const env = getServerEnv();
  const reglages = await getBusinessSettings(options.client ? { client: options.client } : {});

  const zone = zonePourPays(
    await getPaymentProvider().paysDuMoyenDePaiement({
      userId: client.userId,
      email: client.email,
    }),
  );

  return {
    zone,
    devise: zone === 'afrique' ? 'XAF' : 'EUR',
    montants: {
      mensuel: env.PRICE_SUBSCRIPTION_MONTHLY,
      annuel: env.PRICE_SUBSCRIPTION_YEARLY,
    },
    // La durée d'essai est lue MAINTENANT et sera figée sur l'abonnement : un
    // changement de réglage ne doit jamais raccourcir un essai en cours.
    joursEssai: reglages.joursEssai,
    ouvert: reglages.abonnementOuvert,
  };
}

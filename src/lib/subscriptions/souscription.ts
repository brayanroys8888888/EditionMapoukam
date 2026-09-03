import type { AppSupabaseClient } from '@/lib/supabase/clients';
import { getPaymentProvider } from '@/adapters/registry';
import { getBusinessSettings } from '@/lib/settings/business-settings';
import { zonePourPays } from '@/domain/orders/zones';
import type { Zone } from '@/domain/orders/types';
import type { DomaineAbonnement } from '@/domain/subscriptions/domaines';

/**
 * Ce qu'il faut savoir avant d'ouvrir une souscription.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LE PRIX N'EST PLUS ICI : IL EST DANS `lireOffreParCode`.                │
 * │                                                                          │
 * │ Ce module portait les deux montants, lus dans l'environnement. Depuis la │
 * │ migration 0068, les formules sont administrées et tarifées en base, et   │
 * │ la question « combien coûte cette formule dans cette zone ? » a une      │
 * │ seule réponse : la fonction SQL `offre_par_code`, appelée par            │
 * │ `lireOffreParCode`. Deux routes s'en servent — celle qui ouvre la        │
 * │ souscription chez le prestataire et celle qui simule l'événement signé — │
 * │ et elles trouvent donc forcément le même montant.                        │
 * │                                                                          │
 * │ Trois fois dans ce projet, une règle écrite deux fois a rendu deux       │
 * │ verdicts opposés (docs/PLAN.md §5 quinquies). Celle-ci n'est écrite      │
 * │ qu'une fois, et en SQL.                                                  │
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
  /** Durée de l'essai gratuit, en jours (§3.4). Zéro pour aucun essai. */
  joursEssai: number;
  /** L'abonnement est-il ouvert à la souscription (§3.3) ? */
  ouvert: boolean;
}

/**
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ L'ESSAI GRATUIT EST CELUI DU CATALOGUE, ET DE LUI SEUL.                 │
 * │                                                                          │
 * │ §3.4 décrit un essai gratuit pour l'abonnement de LECTURE : c'est une    │
 * │ décision commerciale prise sur ce produit-là. L'étendre en silence à     │
 * │ l'abonnement associatif inventerait une règle que personne n'a prise —   │
 * │ et offrirait le contenu de l'association pendant la durée de l'essai.    │
 * │                                                                          │
 * │ Le domaine `association` reçoit donc zéro jour d'essai. Le jour où       │
 * │ l'éditeur en voudra un, ce sera une décision écrite, pas un effet de     │
 * │ bord.                                                                    │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export async function preparerSouscription(
  client: { userId: string; email: string },
  domaine: DomaineAbonnement,
  options: { client?: AppSupabaseClient } = {},
): Promise<PreparationSouscription> {
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
    // La durée d'essai est lue MAINTENANT et sera figée sur l'abonnement : un
    // changement de réglage ne doit jamais raccourcir un essai en cours.
    joursEssai: domaine === 'lecture' ? reglages.joursEssai : 0,
    // `abonnementOuvert` est l'interrupteur du CATALOGUE (§3.3). Pour
    // l'association, l'interrupteur est ailleurs et il est plus simple : une
    // formule associative active existe, ou il n'y a rien à souscrire.
    ouvert: domaine === 'lecture' ? reglages.abonnementOuvert : true,
  };
}

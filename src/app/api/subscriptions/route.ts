import { z } from 'zod';

import { requireUser } from '@/lib/auth/session';
import { ok, fail } from '@/lib/http/responses';
import { parseJsonBody } from '@/lib/http/validate';
import { createServiceClient } from '@/lib/supabase/clients';
import { getPaymentProvider } from '@/adapters/registry';
import { abonnementCourant } from '@/lib/subscriptions/handlers';
import { getBusinessSettings } from '@/lib/settings/business-settings';
import { zonePourPays } from '@/domain/orders/zones';
import { getServerEnv } from '@/lib/config/env';
import { getClock } from '@/lib/clock';
import { logger } from '@/lib/logger';

/**
 * Abonnements — §9.1.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ AUCUNE DE CES ROUTES NE CHANGE LE STATUT D'UN ABONNEMENT.               │
 * │                                                                          │
 * │ §9.1 : « La notification par webhook est la seule source de vérité du    │
 * │ statut de paiement. Ne jamais activer un abonnement sur la seule base    │
 * │ d'une redirection navigateur, qui peut être falsifiée. »                │
 * │                                                                          │
 * │ Souscrire ouvre une session chez le prestataire. Annuler la DEMANDE au   │
 * │ prestataire. Dans les deux cas, c'est l'événement signé qui suit qui     │
 * │ fait évoluer l'état — et lui seul.                                      │
 * └──────────────────────────────────────────────────────────────────────────┘
 */

/**
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ AUCUNE ZONE N'EST ACCEPTÉE EN ENTRÉE — même règle que pour les commandes.│
 * │                                                                          │
 * │ §3.3 : la zone vient du pays du moyen de paiement. Elle est demandée au   │
 * │ prestataire, puis FIGÉE sur l'abonnement et jamais recalculée aux         │
 * │ renouvellements (D4 point 7).                                            │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
const souscriptionSchema = z.object({
  offre: z.enum(['mensuel', 'annuel']),
});

/** État de l'abonnement de l'appelant. */
export async function GET(request: Request): Promise<Response> {
  const garde = await requireUser(request);
  if (!garde.ok) return garde.response;

  const courant = await abonnementCourant(garde.appelant.id);

  if (!courant) {
    return ok({ abonnement: null });
  }

  const maintenant = getClock().now();

  return ok({
    abonnement: {
      // Le statut OBSERVÉ, dates repliées : c'est celui qui décrit la réalité.
      // `anomalie` signale une période échue sans événement — presque toujours
      // un webhook perdu.
      statut: courant.statutEffectif,
      // Celui que le prestataire a rapporté, conservé à part. « Annulé » et
      // « impayé » ne racontent pas la même histoire, et l'analyse de rétention
      // (étape 14) a besoin de la distinction.
      statut_rapporte: courant.statut,
      offre: courant.offre,
      fin_periode: courant.finPeriode.toISOString(),
      zone: courant.zone,
      devise: courant.devise,
      montant: courant.montant,
      // Calculé plutôt que stocké : `fin_periode` est la seule vérité, et un
      // drapeau « encore valable » se désynchroniserait avec le temps.
      periode_en_cours: courant.finPeriode > maintenant,
    },
    // Rappel utile à l'interface : l'abonnement ne donne JAMAIS le
    // téléchargement (§3.2). C'est la confusion la plus coûteuse du projet.
    donne_telechargement: false,
  });
}

/** Ouvre une souscription. N'active rien. */
export async function POST(request: Request): Promise<Response> {
  const garde = await requireUser(request);
  if (!garde.ok) return garde.response;

  const corps = await parseJsonBody(request, souscriptionSchema);
  if (!corps.ok) return corps.response;

  const client = createServiceClient();
  const courant = await abonnementCourant(garde.appelant.id, { client });

  // Un abonnement vivant interdit d'en souscrire un second : ce serait un
  // double prélèvement. L'index unique de la base le refuserait de toute façon,
  // mais un 409 explicite vaut mieux qu'une erreur de contrainte.
  if (courant && courant.statut !== 'expire') {
    return fail(409, {
      code: 'abonnement_deja_actif',
      message: 'Vous avez déjà un abonnement en cours.',
    });
  }

  // §3.4 — essai gratuit, moyen de paiement requis. La durée vient du réglage
  // métier, jamais d'une constante : elle sera figée sur l'abonnement à sa
  // création, si bien qu'un changement de réglage ne raccourcit aucun essai en
  // cours.
  const reglages = await getBusinessSettings({ client });

  const provider = getPaymentProvider();
  const zone = zonePourPays(
    await provider.paysDuMoyenDePaiement({
      userId: garde.appelant.id,
      email: garde.appelant.email,
    }),
  );

  const env = getServerEnv();
  const montant =
    corps.data.offre === 'mensuel'
      ? env.PRICE_SUBSCRIPTION_MONTHLY
      : env.PRICE_SUBSCRIPTION_YEARLY;

  const session = await provider.souscrireAbonnement({
    // Aucune ligne n'existe encore en base : c'est le webhook `abonnement.souscrit`
    // qui la créera. L'identifiant transmis est celui de l'utilisateur, que
    // l'événement rapportera.
    subscriptionId: garde.appelant.id,
    offre: corps.data.offre,
    montant: { montant, devise: zone === 'afrique' ? 'XAF' : 'EUR' },
    zone,
    client: { userId: garde.appelant.id, email: garde.appelant.email },
    joursEssai: reglages.joursEssai,
  });

  logger.info('Souscription ouverte', {
    userId: garde.appelant.id,
    offre: corps.data.offre,
    zone,
  });

  return ok({
    url: session.url,
    expire_le: session.expireLe.toISOString(),
    jours_essai: reglages.joursEssai,
    // Explicite : rien n'est actif tant que l'événement signé n'est pas arrivé.
    statut: 'en_attente_paiement',
  });
}

/** Demande l'annulation au prestataire. N'annule rien en base. */
export async function DELETE(request: Request): Promise<Response> {
  const garde = await requireUser(request);
  if (!garde.ok) return garde.response;

  const client = createServiceClient();
  const courant = await abonnementCourant(garde.appelant.id, { client });

  if (!courant || courant.statut === 'annule' || courant.statut === 'expire') {
    return fail(409, {
      code: 'aucun_abonnement_actif',
      message: 'Vous n’avez pas d’abonnement en cours.',
    });
  }

  const { data } = await client
    .from('subscriptions')
    .select('id_prestataire')
    .eq('id', courant.id)
    .maybeSingle();

  if (data?.id_prestataire) {
    await getPaymentProvider().annulerAbonnement(data.id_prestataire);
  }

  logger.info('Annulation d’abonnement demandée', {
    userId: garde.appelant.id,
    subscriptionId: courant.id,
  });

  return ok({
    demande: true,
    // §9.1 — l'accès est maintenu jusqu'à la fin de la période payée. Le dire
    // ici évite le contresens le plus fréquent : croire qu'annuler coupe
    // immédiatement.
    acces_maintenu_jusqu_au: courant.finPeriode.toISOString(),
    statut: 'annulation_demandee',
  });
}

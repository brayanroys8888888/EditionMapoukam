import { z } from 'zod';

import { garderConsole } from '@/lib/dev/guard';
import { ok, errors } from '@/lib/http/responses';
import { parseJsonBody } from '@/lib/http/validate';
import { getPaymentProvider } from '@/adapters/registry';
import { FakePaymentProvider } from '@/adapters/payment/fake/fake-payment-provider';
import { logger } from '@/lib/logger';

/**
 * Émission manuelle d'un événement de paiement.
 *
 * C'est le cœur de la console : chaque bouton de l'interface aboutit ici, et
 * chaque action émet un VRAI événement HTTP signé vers le VRAI gestionnaire de
 * webhooks. Cette route n'écrit rien en base et n'accorde aucun droit — si elle
 * le faisait, la console ne testerait plus rien.
 */
const evenementSchema = z.object({
  type: z.enum([
    'paiement.reussi',
    'paiement.echoue',
    'paiement.abandonne',
    'remboursement.effectue',
    'abonnement.souscrit',
    'abonnement.renouvele',
    'abonnement.prelevement_echoue',
    'abonnement.annule',
    'abonnement.expire',
  ]),
  donnees: z
    .object({
      orderId: z.uuid().optional(),
      subscriptionId: z.uuid().optional(),
      userId: z.uuid().optional(),
      referencePaiement: z.string().max(120).optional(),
      montant: z
        .object({ montant: z.number().int().nonnegative(), devise: z.string().length(3) })
        .optional(),
      offre: z.enum(['mensuel', 'annuel']).optional(),
      /**
       * Zone tarifaire, figée à la souscription (D4 point 7).
       *
       * Chez un prestataire réel, elle vient du pays du moyen de paiement.
       * Ici, c'est l'opérateur de la console qui joue ce rôle — d'où sa
       * présence parmi les paramètres.
       */
      zone: z.enum(['international', 'afrique']).optional(),
      /** Essai gratuit, en jours (§3.4). Absent ou zéro = souscription directe. */
      joursEssai: z.number().int().min(0).max(90).optional(),
      debutPeriode: z.iso.datetime().optional(),
      finPeriode: z.iso.datetime().optional(),
      motif: z.string().max(300).optional(),
      metadonnees: z.record(z.string(), z.string()).optional(),
    })
    .default({}),
  /**
   * Identifiant imposé, pour rejouer un événement à l'identique.
   *
   * C'est ce qui permet d'éprouver l'idempotence depuis la console : deux
   * émissions du même identifiant ne doivent produire qu'un seul traitement.
   */
  id: z.string().min(3).max(120).optional(),
});

export async function POST(request: Request): Promise<Response> {
  const refus = garderConsole();
  if (refus) return refus;

  const corps = await parseJsonBody(request, evenementSchema);
  if (!corps.ok) return corps.response;

  const provider = getPaymentProvider();
  if (!(provider instanceof FakePaymentProvider)) {
    return errors.interne('La console de simulation exige le faux prestataire.');
  }

  const { type, donnees, id } = corps.data;
  const resultat = await provider.declencher(type, donnees, id ? { id } : {});

  logger.info('Événement émis depuis la console', { type, statut: resultat.statut });

  return ok({
    evenement: resultat.evenement,
    reception: {
      statut: resultat.statut,
      corps: resultat.corpsReponse.slice(0, 2000),
    },
  });
}

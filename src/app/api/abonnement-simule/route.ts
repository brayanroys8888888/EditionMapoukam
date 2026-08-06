import { z } from 'zod';

import { requireUser } from '@/lib/auth/session';
import { errors, fail, ok } from '@/lib/http/responses';
import { parseJsonBody } from '@/lib/http/validate';
import { createServiceClient } from '@/lib/supabase/clients';
import { getPaymentProvider } from '@/adapters/registry';
import { FakePaymentProvider } from '@/adapters/payment/fake/fake-payment-provider';
import { abonnementCourant } from '@/lib/subscriptions/handlers';
import { preparerSouscription } from '@/lib/subscriptions/souscription';
import { logger } from '@/lib/logger';

/**
 * Règlement SIMULÉ d'une souscription — jumelle de `/api/paiement-simule`.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ POURQUOI CETTE ROUTE EXISTE.                                            │
 * │                                                                          │
 * │ `POST /api/subscriptions` ouvre une souscription chez le prestataire et  │
 * │ n'active rien : §9.1 réserve l'activation à l'événement signé. Le faux   │
 * │ prestataire, lui, ne décide de rien tout seul — c'est la console `/dev`  │
 * │ qui émettait cet événement, et `/dev` est fermée en production.          │
 * │                                                                          │
 * │ Sans cette route, le tunnel d'abonnement s'arrêtait donc net : l'écran   │
 * │ ouvrait une souscription que rien ne venait jamais confirmer.            │
 * │                                                                          │
 * │ Elle n'assouplit rien du modèle : elle ÉMET un vrai événement signé vers │
 * │ le vrai gestionnaire de webhooks, qui vérifie la signature, applique     │
 * │ l'idempotence et crée l'abonnement. Seul l'émetteur est simulé.          │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ AUCUN MONTANT, AUCUNE ZONE, AUCUNE DURÉE D'ESSAI N'EST ACCEPTÉE.        │
 * │                                                                          │
 * │ Le corps ne porte que la FORMULE et l'ISSUE. Tout le reste est recalculé │
 * │ par `preparerSouscription`, exactement comme `POST /api/subscriptions` : │
 * │ accepter un montant ferait de cette route un tarif à la carte, et        │
 * │ accepter une zone ferait réclamer la grille Afrique depuis l'Europe —    │
 * │ ce que §3.3 interdit et qu'un test d'architecture surveille.             │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ TROIS GARDES, ET LA TROISIÈME EST LA PLUS IMPORTANTE.                   │
 * │                                                                          │
 * │ 1. L'appelant est authentifié.                                          │
 * │ 2. Il n'a pas déjà un abonnement vivant — ce serait un double            │
 * │    prélèvement, et l'index unique de la base le refuserait de toute      │
 * │    façon ; un 409 explicite vaut mieux qu'une erreur de contrainte.      │
 * │ 3. LE PRESTATAIRE EST LE FAUX. Le jour où un prestataire réel sera       │
 * │    branché, cette route cessera de fonctionner au lieu de devenir une    │
 * │    porte ouverte sur des abonnements gratuits. C'est un échec FERMÉ, et  │
 * │    il est délibéré.                                                      │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
const demandeSchema = z.object({
  offre: z.enum(['mensuel', 'annuel']),
  issue: z.enum(['reussi', 'echoue']),
});

export async function POST(request: Request): Promise<Response> {
  const garde = await requireUser(request);
  if (!garde.ok) return garde.response;

  const corps = await parseJsonBody(request, demandeSchema);
  if (!corps.ok) return corps.response;

  const provider = getPaymentProvider();
  if (!(provider instanceof FakePaymentProvider)) {
    // Ni 403 ni 500 : du point de vue d'un client, cette route n'existe pas
    // lorsqu'un vrai prestataire encaisse.
    logger.warn('Souscription simulée refusée : un prestataire réel est branché');
    return errors.introuvable();
  }

  const client = createServiceClient();
  const courant = await abonnementCourant(garde.appelant.id, { client });

  if (courant && courant.statut !== 'expire') {
    return fail(409, {
      code: 'abonnement_deja_actif',
      message: 'Vous avez déjà un abonnement en cours.',
    });
  }

  /*
   * ┌──────────────────────────────────────────────────────────────────────┐
   * │ UN ÉCHEC N'ÉMET AUCUN ÉVÉNEMENT, ET C'EST EXACT.                    │
   * │                                                                      │
   * │ Un prestataire dont le PREMIER prélèvement échoue n'envoie pas        │
   * │ `abonnement.souscrit` suivi d'un échec : il n'envoie rien du tout,    │
   * │ parce qu'aucun abonnement n'a été créé chez lui. La machine à états    │
   * │ le confirmerait d'ailleurs — `prelevement_echoue` sans abonnement     │
   * │ courant est une transition refusée.                                   │
   * │                                                                      │
   * │ L'écran affiche donc « le paiement n'a pas abouti » et propose de     │
   * │ recommencer, ce qui est très exactement ce qui se passerait.          │
   * └──────────────────────────────────────────────────────────────────────┘
   */
  if (corps.data.issue === 'echoue') {
    logger.info('Souscription simulée échouée', { userId: garde.appelant.id });
    return ok({ souscrit: false, reception: null });
  }

  const preparation = await preparerSouscription(
    { userId: garde.appelant.id, email: garde.appelant.email },
    { client },
  );

  const resultat = await provider.declencher('abonnement.souscrit', {
    // Le gestionnaire de webhooks reconnaît l'abonné par `userId` : aucune
    // ligne n'existe encore, c'est cet événement qui la crée.
    userId: garde.appelant.id,
    offre: corps.data.offre,
    montant: {
      montant: preparation.montants[corps.data.offre],
      devise: preparation.devise,
    },
    zone: preparation.zone,
    joursEssai: preparation.joursEssai,
  });

  logger.info('Souscription simulée émise', {
    userId: garde.appelant.id,
    offre: corps.data.offre,
    zone: preparation.zone,
    statut: resultat.statut,
  });

  // Le statut rendu est celui du GESTIONNAIRE DE WEBHOOKS, pas une promesse de
  // cette route : c'est lui qui a créé — ou refusé — l'abonnement.
  return ok({ souscrit: true, reception: resultat.statut });
}

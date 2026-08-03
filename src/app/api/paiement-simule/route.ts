import { z } from 'zod';

import { requireUser } from '@/lib/auth/session';
import { errors, fail, ok } from '@/lib/http/responses';
import { parseJsonBody } from '@/lib/http/validate';
import { createServiceClient } from '@/lib/supabase/clients';
import { getPaymentProvider } from '@/adapters/registry';
import { FakePaymentProvider } from '@/adapters/payment/fake/fake-payment-provider';
import { logger } from '@/lib/logger';

/**
 * Règlement SIMULÉ d'une commande — accessible en ligne, contrairement à `/dev`.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ POURQUOI CETTE ROUTE EXISTE.                                            │
 * │                                                                          │
 * │ La console `/dev` est fermée en production, par un garde-fou obligatoire │
 * │ de CLAUDE.md. Elle est donc INATTEIGNABLE sur un site en ligne — et      │
 * │ avec elle, tout moyen de régler une commande tant qu'aucun prestataire   │
 * │ réel n'est branché.                                                      │
 * │                                                                          │
 * │ Cette route rend le tunnel démontrable en ligne. Elle n'assouplit rien   │
 * │ du modèle de sécurité : elle ÉMET un vrai événement signé vers le vrai   │
 * │ gestionnaire de webhooks, qui vérifie la signature, applique             │
 * │ l'idempotence et octroie les droits de façon atomique. Seul l'émetteur   │
 * │ est simulé, le récepteur est réel.                                       │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ TROIS GARDES, ET LA TROISIÈME EST LA PLUS IMPORTANTE.                   │
 * │                                                                          │
 * │ 1. L'appelant est authentifié.                                          │
 * │ 2. La commande est LA SIENNE, et encore payable. Le filtre sur           │
 * │    `user_id` est dans la requête : la commande d'autrui n'est jamais     │
 * │    chargée, et répond donc 404 comme un identifiant inconnu.            │
 * │ 3. LE PRESTATAIRE EST LE FAUX. Le jour où un prestataire réel sera       │
 * │    branché, cette route cessera de fonctionner au lieu de devenir une    │
 * │    porte ouverte sur des droits gratuits. C'est un échec FERMÉ, et il    │
 * │    est délibéré : on ne veut pas qu'elle survive à l'oubli de quelqu'un. │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
const demandeSchema = z.object({
  commande_id: z.uuid(),
  issue: z.enum(['reussi', 'echoue', 'abandonne']),
});

const EVENEMENTS = {
  reussi: 'paiement.reussi',
  echoue: 'paiement.echoue',
  abandonne: 'paiement.abandonne',
} as const;

export async function POST(request: Request): Promise<Response> {
  const garde = await requireUser(request);
  if (!garde.ok) return garde.response;

  const corps = await parseJsonBody(request, demandeSchema);
  if (!corps.ok) return corps.response;

  const provider = getPaymentProvider();
  if (!(provider instanceof FakePaymentProvider)) {
    // Ni 403 ni 500 : du point de vue d'un client, cette route n'existe pas
    // lorsqu'un vrai prestataire encaisse.
    logger.warn('Règlement simulé refusé : un prestataire réel est branché');
    return errors.introuvable();
  }

  const client = createServiceClient();
  const { data: commande } = await client
    .from('orders')
    .select('id, montant_total, devise, statut')
    .eq('id', corps.data.commande_id)
    .eq('user_id', garde.appelant.id)
    .maybeSingle();

  if (!commande) return errors.introuvable();

  if (commande.statut !== 'en_attente') {
    // Une commande déjà réglée, remboursée ou abandonnée ne se rejoue pas :
    // c'est la même garde que celle du tunnel réel.
    return fail(409, {
      code: 'commande_non_payable',
      message: 'Cette commande ne peut plus être réglée.',
    });
  }

  const resultat = await provider.declencher(EVENEMENTS[corps.data.issue], {
    orderId: commande.id,
    userId: garde.appelant.id,
    montant: { montant: commande.montant_total, devise: commande.devise },
  });

  logger.info('Règlement simulé émis', {
    orderId: commande.id,
    issue: corps.data.issue,
    statut: resultat.statut,
  });

  // Le statut rendu est celui du GESTIONNAIRE DE WEBHOOKS, pas une promesse de
  // cette route : c'est lui qui a accordé — ou refusé — les droits.
  return ok({ reception: resultat.statut });
}

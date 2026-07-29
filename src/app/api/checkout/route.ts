import { z } from 'zod';

import { requireUser } from '@/lib/auth/session';
import { ok, errors, fail } from '@/lib/http/responses';
import { parseJsonBody } from '@/lib/http/validate';
import { createServiceClient } from '@/lib/supabase/clients';
import { getPaymentProvider } from '@/adapters/registry';
import { getServerEnv } from '@/lib/config/env';
import { logger } from '@/lib/logger';

/**
 * Ouverture d'un tunnel de paiement — §9.1.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ CETTE ROUTE N'OCTROIE RIEN, ET NE PEUT RIEN OCTROYER.                   │
 * │                                                                          │
 * │ Elle ouvre une session chez le prestataire et rend une URL. Le droit    │
 * │ d'accès naît du webhook signé, jamais d'ici, et jamais du retour de      │
 * │ navigateur qui suivra (CLAUDE.md règle 5). C'est la distinction qui      │
 * │ empêche un utilisateur de s'octroyer un contenu en rejouant une URL de   │
 * │ succès.                                                                  │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Le montant transmis au prestataire est celui RELU sur la commande, jamais
 * celui d'un panier recalculé à la volée : entre la commande et le paiement,
 * la grille tarifaire a pu bouger, et c'est le montant commandé qui engage.
 */
const checkoutSchema = z.object({
  commande_id: z.uuid(),
});

export async function POST(request: Request): Promise<Response> {
  const garde = await requireUser(request);
  if (!garde.ok) return garde.response;

  const corps = await parseJsonBody(request, checkoutSchema);
  if (!corps.ok) return corps.response;

  const client = createServiceClient();

  // Le filtre sur `user_id` est dans la requête : la commande d'autrui n'est
  // jamais chargée, et répond donc 404 comme un identifiant inconnu.
  const { data: commande } = await client
    .from('orders')
    .select('id, user_id, montant_total, devise, zone, statut')
    .eq('id', corps.data.commande_id)
    .eq('user_id', garde.appelant.id)
    .maybeSingle();

  if (!commande) return errors.introuvable();

  // Une commande déjà payée ne se repaie pas. Sans ce contrôle, un double
  // paiement serait possible sur simple rechargement de page.
  if (commande.statut !== 'en_attente') {
    return fail(409, {
      code: 'commande_non_payable',
      message:
        commande.statut === 'paye'
          ? 'Cette commande est déjà réglée.'
          : 'Cette commande ne peut plus être réglée.',
    });
  }

  const env = getServerEnv();
  const session = await getPaymentProvider().ouvrirCheckout({
    orderId: commande.id,
    montant: { montant: commande.montant_total, devise: commande.devise },
    zone: commande.zone,
    client: { userId: garde.appelant.id, email: garde.appelant.email },
    urlRetourSucces: `${env.NEXT_PUBLIC_APP_URL}/commandes/${commande.id}`,
    urlRetourAbandon: `${env.NEXT_PUBLIC_APP_URL}/panier`,
  });

  logger.info('Tunnel de paiement ouvert', {
    userId: garde.appelant.id,
    orderId: commande.id,
    sessionId: session.id,
  });

  return ok({
    session_id: session.id,
    url: session.url,
    expire_le: session.expireLe.toISOString(),
    // Rappelé explicitement dans la réponse : aucun client ne doit croire que
    // revenir sur l'URL de succès suffit à obtenir le contenu.
    statut_commande: 'en_attente',
  });
}

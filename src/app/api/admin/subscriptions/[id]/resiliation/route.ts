import { z } from 'zod';

import { gardeAdmin } from '@/lib/admin/route-helpers';
import { createServiceClient } from '@/lib/supabase/clients';
import { getPaymentProvider } from '@/adapters/registry';
import { errors, fail, ok } from '@/lib/http/responses';
import { parseJsonBody } from '@/lib/http/validate';
import { logger } from '@/lib/logger';

/**
 * ╔═══════════════════════════════════════════════════════════════════════════╗
 * ║ RÉSILIER, OU REVENIR SUR UNE RÉSILIATION — depuis l'administration.       ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ CETTE ROUTE NE CHANGE AUCUN STATUT. ELLE DEMANDE.                       │
 * │                                                                          │
 * │ Comme `DELETE /api/subscriptions`, dont elle est la contrepartie         │
 * │ administrative : elle parle au prestataire, et c'est l'ÉVÉNEMENT SIGNÉ   │
 * │ qui fera foi. Écrire le statut ici donnerait une base qui croit          │
 * │ l'abonnement résilié pendant que le prestataire continue de prélever —   │
 * │ et personne ne le verrait avant la prochaine échéance.                   │
 * │                                                                          │
 * │ C'est la règle 5 de CLAUDE.md, et elle vaut pour l'administration comme  │
 * │ pour le client.                                                          │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ À LA FIN DE LA PÉRIODE PAYÉE, ET PAS AUTREMENT.                         │
 * │                                                                          │
 * │ Le prototype propose aussi « immédiatement, avec remboursement au        │
 * │ prorata ». Décision du propriétaire du 27 septembre 2026 : non. Cela     │
 * │ contredirait l'arbitrage inscrit sur la route de remboursement —         │
 * │ « rembourser partiellement supposerait de décider quels titres restent   │
 * │ accessibles, ce que la spécification ne prévoit pas ».                   │
 * │                                                                          │
 * │ L'accès court donc jusqu'au terme, et rien n'est remboursé. C'est ce que │
 * │ §9.1 promet, et l'écran le dit.                                          │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
const corpsSchema = z.object({
  /** `resilier` programme la fin ; `reprendre` revient dessus avant le terme. */
  geste: z.enum(['resilier', 'reprendre']),
});

interface Abonnement {
  id: string;
  statut: string;
  id_prestataire: string | null;
  fin_periode: string;
}

export async function POST(
  request: Request,
  contexte: { params: Promise<{ id: string }> },
): Promise<Response> {
  const garde = await gardeAdmin(request);
  if (!garde.ok) return garde.response;

  const corps = await parseJsonBody(request, corpsSchema);
  if (!corps.ok) return corps.response;

  const { id } = await contexte.params;
  if (!z.uuid().safeParse(id).success) return errors.introuvable();

  const client = createServiceClient();
  const { data } = await client
    .from('subscriptions')
    .select('id, statut, id_prestataire, fin_periode')
    .eq('id', id)
    .maybeSingle();

  const abonnement = data as Abonnement | null;
  if (!abonnement) return errors.introuvable();

  const resilier = corps.data.geste === 'resilier';

  /*
   * L'état est vérifié AVANT de déranger le prestataire. Lui demander de
   * résilier un abonnement déjà résilié ne casserait rien, mais l'éditeur
   * recevrait un succès pour un geste sans objet — et croirait avoir agi.
   */
  if (resilier && abonnement.statut !== 'actif' && abonnement.statut !== 'essai') {
    return fail(409, {
      code: 'resiliation_impossible',
      message: 'Cet abonnement n’est pas en cours.',
    });
  }
  if (!resilier && abonnement.statut !== 'annule') {
    return fail(409, {
      code: 'rien_a_reprendre',
      message: 'Cet abonnement n’a pas de résiliation à annuler.',
    });
  }

  /*
   * Sans identifiant chez le prestataire, il n'y a personne à qui parler. Le
   * cas existe sur les abonnements du jeu de démonstration, et sur ceux nés
   * avant que l'identifiant soit conservé : on refuse plutôt que de faire
   * semblant, car l'événement qui doit suivre ne viendra jamais.
   */
  if (!abonnement.id_prestataire) {
    return fail(409, {
      code: 'abonnement_sans_prestataire',
      message: 'Cet abonnement n’est rattaché à aucun prestataire.',
    });
  }

  const prestataire = getPaymentProvider();
  if (resilier) await prestataire.annulerAbonnement(abonnement.id_prestataire);
  else await prestataire.reprendreAbonnement(abonnement.id_prestataire);

  logger.info(resilier ? 'Résiliation demandée' : 'Reprise demandée', {
    acteur: garde.acteur.id,
    subscriptionId: id,
  });

  return ok({
    demande: true,
    geste: corps.data.geste,
    // Le contresens le plus fréquent : croire qu'une résiliation coupe tout de
    // suite. Le dire dans la réponse évite qu'un écran l'invente.
    acces_maintenu_jusqu_au: abonnement.fin_periode,
    statut: resilier ? 'resiliation_demandee' : 'reprise_demandee',
  });
}

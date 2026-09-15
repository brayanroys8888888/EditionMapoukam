import { getPaymentProvider } from '@/adapters/registry';
import { NotchPayPaymentProvider } from '@/adapters/payment/notchpay/notchpay-payment-provider';
import { createServiceClient } from '@/lib/supabase/clients';
import { honorerCommande } from '@/lib/orders/fulfillment';
import { viderFileEnArrierePlan } from '@/lib/emails/file';

/**
 * Repli de confirmation Notch Pay, quand le webhook du bac à sable tarde.
 *
 * Quand Notch Pay renvoie le navigateur sur la page de règlement, le webhook
 * asynchrone peut ne pas être encore arrivé. Plutôt que d'afficher « en
 * attente » à quelqu'un qui vient de payer, on interroge Notch Pay de SERVEUR
 * À SERVEUR ; la redirection du navigateur n'apporte que la référence à
 * vérifier, jamais la preuve du paiement.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ VIT ICI, ET NON DANS LA PAGE.                                           │
 * │                                                                          │
 * │ Il faut la clé de service pour honorer une commande, et un test         │
 * │ d'architecture l'interdit dans tout composant ou page. La page appelle   │
 * │ cette fonction et redirige selon sa réponse ; elle ne touche plus la     │
 * │ base elle-même.                                                          │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * La vérification qui compte — la transaction désigne-t-elle bien CETTE
 * commande, pour son montant ? — est celle de
 * `NotchPayPaymentProvider.confirmerReglement`.
 *
 * @returns vrai quand la commande vient d'être honorée.
 */
export async function confirmerReglementDeRepli(
  commande: { id: string; montant_total: number; devise: string },
  reference: string,
): Promise<boolean> {
  const provider = getPaymentProvider();
  if (!(provider instanceof NotchPayPaymentProvider)) return false;

  const confirme = await provider.confirmerReglement(reference, {
    commandeId: commande.id,
    montant: commande.montant_total,
    devise: commande.devise,
  });
  if (!confirme) return false;

  const client = createServiceClient();
  await honorerCommande(commande.id, { referencePaiement: reference, client });
  viderFileEnArrierePlan({ client });
  return true;
}

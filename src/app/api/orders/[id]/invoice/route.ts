import { z } from 'zod';

import { requireUser } from '@/lib/auth/session';
import { errors } from '@/lib/http/responses';
import { createServiceClient } from '@/lib/supabase/clients';
import { logger } from '@/lib/logger';

/**
 * Facture d'une commande — §4.2 F9, §11.3.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ CETTE ROUTE REND UNE IDENTITÉ. ELLE MÉRITE DONC PLUS QU'UNE GARDE.      │
 * │                                                                          │
 * │ Une facture porte `facture_nom` et `facture_email`, figés à l'émission   │
 * │ et conservés après l'anonymisation du compte, comme la loi l'exige. Ce   │
 * │ sont exactement les colonnes que les vues d'administration refusent de   │
 * │ joindre (note A4 de QUESTIONS.md).                                       │
 * │                                                                          │
 * │ Ici, le destinataire est le PROPRIÉTAIRE de la facture, et lui seul :    │
 * │ il ne peut se ré-identifier que lui-même. C'est ce qui distingue cette   │
 * │ route du besoin B4 — la consultation ADMINISTRATIVE d'une facture        │
 * │ nominative — qui reste hors périmètre et devra être journalisée comme    │
 * │ une consultation.                                                        │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ AUCUNE ÉNUMÉRATION N'EST POSSIBLE.                                      │
 * │                                                                          │
 * │ L'identifiant de la COMMANDE est la seule entrée, et le filtre sur       │
 * │ `user_id` est dans la requête : la commande d'autrui n'est jamais        │
 * │ chargée. Il n'existe aucune route qui liste des factures par numéro, ni  │
 * │ qui accepte un numéro de facture en entrée — sonder des numéros          │
 * │ séquentiels ne mène donc nulle part.                                     │
 * │                                                                          │
 * │ 404 pour la facture d'autrui, jamais 403 : un 403 confirmerait qu'elle   │
 * │ existe, et le rythme des ventes se déduirait des numéros.                │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export async function GET(
  request: Request,
  contexte: { params: Promise<{ id: string }> },
): Promise<Response> {
  const garde = await requireUser(request);
  if (!garde.ok) return garde.response;

  const { id } = await contexte.params;
  if (!z.uuid().safeParse(id).success) return errors.introuvable();

  const client = createServiceClient();

  // Le filtre porte sur la COMMANDE et sur son propriétaire, en une passe.
  const { data, error } = await client
    .from('invoices')
    .select(
      `numero, emise_le, montant_ht, montant_tva, montant_ttc, taux_tva, devise, zone, lignes,
       facture_nom, facture_email, facture_adresse`,
    )
    .eq('order_id', id)
    .eq('user_id', garde.appelant.id)
    .maybeSingle();

  if (error) {
    logger.error('Facture illisible', { detail: error.message });
    return errors.interne(error.message);
  }

  // Une commande non payée n'a pas de facture : c'est un 404, pas une panne.
  if (!data) return errors.introuvable();

  return new Response(
    JSON.stringify({
      numero: data.numero,
      emise_le: data.emise_le,
      montant_ht: data.montant_ht,
      montant_tva: data.montant_tva,
      montant_ttc: data.montant_ttc,
      taux_tva: data.taux_tva,
      devise: data.devise,
      zone: data.zone,
      // Le détail figé À L'ÉMISSION, et non relu depuis la commande : une
      // facture est une pièce comptable immuable, et le catalogue a pu bouger
      // depuis. C'est la raison d'être de cette colonne.
      lignes: data.lignes,
      facturation: {
        nom: data.facture_nom,
        email: data.facture_email,
        adresse: data.facture_adresse,
      },
      commande_id: id,
    }),
    {
      status: 200,
      headers: {
        'content-type': 'application/json; charset=utf-8',
        // Une réponse nominative ne se met jamais en cache partagé.
        'cache-control': 'private, no-store',
      },
    },
  );
}

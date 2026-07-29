import { z } from 'zod';

import { requireUser } from '@/lib/auth/session';
import { created, ok, fail } from '@/lib/http/responses';
import { parseJsonBody } from '@/lib/http/validate';
import { createServiceClient } from '@/lib/supabase/clients';
import { apercu, creerCommande, type ApercuCommande } from '@/lib/orders/orders';
import { ZONES } from '@/domain/orders/types';

/**
 * Commandes — §4.2 F9, docs/PLAN.md D4.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ AUCUN PRIX N'EST ACCEPTÉ DU CLIENT.                                     │
 * │                                                                          │
 * │ Le corps de la requête ne comporte ni montant, ni identifiant de ligne,  │
 * │ ni prix unitaire : le serveur relit le panier et la grille tarifaire.    │
 * │ `total_confirme` est la seule valeur chiffrée acceptée, et elle ne sert  │
 * │ QU'À COMPARER — jamais à facturer. Un total confirmé qui ne correspond   │
 * │ pas au calcul du serveur fait échouer la commande ; il ne la modifie     │
 * │ jamais.                                                                  │
 * └──────────────────────────────────────────────────────────────────────────┘
 */

const commandeSchema = z.object({
  /** Zone servie à l'affichage — provisoire, sans effet financier. */
  zone_affichee: z.enum(ZONES).default('international'),
  /**
   * Zone d'encaissement, issue du pays réel du moyen de paiement (§3.3).
   *
   * Transmise par le client à ce stade, faute de prestataire réel : c'est
   * `FakePaymentProvider` qui joue ce rôle en développement. Avec un
   * prestataire branché, elle viendra du pays du moyen de paiement et cessera
   * d'être un paramètre d'entrée — voir la note de l'étape 8 dans PLAN.md.
   */
  zone_encaissement: z.enum(ZONES).default('international'),
  code_promo: z.string().trim().min(3).max(32).optional(),
  total_confirme: z.int().nonnegative().optional(),
});

/** Mise en forme commune, pour que l'aperçu et le refus disent la même chose. */
function corpsApercu(vue: ApercuCommande): Record<string, unknown> {
  return {
    lignes: vue.total.lignes.map((ligne) => ({
      livre_id: ligne.bookId,
      titre: ligne.titre,
      langue: ligne.langue,
      prix_unitaire: ligne.prixUnitaire,
    })),
    refusees: vue.refusees.map((refus) => ({
      livre_id: refus.bookId,
      titre: refus.titre,
      raison: refus.raison,
    })),
    zone: vue.total.zone,
    devise: vue.total.devise,
    sous_total: vue.total.sousTotal,
    remise: vue.total.remise,
    total: vue.total.total,
    // Un code écarté est signalé, jamais silencieux : l'utilisateur doit
    // comprendre pourquoi la remise attendue n'apparaît pas.
    refus_promo: vue.refusPromo,
    zone_divergente: vue.zoneDivergente,
  };
}

export async function POST(request: Request): Promise<Response> {
  const garde = await requireUser(request);
  if (!garde.ok) return garde.response;

  const corps = await parseJsonBody(request, commandeSchema);
  if (!corps.ok) return corps.response;

  const resultat = await creerCommande(garde.appelant.id, {
    zoneAffichee: corps.data.zone_affichee,
    zoneEncaissement: corps.data.zone_encaissement,
    codePromo: corps.data.code_promo ?? null,
    totalConfirme: corps.data.total_confirme ?? null,
  });

  if (!resultat.ok) {
    if (resultat.raison === 'panier_vide') {
      return fail(409, {
        code: 'panier_vide',
        message: 'Votre panier ne contient aucun titre commandable.',
      });
    }

    // D4 point 5 — « le total est recalculé et affiché avant confirmation.
    // Aucun montant n'est jamais modifié silencieusement. » Le nouveau montant
    // part avec le refus, pour que l'utilisateur puisse le confirmer.
    return fail(
      409,
      {
        code: 'confirmation_requise',
        message:
          'Le pays de votre moyen de paiement change la grille tarifaire applicable. Confirmez le nouveau montant.',
      },
      { headers: { 'cache-control': 'private, no-store' } },
    );
  }

  return created({
    commande_id: resultat.orderId,
    // Une commande naît TOUJOURS en attente : le paiement est confirmé par
    // webhook signé, jamais par cette route (CLAUDE.md règle 5).
    statut: 'en_attente',
    ...corpsApercu(resultat.apercu),
  });
}

/** Historique des commandes de l'appelant — §4.2 F8. */
export async function GET(request: Request): Promise<Response> {
  const garde = await requireUser(request);
  if (!garde.ok) return garde.response;

  const client = createServiceClient();
  const { data, error } = await client
    .from('orders')
    .select('id, montant_total, devise, zone, statut, remise, cree_le, paye_le, order_items(book_id, langue, prix_unitaire)')
    .eq('user_id', garde.appelant.id)
    .order('cree_le', { ascending: false })
    .limit(100);

  if (error) {
    return fail(500, { code: 'erreur_interne', message: 'Une erreur est survenue.' }, {
      detailInterne: error.message,
    });
  }

  return ok({
    commandes: (data ?? []).map((commande) => ({
      id: commande.id,
      montant_total: commande.montant_total,
      devise: commande.devise,
      zone: commande.zone,
      statut: commande.statut,
      remise: commande.remise,
      cree_le: commande.cree_le,
      paye_le: commande.paye_le,
      lignes: commande.order_items.map((ligne) => ({
        livre_id: ligne.book_id,
        langue: ligne.langue,
        prix_unitaire: ligne.prix_unitaire,
      })),
    })),
  });
}

/** Aperçu chiffré du panier, sans rien enregistrer. */
export async function PUT(request: Request): Promise<Response> {
  const garde = await requireUser(request);
  if (!garde.ok) return garde.response;

  const corps = await parseJsonBody(request, commandeSchema);
  if (!corps.ok) return corps.response;

  const vue = await apercu(garde.appelant.id, {
    zoneAffichee: corps.data.zone_affichee,
    zoneEncaissement: corps.data.zone_encaissement,
    codePromo: corps.data.code_promo ?? null,
  });

  if (!vue) {
    return fail(409, {
      code: 'panier_vide',
      message: 'Votre panier ne contient aucun titre commandable.',
    });
  }

  return ok(corpsApercu(vue));
}

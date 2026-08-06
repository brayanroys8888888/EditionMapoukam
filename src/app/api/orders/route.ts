import { z } from 'zod';

import { requireUser } from '@/lib/auth/session';
import { created, ok, fail } from '@/lib/http/responses';
import { parseJsonBody } from '@/lib/http/validate';
import { createServiceClient } from '@/lib/supabase/clients';
import { apercu, creerCommande, type ApercuCommande } from '@/lib/orders/orders';
import { ZONES } from '@/domain/orders/types';
import { formateur, lireDevise } from '@/lib/money/affichage';

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

/**
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ AUCUNE ZONE D'ENCAISSEMENT N'EST ACCEPTÉE EN ENTRÉE.                    │
 * │                                                                          │
 * │ §3.3 : la zone est « déterminée par le pays de paiement (et non par     │
 * │ l'adresse IP, plus facilement contournable) ». Elle est donc demandée au │
 * │ prestataire, seul à connaître le moyen de paiement du client.           │
 * │                                                                          │
 * │ `zone_affichee` reste acceptée : elle ne sert QU'À DÉTECTER une          │
 * │ divergence avec le tarif réellement applicable, jamais à le fixer.      │
 * │                                                                          │
 * │ Un test d'architecture échoue si `zone_encaissement` réapparaît dans ce  │
 * │ schéma. Sans lui, un acheteur européen réclamerait le tarif Afrique et   │
 * │ paierait 1 500 FCFA au lieu de 4,99 €.                                  │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
const commandeSchema = z.object({
  /** Zone servie à l'affichage — provisoire, sans effet financier. */
  zone_affichee: z.enum(ZONES).default('international'),
  code_promo: z.string().trim().min(3).max(32).optional(),
  total_confirme: z.int().nonnegative().optional(),
});

/**
 * Titre et slug de chaque (livre, langue) commandé.
 *
 * Une seule lecture pour tout l'historique, quel que soit le nombre de lignes.
 * La clé combine les deux : un même conte acheté en français et en anglais est
 * deux lignes distinctes, avec deux titres distincts.
 */
async function titresParLivreEtLangue(
  client: ReturnType<typeof createServiceClient>,
  livres: readonly string[],
): Promise<Map<string, { slug: string; titre: string }>> {
  const resultat = new Map<string, { slug: string; titre: string }>();
  if (livres.length === 0) return resultat;

  const { data } = await client
    .from('book_translations')
    .select('book_id, langue, titre, books(slug)')
    .in('book_id', [...livres]);

  for (const ligne of data ?? []) {
    const livre = ligne.books as unknown as { slug: string } | null;
    if (!livre) continue;
    resultat.set(`${ligne.book_id}:${ligne.langue}`, { slug: livre.slug, titre: ligne.titre });
  }
  return resultat;
}

/**
 * Mise en forme commune, pour que l'aperçu et le refus disent la même chose.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ CHAQUE MONTANT SORT DEUX FOIS : EN ENTIER, ET FORMATÉ.                  │
 * │                                                                          │
 * │ L'entier reste l'autorité — il sert à comparer et à confirmer un total. │
 * │ La chaîne est pour un CLIENT, qui ne peut pas formater : le nombre de    │
 * │ décimales dépend de la devise, et `lireDevise` est un module serveur.   │
 * │                                                                          │
 * │ Sans elle, le tiroir de panier diviserait par cent dans le navigateur —  │
 * │ juste en euro, faux d'un facteur cent en franc CFA, qui n'a pas de       │
 * │ sous-unité. C'est la raison d'être de ces trois champs.                  │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
async function corpsApercu(vue: ApercuCommande): Promise<Record<string, unknown>> {
  const afficher = formateur(await lireDevise(vue.total.devise));

  return {
    lignes: vue.total.lignes.map((ligne) => ({
      livre_id: ligne.bookId,
      titre: ligne.titre,
      langue: ligne.langue,
      prix_unitaire: ligne.prixUnitaire,
      prix_affichage: afficher(ligne.prixUnitaire),
    })),
    refusees: vue.refusees.map((refus) => ({
      livre_id: refus.bookId,
      titre: refus.titre,
      raison: refus.raison,
    })),
    zone: vue.total.zone,
    devise: vue.total.devise,
    sous_total: vue.total.sousTotal,
    sous_total_affichage: afficher(vue.total.sousTotal),
    remise: vue.total.remise,
    remise_affichage: afficher(vue.total.remise),
    total: vue.total.total,
    total_affichage: afficher(vue.total.total),
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

  const resultat = await creerCommande(garde.appelant, {
    zoneAffichee: corps.data.zone_affichee,
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
    ...(await corpsApercu(resultat.apercu)),
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

  // ┌──────────────────────────────────────────────────────────────────────┐
  // │ SANS CETTE JOINTURE, L'HISTORIQUE AFFICHERAIT DES UUID.              │
  // │                                                                      │
  // │ `order_items` ne porte que `book_id` : un identifiant technique. Le   │
  // │ résoudre côté client demanderait un appel par ligne, sans même        │
  // │ connaître les slugs. Aucun coût de sécurité — l'utilisateur possède   │
  // │ déjà ces titres.                                                     │
  // │                                                                      │
  // │ Le titre est repris à la LANGUE DE LA LIGNE, et non à celle de        │
  // │ l'interface : c'est la version qu'il a achetée qui figure sur sa      │
  // │ commande. Une jointure imbriquée ne sait pas dépendre d'une valeur de │
  // │ la ligne parente, d'où cette seconde lecture.                        │
  // └──────────────────────────────────────────────────────────────────────┘
  const commandes = data ?? [];
  const livres = [...new Set(commandes.flatMap((c) => c.order_items.map((l) => l.book_id)))];
  const titres = await titresParLivreEtLangue(client, livres);

  return ok({
    commandes: commandes.map((commande) => ({
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
        ...(titres.get(`${ligne.book_id}:${ligne.langue}`) ?? { slug: null, titre: null }),
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

  const vue = await apercu(garde.appelant, {
    zoneAffichee: corps.data.zone_affichee,
    codePromo: corps.data.code_promo ?? null,
  });

  if (!vue) {
    return fail(409, {
      code: 'panier_vide',
      message: 'Votre panier ne contient aucun titre commandable.',
    });
  }

  return ok(await corpsApercu(vue));
}

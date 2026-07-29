import { z } from 'zod';

import { requireUser } from '@/lib/auth/session';
import { ok, errors, fail } from '@/lib/http/responses';
import { parseJsonBody, parseSearchParams } from '@/lib/http/validate';
import { createServiceClient } from '@/lib/supabase/clients';
import { ajouterAuPanier, titresDuPanier, viderPanier } from '@/lib/orders/cart';
import { tarifer } from '@/domain/orders/pricing';
import { ZONES } from '@/domain/orders/types';

/**
 * Panier — §4.2 F9.
 *
 * Le panier est nominatif : toutes les routes exigent un compte connecté, et
 * agissent sur le panier de l'appelant. Aucun identifiant de panier ne circule,
 * ce qui retire toute possibilité d'agir sur celui d'autrui.
 *
 * Les prix rendus ici sont INDICATIFS : ils dépendent de la zone d'affichage,
 * qui est provisoire (D4 point 5). Le montant qui fait foi est celui recalculé
 * à la création de la commande, depuis la zone d'encaissement.
 */

const requeteSchema = z.object({
  zone: z.enum(ZONES).default('international'),
});

const ajoutSchema = z.object({
  book_id: z.uuid(),
  langue: z.enum(['fr', 'en']).default('fr'),
});

export async function GET(request: Request): Promise<Response> {
  const garde = await requireUser(request);
  if (!garde.ok) return garde.response;

  const query = parseSearchParams(request, requeteSchema);
  if (!query.ok) return query.response;

  const client = createServiceClient();
  const titres = await titresDuPanier(garde.appelant.id, { client });
  const tarification = tarifer(titres, query.data.zone);

  return ok({
    lignes: tarification.lignes.map((ligne) => ({
      livre_id: ligne.bookId,
      titre: ligne.titre,
      langue: ligne.langue,
      prix_unitaire: ligne.prixUnitaire,
      devise: ligne.devise,
    })),
    // Un titre écarté est nommé, avec son motif : un panier qui se vide en
    // silence est perçu comme une panne.
    refusees: tarification.refusees.map((refus) => ({
      livre_id: refus.bookId,
      titre: refus.titre,
      raison: refus.raison,
    })),
    zone: tarification.zone,
    // Aucun total ici : il dépend de la zone d'ENCAISSEMENT, que seule la
    // création de la commande connaît. Annoncer un total depuis la zone
    // d'affichage reviendrait à promettre un montant qu'on ne facturera
    // peut-être pas.
  });
}

export async function POST(request: Request): Promise<Response> {
  const garde = await requireUser(request);
  if (!garde.ok) return garde.response;

  const corps = await parseJsonBody(request, ajoutSchema);
  if (!corps.ok) return corps.response;

  const resultat = await ajouterAuPanier(
    garde.appelant.id,
    corps.data.book_id,
    corps.data.langue,
  );

  if (!resultat.ok) {
    if (resultat.raison === 'livre_introuvable') return errors.introuvable();

    // Message explicite : sans lui, l'utilisateur croit à une panne alors que
    // le refus est intentionnel.
    return fail(409, {
      code: resultat.raison,
      message:
        resultat.raison === 'deja_possede'
          ? 'Vous possédez déjà ce titre. Il reste accessible depuis votre bibliothèque.'
          : 'Ce titre n’est pas vendu à l’unité.',
    });
  }

  return ok({ ajoute: true });
}

export async function DELETE(request: Request): Promise<Response> {
  const garde = await requireUser(request);
  if (!garde.ok) return garde.response;

  await viderPanier(garde.appelant.id);
  return ok({ vide: true });
}

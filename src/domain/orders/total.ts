import { sumAmounts } from '@/domain/money';
import { calculerRemise, type CodePromo, type ResultatPromo } from './promo';
import type { LigneCommande, TotalCommande, Zone } from './types';

/**
 * Calcul du total d'une commande.
 *
 * Module PUR, et c'est ce qui permet de l'éprouver sur les cas qui coûtent
 * cher : devises sans sous-unité, remise supérieure au panier, panier vide.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LE TOTAL N'EST JAMAIS CALCULÉ À PARTIR D'UN MONTANT REÇU DU CLIENT.     │
 * │                                                                          │
 * │ Les lignes arrivent ici avec un prix relu en base, jamais transmis par   │
 * │ le navigateur. C'est le point de vigilance nommé de l'étape : sans lui,  │
 * │ un panier à un centime suffirait à acheter le catalogue.                │
 * └──────────────────────────────────────────────────────────────────────────┘
 */

export class TotalError extends Error {}

export type ResultatTotal =
  | { ok: true; total: TotalCommande; refusPromo: null }
  | { ok: true; total: TotalCommande; refusPromo: ResultatPromo & { ok: false } }
  | { ok: false; raison: 'panier_vide' };

/**
 * Total d'une commande, remise comprise.
 *
 * Un code refusé ne fait PAS échouer le calcul : le total est rendu sans
 * remise, avec le motif du refus. L'utilisateur doit pouvoir commander malgré
 * un code expiré — l'inverse le bloquerait sur un panier valide.
 */
export function calculerTotal(
  lignes: readonly LigneCommande[],
  zone: Zone,
  options: { promo?: CodePromo | null; maintenant: Date },
): ResultatTotal {
  if (lignes.length === 0) {
    return { ok: false, raison: 'panier_vide' };
  }

  // `sumAmounts` refuse les devises hétérogènes plutôt que de produire un
  // total silencieusement faux. La résolution de zone garantit en amont
  // qu'elles sont homogènes ; cette barrière reste utile si elle échouait.
  const somme = sumAmounts(
    lignes.map((ligne) => ({ montant: ligne.prixUnitaire, devise: ligne.devise })),
  );

  const base: Omit<TotalCommande, 'remise' | 'total'> = {
    lignes,
    zone,
    devise: somme.devise,
    sousTotal: somme.montant,
  };

  if (options.promo === undefined || options.promo === null) {
    return {
      ok: true,
      total: { ...base, remise: 0, total: somme.montant },
      refusPromo: null,
    };
  }

  // La zone est transmise à la validation du code : un code à montant fixe est
  // cantonné à une grille tarifaire, et la devise seule ne suffit pas à l'y
  // cantonner — la zone `afrique` couvre XAF et XOF (D4 point 4).
  const remise = calculerRemise(
    options.promo,
    somme.montant,
    somme.devise,
    options.maintenant,
    zone,
  );
  if (!remise.ok) {
    return {
      ok: true,
      total: { ...base, remise: 0, total: somme.montant },
      refusPromo: remise,
    };
  }

  return {
    ok: true,
    total: { ...base, remise: remise.remise, total: somme.montant - remise.remise },
    refusPromo: null,
  };
}

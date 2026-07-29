/**
 * Validation d'un code promotionnel — §3.4, §4.3 F12.
 *
 * Module PUR : il reçoit une ligne `promo_codes` déjà lue et l'instant courant,
 * fourni par l'horloge injectable. La lecture directe de l'heure est interdite
 * ici, et vérifiée par un test qui parcourt `src/domain`.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ UN CODE PROMOTIONNEL NE DESCEND JAMAIS UN TOTAL SOUS ZÉRO.              │
 * │                                                                          │
 * │ Une remise de 10 € sur un panier de 4,99 € donnerait un total négatif —  │
 * │ c'est-à-dire un remboursement offert par un code de réduction. La remise │
 * │ est donc plafonnée au sous-total, et c'est le plafonnement, pas le       │
 * │ montant du code, qui décide de ce qui est déduit.                       │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
import { applyPercentage } from '@/domain/money';

export interface CodePromo {
  id: string;
  code: string;
  type: 'montant' | 'pourcentage';
  /** Montant en plus petite unité si `montant`, pourcentage entier si `pourcentage`. */
  valeur: number;
  /** Renseignée seulement pour un code de type `montant`. */
  devise: string | null;
  expireLe: Date | null;
  actif: boolean;
  usageMax: number | null;
  usageCount: number;
}

export type RefusPromo =
  | 'inconnu'
  | 'inactif'
  | 'expire'
  | 'epuise'
  | 'devise_incompatible';

export type ResultatPromo =
  | { ok: true; remise: number }
  | { ok: false; raison: RefusPromo };

/**
 * Remise applicable à un sous-total.
 *
 * @param maintenant instant courant, issu de l'horloge injectable — jamais lu
 *                   ici, pour que la console de simulation puisse le déplacer.
 */
export function calculerRemise(
  promo: CodePromo | null,
  sousTotal: number,
  devise: string,
  maintenant: Date,
): ResultatPromo {
  if (!promo) return { ok: false, raison: 'inconnu' };
  if (!promo.actif) return { ok: false, raison: 'inactif' };

  // Comparaison stricte : un code qui expire à 12 h 00 est refusé à 12 h 00.
  if (promo.expireLe && promo.expireLe.getTime() <= maintenant.getTime()) {
    return { ok: false, raison: 'expire' };
  }

  if (promo.usageMax !== null && promo.usageCount >= promo.usageMax) {
    return { ok: false, raison: 'epuise' };
  }

  if (promo.type === 'pourcentage') {
    // Un pourcentage n'a pas de devise : 20 % valent 20 % en euros comme en
    // francs CFA. C'est le seul type applicable à toutes les zones.
    return { ok: true, remise: sousTotal - applyPercentage(sousTotal, promo.valeur) };
  }

  // Un code en MONTANT est libellé dans une devise. L'appliquer à une autre
  // reviendrait à convertir sans taux de change — 5 sur un panier en FCFA
  // retirerait cinq francs là où le code promettait cinq euros.
  if (promo.devise !== devise) {
    return { ok: false, raison: 'devise_incompatible' };
  }

  return { ok: true, remise: Math.min(promo.valeur, sousTotal) };
}

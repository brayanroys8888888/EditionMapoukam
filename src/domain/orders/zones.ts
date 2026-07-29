import type { Zone } from './types';

/**
 * Zone tarifaire d'un pays de paiement — §3.3.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LA ZONE VIENT DU PAYS DU MOYEN DE PAIEMENT, JAMAIS DU CLIENT.           │
 * │                                                                          │
 * │ §3.3 : les zones sont « déterminées par le pays de paiement (et non par  │
 * │ l'adresse IP, plus facilement contournable) ». Le pays est donc demandé  │
 * │ au prestataire, seul à le connaître, et cette fonction en tire la zone.  │
 * │                                                                          │
 * │ Aucune route n'accepte de zone d'encaissement en entrée. Un test         │
 * │ d'architecture échoue si le champ réapparaît dans un schéma de           │
 * │ validation : sans lui, un acheteur européen réclamerait le tarif Afrique │
 * │ et paierait 1 500 FCFA au lieu de 4,99 €.                               │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Module PUR : une correspondance, rien d'autre.
 */

/**
 * Pays servis par la grille Afrique.
 *
 * La liste est explicite plutôt que déduite d'un continent : « Afrique » est
 * ici une ZONE TARIFAIRE, pas une géographie. Elle recouvre les marchés visés
 * par §5.1 — l'Afrique francophone — et §3.3, qui adosse cette zone au paiement
 * par Mobile Money.
 *
 * Codes ISO 3166-1 alpha-2. Ajouter un pays est une décision commerciale : il
 * faudra aussi que chaque titre vendu y ait un prix, ce que la validation de
 * publication impose.
 */
const PAYS_ZONE_AFRIQUE: ReadonlySet<string> = new Set([
  // Zone franc CFA — UEMOA (XOF)
  'BJ', 'BF', 'CI', 'GW', 'ML', 'NE', 'SN', 'TG',
  // Zone franc CFA — CEMAC (XAF)
  'CM', 'CF', 'TD', 'CG', 'GQ', 'GA',
  // Autres marchés francophones du continent
  'CD', 'DJ', 'GN', 'KM', 'MG', 'MR', 'RW', 'BI',
  'DZ', 'MA', 'TN',
]);

/**
 * Zone tarifaire applicable à un pays.
 *
 * Un pays inconnu ou absent retombe sur `international`, jamais sur `afrique` :
 * le repli doit se faire vers la grille la plus CHÈRE. L'inverse ferait d'une
 * donnée manquante une remise automatique, et un prestataire qui cesserait de
 * renseigner le pays offrirait le tarif réduit à tout le monde.
 */
export function zonePourPays(codePays: string | null | undefined): Zone {
  if (!codePays) return 'international';
  return PAYS_ZONE_AFRIQUE.has(codePays.trim().toUpperCase()) ? 'afrique' : 'international';
}

/** Les pays de la zone Afrique, pour l'affichage et les tests. */
export function paysZoneAfrique(): readonly string[] {
  return [...PAYS_ZONE_AFRIQUE].sort();
}

import { normaliserPays, zonePourPays } from '@/domain/orders/zones';
import type { Zone } from '@/domain/orders/types';

/**
 * Pays du visiteur, tel que l'hébergeur le déduit de son adresse IP.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ CE PAYS N'ENGAGE AUCUN MONTANT.                                         │
 * │                                                                          │
 * │ §3.3 écarte l'adresse IP pour la zone d'ENCAISSEMENT : elle se contourne │
 * │ avec un VPN. Elle sert ici à deux choses seulement, que D4 point 5       │
 * │ prévoyait dès l'origine :                                               │
 * │                                                                          │
 * │  · la zone d'AFFICHAGE — le catalogue montre 1 500 FCFA à Douala et      │
 * │    4,99 € à Lyon, sans effet financier ;                                 │
 * │  · le pays PRÉREMPLI au récapitulatif, que le client peut changer, et    │
 * │    auquel le paiement est ensuite verrouillé chez le prestataire.        │
 * │                                                                          │
 * │ Un visiteur au VPN voit donc le tarif Afrique, mais ne peut le payer     │
 * │ qu'avec un moyen de paiement du pays qu'il déclare.                      │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * `x-vercel-ip-country` est posé par Vercel sur chaque requête entrante. Sans
 * lui — pile locale, VPS derrière nginx — le pays est inconnu et la zone
 * retombe sur `international`, la plus chère : une donnée manquante ne vaut
 * jamais remise.
 */
export const ENTETE_PAYS_VISITEUR = 'x-vercel-ip-country';

export function paysDuVisiteur(entetes: Pick<Headers, 'get'>): string | null {
  return normaliserPays(entetes.get(ENTETE_PAYS_VISITEUR));
}

/** Zone d'affichage du visiteur — provisoire, sans effet financier. */
export function zoneDuVisiteur(entetes: Pick<Headers, 'get'>): Zone {
  return zonePourPays(paysDuVisiteur(entetes));
}

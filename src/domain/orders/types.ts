/**
 * Types du panier et des commandes.
 *
 * Les montants circulent TOUJOURS dans la plus petite unité de leur devise, en
 * entier — 499 pour 4,99 €, 1500 pour 1 500 FCFA. Aucun flottant ne traverse
 * cette couche. Voir `src/lib/money`, seule autorité sur les décimales.
 */

export const ZONES = ['international', 'afrique'] as const;
export type Zone = (typeof ZONES)[number];

/** Prix d'un titre pour une zone donnée, tel qu'il est écrit en base. */
export interface PrixZone {
  zone: Zone;
  montant: number;
  /** Portée par la LIGNE, jamais déduite de la zone (docs/PLAN.md D4 point 4). */
  devise: string;
}

/** Un titre candidat à l'achat, avec sa grille tarifaire complète. */
export interface TitreAchetable {
  bookId: string;
  titre: string;
  /** Version linguistique choisie. INFORMATIVE : un droit porte sur le livre (D2). */
  langue: 'fr' | 'en';
  disponibleAchat: boolean;
  publie: boolean;
  /** L'utilisateur possède-t-il déjà ce titre ? */
  dejaPossede: boolean;
  prix: readonly PrixZone[];
}

/** Une ligne de commande, une fois le prix résolu. */
export interface LigneCommande {
  bookId: string;
  titre: string;
  langue: 'fr' | 'en';
  prixUnitaire: number;
  devise: string;
  zone: Zone;
}

/**
 * Motif de refus d'un titre.
 *
 * Chaque motif est distinct parce que chacun appelle une action différente de
 * l'utilisateur : retirer la ligne, attendre, ou aller lire le titre qu'il
 * possède déjà.
 */
export type RefusLigne =
  | 'non_disponible_achat'
  | 'non_publie'
  | 'deja_possede'
  /**
   * Aucun prix dans la zone d'encaissement de l'acheteur.
   *
   * Cas résiduel : une zone tarifaire ouverte après la publication du titre. La
   * validation de publication (migration 0024) exige un prix dans chaque zone
   * active, ce qui rend ce refus impossible pour les zones déjà en place.
   */
  | 'sans_prix_dans_la_zone';

export interface LigneRefusee {
  bookId: string;
  titre: string;
  raison: RefusLigne;
}

export interface TotalCommande {
  lignes: readonly LigneCommande[];
  zone: Zone;
  devise: string;
  sousTotal: number;
  remise: number;
  total: number;
}

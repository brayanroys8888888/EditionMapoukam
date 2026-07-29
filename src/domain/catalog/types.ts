import type { AccessDecision } from '@/domain/access/types';

/**
 * Représentations renvoyées par l'API du catalogue.
 *
 * Ce que ces types NE contiennent pas est aussi important que ce qu'ils
 * contiennent : ni `fichier_lecture`, ni `fichier_telechargement`, ni aucun
 * chemin de stockage. Le contenu passe exclusivement par une route serveur qui
 * vérifie les droits puis émet une URL signée (CLAUDE.md règle 3).
 */
export interface PrixAffiche {
  montant: number;
  devise: string;
  /**
   * Zone réellement appliquée, qui peut différer de celle demandée : un titre
   * sans prix pour sa zone retombe sur la zone internationale (D4 point 8).
   */
  zone: string;
  /** Montant formaté selon les décimales de la devise. */
  affichage: string;
}

/**
 * Achat impossible faute de prix dans la zone de l'acheteur — arbitrage N1.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LE TITRE RESTE AFFICHÉ, L'ACHAT SEUL EST DÉSACTIVÉ.                     │
 * │                                                                          │
 * │ Le retirer du catalogue appauvrirait la découverte : il peut être        │
 * │ parfaitement lisible par abonnement, ou gratuit. Et on ne montre JAMAIS  │
 * │ le prix d'une autre zone, même à titre indicatif — c'est exactement      │
 * │ l'incohérence que le retrait du repli a supprimée.                       │
 * │                                                                          │
 * │ Sa présence est une ANOMALIE : depuis la migration 0024, un titre publié │
 * │ et vendu à l'unité a un prix dans chaque zone active. Elle est donc      │
 * │ journalisée, pas seulement affichée.                                     │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export interface AchatHorsZone {
  code: 'hors_zone';
  message: string;
}

export interface EntreeCatalogue {
  id: string;
  slug: string;
  titre: string;
  resume: string | null;
  auteur: string;
  illustrateur: string | null;
  age_min: number | null;
  age_max: number | null;
  origine_culturelle: string | null;
  themes: string[];
  couverture_url: string | null;
  nb_pages: number | null;
  langues: string[];
  publie_le: string | null;
  inclus_abonnement: boolean;
  disponible_achat: boolean;
  gratuit: boolean;
  prix: PrixAffiche | null;
  /**
   * Renseigné quand le titre est vendu à l'unité mais sans prix dans la zone
   * demandée. L'achat doit alors être désactivé, la lecture restant normale.
   */
  achat_hors_zone: AchatHorsZone | null;
  /** Décision du moteur de droits pour l'appelant. */
  acces: AccessDecision;
}

export interface PageCatalogue {
  entrees: EntreeCatalogue[];
  page: number;
  taille: number;
  total: number;
  pages: number;
}

export interface FicheLivre extends EntreeCatalogue {
  /** Titres proches, pour la section « suggestions » (§4.1 F3). */
  suggestions: SuggestionLivre[];
  /** Nombre de pages consultables sans droit d'accès complet. */
  pages_extrait: number;
}

export interface SuggestionLivre {
  id: string;
  slug: string;
  titre: string;
  couverture_url: string | null;
}

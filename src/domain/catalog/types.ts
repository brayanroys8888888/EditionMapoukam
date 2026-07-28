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

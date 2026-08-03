import type { AccessDecision } from '@/domain/access/types';
import type { UrlsCouverture } from '@/lib/storage/covers';

/**
 * Régions du conte — l'énumération `region_conte` de la base, à l'identique.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ DES CLÉS ASCII, JAMAIS DES LIBELLÉS D'AFFICHAGE.                        │
 * │                                                                          │
 * │ Le défaut qui a motivé cette colonne était une APOSTROPHE : le corpus    │
 * │ écrivait « Afrique de l'Ouest » avec une apostrophe droite, un test avec │
 * │ une apostrophe typographique. Deux chaînes pour une seule région.        │
 * │                                                                          │
 * │ `afrique_ouest` ne contient aucun caractère qui puisse s'écrire de deux  │
 * │ façons. Les libellés vivent dans les fichiers de traduction — où ils     │
 * │ diffèrent de toute façon en français et en anglais.                      │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export type RegionConte =
  | 'afrique_ouest'
  | 'sahel'
  | 'afrique_centrale'
  | 'afrique_australe'
  | 'afrique_est';

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
  /**
   * Région du conte — énumération FERMÉE à cinq valeurs, qui pilote la couleur
   * d'affichage et rien d'autre.
   *
   * À ne pas confondre avec `origine_culturelle`, qui reste du texte libre et
   * porte la finesse éditoriale (« Bassin du Congo », « conte akan — Ghana »).
   * La couleur se choisit sur `region` ; le texte s'affiche depuis l'autre.
   */
  region: RegionConte | null;
  /** @deprecated Une seule taille, sous forme de chemin. Lire `couverture`. */
  couverture_url: string | null;
  /**
   * Les trois tailles, en URL absolues, prêtes pour un `srcset`.
   *
   * `null` pour un titre sans couverture — un livre en cours d'ingestion. Une
   * interface qui afficherait une image cassée aurait pu afficher un substitut.
   */
  couverture: UrlsCouverture | null;
  nb_pages: number | null;
  langues: string[];
  publie_le: string | null;
  /**
   * Date d'entrée dans l'abonnement, ou `null`.
   *
   * ┌────────────────────────────────────────────────────────────────────────┐
   * │ CALCULÉE EN BASE, JAMAIS PAR L'INTERFACE.                              │
   * │                                                                        │
   * │ Elle dépend de `fenetre_nouveaute_jours`, que l'administration déplace │
   * │ À LA SECONDE et rétroactivement. Recopier la règle des trois mois dans │
   * │ le navigateur garantirait qu'un jour le catalogue annonce une date que │
   * │ le moteur de droits contredit.                                         │
   * └────────────────────────────────────────────────────────────────────────┘
   *
   * `null` couvre trois cas distincts, et l'interface n'a pas à les
   * distinguer : le titre y est déjà, il n'y entrera jamais, ou il n'est pas
   * publié.
   */
  abonnement_a_partir_du: string | null;
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

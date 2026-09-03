import type { AccessDecision } from '@/domain/access/types';
import type { UrlsCouverture } from '@/lib/storage/covers';

/*
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ `REGIONS_CONTE` ET `RegionConte` ONT QUITTÉ CE FICHIER — migration 0071.│
 * │                                                                          │
 * │ La région ne range plus rien : elle ne valait que pour les contes, et    │
 * │ poser le filtre faisait disparaître d'un coup tous les livrets           │
 * │ pédagogiques. Le catalogue public, la fiche, la bibliothèque et l'écran  │
 * │ d'administration se rangent désormais par THÈME, qui vaut pour les deux  │
 * │ supports.                                                                │
 * │                                                                          │
 * │ Ce qui subsiste, et pourquoi : la COLONNE `books.region` et l'énumération│
 * │ `region_conte` restent en base — une migration ne jette pas une donnée   │
 * │ que l'éditeur a saisie. Elles n'ont simplement plus de lecteur côté      │
 * │ application, et garder ici une liste que personne ne lit en aurait fait  │
 * │ une seconde source de vérité à tenir d'accord avec le SQL pour rien.     │
 * │                                                                          │
 * │ Les cinq mêmes noms survivent dans `src/components/motif/teinte.ts`,     │
 * │ sous `PALETTES` — mais ce sont là des EMPLACEMENTS DE COULEUR, pas une   │
 * │ donnée du titre : un thème quelconque y est projeté par empreinte.       │
 * └──────────────────────────────────────────────────────────────────────────┘
 */

/**
 * Le TYPE DE SUPPORT — l'énumération `document_type` de la base (migration 0061).
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ UNE COLONNE, PAS UNE SECONDE TABLE — ET DONC PAS UN SECOND CATALOGUE.   │
 * │                                                                          │
 * │ Un livret pédagogique partage TOUT avec un conte : les droits, les prix, │
 * │ l'ingestion, la lecture en ligne, le téléchargement, les versions        │
 * │ linguistiques. Ce qui les sépare tient en un mot — ce qu'on vient y      │
 * │ chercher. Le catalogue les range donc ensemble et sait les séparer sur   │
 * │ demande ; il ne les range pas dans deux endroits qui divergeraient.      │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export const TYPES_DOCUMENT = ['conte', 'livret_pedagogique'] as const;

export type TypeDocument = (typeof TYPES_DOCUMENT)[number];

/**
 * L'ORIENTATION de la mise en page — `page_orientation` (migration 0061).
 *
 * Elle pilote le format des vignettes et de la liseuse, rien d'autre. Elle est
 * DÉCLARÉE au dépôt et jamais déduite du fichier : un livret porte souvent une
 * couverture portrait devant des planches paysage, et une page double d'album
 * mesurerait « paysage » sur un conte qui n'en est pas un.
 */
export const ORIENTATIONS_PAGE = ['paysage', 'portrait'] as const;

export type OrientationPage = (typeof ORIENTATIONS_PAGE)[number];

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
  /*
   * IL N'Y A PLUS DE `region` ICI.
   *
   * La migration 0071 a retiré la région du catalogue public : elle ne
   * s'appliquait qu'aux contes, et faisait donc disparaître tous les livrets
   * pédagogiques dès qu'on s'en servait comme filtre. La colonne et
   * l'énumération restent en base — la donnée n'est pas détruite — mais elle
   * ne voyage plus jusqu'à l'interface.
   *
   * Ce qu'elle pilotait, la COULEUR, se choisit désormais sur `themes` :
   * `teinteDepuisThemes` dans `src/components/motif/teinte.ts`. Le thème vaut
   * pour les deux supports, ce que la région ne pouvait pas faire.
   *
   * `origine_culturelle` — texte libre, « Bassin du Congo », « conte akan —
   * Ghana » — reste intacte : c'est elle qui portait la finesse éditoriale, et
   * elle s'affiche toujours.
   */
  /**
   * Conte ou livret pédagogique. JAMAIS `null` : la colonne est NOT NULL avec
   * un défaut depuis la migration 0061, si bien qu'un titre en a toujours un.
   */
  type_document: TypeDocument;
  /** Orientation de la mise en page. NOT NULL elle aussi. */
  orientation: OrientationPage;
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
  /*
   * Il n'y a PAS de date d'entrée dans l'abonnement.
   *
   * `abonnement_a_partir_du` vivait ici jusqu'à la migration 0064, qui a
   * retiré la fenêtre de vente exclusive de trois mois. Un titre marqué
   * `inclus_abonnement` y est dès sa publication : la seule question qui
   * restait — « à partir de quand ? » — n'a plus de réponse à donner.
   *
   * `inclus_abonnement` suffit donc à l'interface, et c'est un booléen LU,
   * jamais dérivé.
   */
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
  /**
   * LE TEXTE LONG de la fiche produit — distinct du résumé, et traduit.
   *
   * ┌───────────────────────────────────────────────────────────────────┐
   * │ DEUX CHAMPS, DEUX USAGES — et c'est pour cela qu'ils sont deux.       │
   * │                                                                        │
   * │ `resume` est la PHRASE D'ACCROCHE : elle tient dans une carte, elle    │
   * │ part dans les métadonnées de référencement, elle doit rester courte.   │
   * │                                                                        │
   * │ `description` est le TEXTE DE PRÉSENTATION : plusieurs paragraphes, lu │
   * │ par qui est déjà sur la fiche et hésite à acheter.                    │
   * │                                                                        │
   * │ Un seul champ pour les deux faisait des cartes illisibles ou des      │
   * │ fiches indigentes, selon la longueur que l'éditeur choisissait.       │
   * └───────────────────────────────────────────────────────────────────┘
   */
  description: string | null;
  /** Titres proches, pour la section « suggestions » (§4.1 F3). */
  suggestions: SuggestionLivre[];
  /** Nombre de pages consultables sans droit d'accès complet. */
  pages_extrait: number;
  /**
   * Note moyenne et effectif des avis PUBLIÉS — lus, jamais recalculés ici.
   *
   * `null` quand aucun avis n'est publié : l'absence de note et la note zéro
   * ne sont pas la même chose, et les confondre afficherait « 0/5 » sur un
   * titre que personne n'a encore commenté.
   */
  avis: SyntheseAvis | null;
}

/** Synthèse des avis d'un titre, calculée par `book_review_summary`. */
export interface SyntheseAvis {
  moyenne: number;
  nombre: number;
}

export interface SuggestionLivre {
  id: string;
  slug: string;
  titre: string;
  /**
   * @deprecated CHEMIN BRUT DE STOCKAGE, jamais une URL affichable.
   *
   * ┌────────────────────────────────────────────────────────────────────────┐
   * │ NE JAMAIS LE POSER DANS UN `src`.                                     │
   * │                                                                        │
   * │ Il vaut `covers/<jeton>/fiche.webp` — sans schéma ni hôte. Un          │
   * │ navigateur le résout donc RELATIVEMENT à la page courante, ce qui      │
   * │ donne `/fr/contes/covers/<jeton>/fiche.webp` et un 404.                │
   * │                                                                        │
   * │ Le défaut est resté invisible longtemps parce qu'il ne casse rien de   │
   * │ visible : l'image manque, la mise en page tient, et la section         │
   * │ « Dans la même tradition » ressemble à une liste de titres sans        │
   * │ illustration — c'est-à-dire à une intention, pas à une panne.          │
   * │                                                                        │
   * │ Lire `couverture` à la place.                                          │
   * └────────────────────────────────────────────────────────────────────────┘
   */
  couverture_url: string | null;
  /** Les trois tailles, en URL ABSOLUES. `null` sans couverture. */
  couverture: UrlsCouverture | null;
}

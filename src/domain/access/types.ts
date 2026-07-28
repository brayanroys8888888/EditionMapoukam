/**
 * Types du moteur de droits d'accès.
 *
 * Ce fichier ne contient AUCUNE règle : les règles vivent dans la fonction
 * PostgreSQL `access_for_books` (migration 0016), unique implémentation,
 * appelée aussi bien par l'application que par les politiques RLS. Réécrire ces
 * règles ici les ferait diverger, et la divergence porterait sur qui a le droit
 * de lire quoi.
 *
 * Un test parcourt ce répertoire et échoue s'il y trouve une décision d'accès.
 */

/**
 * Motif de la décision : le titre LE PLUS FORT détenu par l'utilisateur.
 *
 *   purchase     — il a acheté ce titre
 *   granted      — un administrateur lui a octroyé l'accès, ou il est admin
 *   subscription — son abonnement couvre ce titre
 *   free         — le titre est gratuit pour tous
 *   preview      — il n'a droit qu'à l'extrait
 *   none         — le titre n'est pas exploitable, même pas en extrait
 */
export type MotifAcces = 'purchase' | 'granted' | 'subscription' | 'free' | 'preview' | 'none';

/**
 * Ordre de force des motifs, du plus fort au plus faible.
 *
 * Exposé pour l'affichage et les tests. Ce n'est PAS l'ordre d'évaluation de
 * `canRead`, qui est un simple OU logique où l'ordre n'a aucune importance.
 */
export const ORDRE_MOTIFS: readonly MotifAcces[] = [
  'purchase',
  'granted',
  'subscription',
  'free',
  'preview',
  'none',
] as const;

export interface AccessDecision {
  /**
   * Droit de lire le titre en ligne, dans son intégralité.
   *
   * Résultat d'un OU logique entre toutes les sources de droit : titre gratuit,
   * achat, octroi manuel, abonnement.
   */
  canRead: boolean;

  /**
   * Droit de télécharger le fichier.
   *
   * ┌────────────────────────────────────────────────────────────────────────┐
   * │ NE SE DÉDUIT JAMAIS DE `reason`.                                       │
   * │ Un conte à la fois gratuit et acheté renvoie reason = 'purchase' ET    │
   * │ canDownload = true ; un abonné actif sur le même titre renvoie         │
   * │ reason = 'subscription' ET canDownload = false. L'interface doit lire  │
   * │ ce champ, jamais interpréter le motif.                                 │
   * └────────────────────────────────────────────────────────────────────────┘
   *
   * N'est accordé que par un achat ou un octroi manuel. Jamais par un
   * abonnement (§3.2), jamais parce qu'un titre est gratuit.
   */
  canDownload: boolean;

  /** Motif, pour le débogage et pour le libellé affiché à l'utilisateur. */
  reason: MotifAcces;
}

/** Décision associée à un titre, pour les résolutions par lot. */
export interface AccessDecisionParLivre extends AccessDecision {
  bookId: string;
}

/** Décision d'un visiteur sur un titre inexploitable : le refus le plus net. */
export const ACCES_REFUSE: AccessDecision = {
  canRead: false,
  canDownload: false,
  reason: 'none',
};

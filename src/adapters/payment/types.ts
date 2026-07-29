/**
 * Contrat du prestataire de paiement.
 *
 * §7.3.4 : « la logique métier ne doit jamais dépendre directement de l'API
 * d'un prestataire ». Ce fichier est cette couche d'abstraction. Rien ici ne
 * nomme Stripe, Paddle ou un agrégateur africain, et rien ne doit jamais le
 * faire : un type qui porterait le nom d'un prestataire ferait entrer sa
 * terminologie dans toute la base de code.
 *
 * Les vocabulaires diffèrent d'un prestataire à l'autre — « session »,
 * « intent », « transaction ». Les noms retenus ici sont ceux du métier, en
 * français, et c'est au futur adaptateur réel de faire la traduction.
 */

/** Montant, toujours dans la plus petite unité de sa devise (docs/PLAN.md D4). */
export interface Montant {
  montant: number;
  devise: string;
}

export interface ClientPaiement {
  userId: string;
  email: string;
}

export interface DemandeCheckout {
  orderId: string;
  montant: Montant;
  zone: 'international' | 'afrique';
  client: ClientPaiement;
  urlRetourSucces: string;
  urlRetourAbandon: string;
  /** Repris tel quel dans les événements qui suivront. */
  metadonnees?: Record<string, string>;
}

export interface SessionCheckout {
  /** Identifiant de la session chez le prestataire. */
  id: string;
  /** Page de paiement vers laquelle rediriger l'utilisateur. */
  url: string;
  expireLe: Date;
}

export interface DemandeAbonnement {
  subscriptionId: string;
  offre: 'mensuel' | 'annuel';
  montant: Montant;
  zone: 'international' | 'afrique';
  client: ClientPaiement;
  /** Durée de l'essai gratuit, en jours (§3.4). Zéro pour aucun essai. */
  joursEssai: number;
  metadonnees?: Record<string, string>;
}

export interface AbonnementPrestataire {
  id: string;
  url: string;
  expireLe: Date;
}

export interface DemandeRemboursement {
  referencePaiement: string;
  /** Remboursement partiel. Absent = remboursement total. */
  montant?: Montant;
}

/**
 * Types d'événements normalisés.
 *
 * C'est le vocabulaire que connaîtra le gestionnaire de webhooks (étape 9), et
 * lui seul. Un prestataire réel émettra ses propres libellés ; son adaptateur
 * les traduira ici.
 */
export type TypeEvenementPaiement =
  | 'paiement.reussi'
  | 'paiement.echoue'
  | 'paiement.abandonne'
  | 'remboursement.effectue'
  | 'abonnement.souscrit'
  | 'abonnement.renouvele'
  | 'abonnement.prelevement_echoue'
  | 'abonnement.annule'
  | 'abonnement.expire';

export interface DonneesEvenement {
  orderId?: string;
  subscriptionId?: string;
  userId?: string;
  referencePaiement?: string;
  montant?: Montant;
  offre?: 'mensuel' | 'annuel';
  /**
   * Zone tarifaire de l'abonnement, figée à la souscription (D4 point 7).
   *
   * Portée par l'événement parce qu'elle vient du pays réel du moyen de
   * paiement, que seul le prestataire connaît (§3.3).
   */
  zone?: 'international' | 'afrique';
  /** Durée de l'essai gratuit, en jours (§3.4). Zéro ou absent = aucun essai. */
  joursEssai?: number;
  /** Bornes de la période couverte, pour les événements d'abonnement. */
  debutPeriode?: string;
  finPeriode?: string;
  motif?: string;
  metadonnees?: Record<string, string>;
}

export interface EvenementPaiement {
  /**
   * Identifiant de l'événement chez le prestataire.
   *
   * C'est la clé de l'idempotence : un rejeu porte le même identifiant, et la
   * contrainte d'unicité de `webhook_events` le rejette (étape 9).
   */
  id: string;
  type: TypeEvenementPaiement;
  survenuLe: string;
  donnees: DonneesEvenement;
}

export type ResultatVerificationWebhook =
  | { valide: true }
  | { valide: false; raison: string };

/**
 * Contrat que devra respecter tout adaptateur, faux comme réel.
 *
 * Aucune méthode ne renvoie d'objet propre à un prestataire : le jour où un
 * adaptateur réel se substitue, la logique métier ne bouge pas d'une ligne.
 */
export interface PaymentProvider {
  readonly nom: string;

  ouvrirCheckout(demande: DemandeCheckout): Promise<SessionCheckout>;

  souscrireAbonnement(demande: DemandeAbonnement): Promise<AbonnementPrestataire>;

  annulerAbonnement(idPrestataire: string): Promise<void>;

  rembourser(demande: DemandeRemboursement): Promise<void>;

  /** Vérifie la signature d'un corps BRUT, avant tout parsing. */
  verifierSignatureWebhook(
    corpsBrut: string,
    entete: string | null,
    instant: Date,
  ): ResultatVerificationWebhook;

  /** Traduit un corps brut en événement normalisé. */
  lireEvenement(corpsBrut: string): EvenementPaiement;
}

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
  /** Périodicité de facturation. C'est elle qui donne la durée d'une période. */
  offre: 'mensuel' | 'annuel';
  /** Ce que l'abonnement ouvrira — `lecture` ou `association` (§3.6). */
  domaine: 'lecture' | 'association';
  /** Code de la formule souscrite, ex. `lecture-mensuel`. */
  codeOffre: string;
  /** Formule souscrite (`subscription_plans.id`). */
  planId: string;
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
  /**
   * L'ÉVÉNEMENT AUTHENTIQUE QUI NE NOUS CONCERNE PAS.
   *
   * ┌────────────────────────────────────────────────────────────────────────┐
   * │ IGNORER N'EST PAS REFUSER, ET LA DIFFÉRENCE SE PAIE EN REJEUX.        │
   * │                                                                        │
   * │ Un prestataire réel émet bien plus que ce qu'on traite — Notch Pay     │
   * │ envoie `payment.created` dès l'ouverture du tunnel, puis les           │
   * │ événements de virement et de client. Les faire échouer à la lecture    │
   * │ rendrait un 400, et le prestataire réémettrait sans fin un événement   │
   * │ qui ne deviendra jamais applicable.                                    │
   * │                                                                        │
   * │ Traduit en `evenement.ignore`, il est authentifié, JOURNALISÉ — donc   │
   * │ consultable — et acquitté par un 200. C'est le cas `default` du        │
   * │ gestionnaire, rendu explicite plutôt que subi.                         │
   * └────────────────────────────────────────────────────────────────────────┘
   */
  | 'evenement.ignore'
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
   * Domaine de l'abonnement concerné — §3.6.
   *
   * Porté par CHAQUE événement d'abonnement, et non déduit du compte : un même
   * compte peut détenir les deux abonnements, et un échec de prélèvement doit
   * atteindre le contrat qui a échoué, pas l'autre. Absent = `lecture`, ce que
   * décrivent tous les événements émis avant la migration 0067.
   */
  domaine?: 'lecture' | 'association';
  /** Formule souscrite (`subscription_plans.id`), pour la traçabilité. */
  planId?: string;
  /**
   * Zone tarifaire de l'abonnement, figée à la souscription (D4 point 7).
   *
   * Portée par l'événement parce qu'elle vient du pays réel du moyen de
   * paiement, que seul le prestataire connaît (§3.3).
   */
  zone?: 'international' | 'afrique';
  /** Durée de l'essai gratuit, en jours (§3.4). Zéro ou absent = aucun essai. */
  joursEssai?: number;
  /**
   * Titres concernés par un remboursement PARTIEL.
   *
   * Absent = remboursement total. Détailler les lignes permet de ne retirer que
   * les droits de l'article remboursé : sur un panier de quatre titres, en
   * rembourser un ne doit pas faire perdre les trois autres.
   */
  livres?: string[];
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

  /**
   * Le prestataire est-il un SIMULACRE local ?
   *
   * ┌────────────────────────────────────────────────────────────────────────┐
   * │ C'EST UNE PROPRIÉTÉ DU CONTRAT, ET NON UN `instanceof` DISPERSÉ.      │
   * │                                                                        │
   * │ Trois endroits doivent le savoir, et aucun n'a à connaître la classe   │
   * │ qui répond : la console de `/dev`, le bandeau « paiement simulé » de   │
   * │ l'écran de règlement, et l'écran lui-même — qui règle sur place face   │
   * │ au faux prestataire, et redirige vers le tunnel hébergé face à un      │
   * │ vrai.                                                                  │
   * │                                                                        │
   * │ Écrit `provider instanceof FakePaymentProvider`, ce test oblige chaque │
   * │ appelant à importer la classe simulée — c'est-à-dire à l'embarquer     │
   * │ dans le bundle de production.                                          │
   * └────────────────────────────────────────────────────────────────────────┘
   */
  readonly simule: boolean;

  /**
   * Nom de l'en-tête HTTP qui porte la signature de ses webhooks.
   *
   * Chaque prestataire a le sien — `x-webhook-signature` pour le nôtre,
   * `x-notch-signature` chez Notch Pay. Le gestionnaire de webhooks le
   * DEMANDE au prestataire plutôt que de connaître une constante : sinon, le
   * jour du branchement, la route lit un en-tête absent et rejette tout, avec
   * pour seul symptôme « signature invalide ».
   */
  readonly enteteSignature: string;

  /**
   * Pays du moyen de paiement du client — code ISO 3166-1 alpha-2.
   *
   * ┌────────────────────────────────────────────────────────────────────────┐
   * │ C'EST LA SEULE SOURCE DE LA ZONE D'ENCAISSEMENT.                       │
   * │                                                                        │
   * │ §3.3 : les zones sont « déterminées par le pays de paiement (et non    │
   * │ par l'adresse IP, plus facilement contournable) ». Aucune route        │
   * │ n'accepte de zone en entrée : elle se déduit d'ici, et d'ici seul.     │
   * └────────────────────────────────────────────────────────────────────────┘
   *
   * `null` lorsque le prestataire ne sait pas encore — le client n'a pas
   * enregistré de moyen de paiement. L'appelant retombe alors sur la zone
   * internationale, la plus chère : une donnée manquante ne doit jamais valoir
   * remise.
   */
  paysDuMoyenDePaiement(client: ClientPaiement): Promise<string | null>;

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

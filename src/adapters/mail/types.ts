/**
 * Contrat du service d'emails.
 *
 * Comme pour le paiement, rien ici ne nomme un prestataire. La logique métier
 * qui enverra la confirmation de commande (étape 15) ne saura pas si le message
 * part par SMTP, par une API, ou dans un fichier.
 */
export interface MessageMail {
  destinataire: string;
  sujet: string;
  /** Version texte, obligatoire : tous les clients ne rendent pas le HTML. */
  texte: string;
  html?: string;
  /** Langue du message, choisie d'après `langue_preferee` du destinataire. */
  langue: 'fr' | 'en';
  /** Nom du modèle employé, pour la traçabilité. */
  modele: string;
  metadonnees?: Record<string, string>;
}

export interface ResultatEnvoi {
  /** Identifiant attribué au message par l'adaptateur. */
  id: string;
  /** Chemin du fichier écrit, pour les adaptateurs qui en produisent un. */
  chemin?: string;
  envoyeLe: Date;
}

export interface Mailer {
  readonly nom: string;
  envoyer(message: MessageMail): Promise<ResultatEnvoi>;
}

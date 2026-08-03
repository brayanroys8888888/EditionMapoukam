import { NOM_COMMERCIAL } from '@/domain/marque';

/**
 * Modèles d'emails transactionnels — §9.2.
 *
 * Module PUR : des variables entrent, un sujet et un corps sortent. Aucune
 * lecture de base, aucune horloge, aucun prestataire.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ UN EMAIL TRANSITE EN CLAIR ET S'AFFICHE SUR UN ÉCRAN DE VERROUILLAGE.   │
 * │                                                                          │
 * │ C'est la contrainte qui gouverne tout ce fichier. Le sujet, en            │
 * │ particulier, est lu par quiconque regarde le téléphone posé sur la       │
 * │ table — et il est indexé par le fournisseur de messagerie, conservé dans │
 * │ ses journaux, et souvent synchronisé sur plusieurs appareils.            │
 * │                                                                          │
 * │ D'où deux règles, appliquées sans exception :                            │
 * │                                                                          │
 * │   * AUCUN TITRE DE LIVRE dans le sujet. « Votre commande est prête »     │
 * │     ne dit rien de ce qui a été acheté ; « Anansi l'araignée maligne     │
 * │     est prêt » dit ce qu'un enfant lit, à qui passe derrière l'épaule.   │
 * │                                                                          │
 * │   * AUCUN MONTANT au-delà du nécessaire. La confirmation de commande     │
 * │     porte un numéro, pas un total : le montant est sur la facture, dans  │
 * │     l'espace client, derrière une authentification.                      │
 * │                                                                          │
 * │ Un test parcourt les modèles et échoue si un sujet contient un titre ou  │
 * │ un montant.                                                             │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ AUCUN LIEN SIGNÉ VERS UN FICHIER. JAMAIS.                               │
 * │                                                                          │
 * │ Nos URL signées expirent en 300 secondes pour tout contenu payant (D6).  │
 * │ Un email lu le lendemain — ou dans l'heure — donnerait un lien mort, et  │
 * │ l'utilisateur conclurait que son achat n'a pas fonctionné.               │
 * │                                                                          │
 * │ Allonger la durée pour l'email serait pire : un lien de téléchargement   │
 * │ valable une semaine, dans une boîte de réception, est un fichier payant  │
 * │ transmissible par simple transfert de message.                          │
 * │                                                                          │
 * │ Les emails pointent donc vers la BIBLIOTHÈQUE, qui signera à la demande  │
 * │ après avoir vérifié les droits — à chaque requête, comme partout         │
 * │ ailleurs.                                                               │
 * └──────────────────────────────────────────────────────────────────────────┘
 */

export type LangueEmail = 'fr' | 'en';

/** Langue par défaut lorsque celle du destinataire est inconnue ou invalide. */
export const LANGUE_PAR_DEFAUT: LangueEmail = 'fr';

export interface VariablesModele {
  /** Chemin relatif dans l'application, jamais une URL signée. */
  [cle: string]: string | undefined;
}

export interface EmailRendu {
  sujet: string;
  texte: string;
  /** Chemin relatif vers lequel l'email invite à se rendre. */
  lien: string;
}

interface Modele {
  /** Chemin de destination — TOUJOURS une page de l'application. */
  lien: string;
  fr: { sujet: string; corps: (v: VariablesModele) => string };
  en: { sujet: string; corps: (v: VariablesModele) => string };
}

/**
 * Les modèles.
 *
 * Le champ `lien` est un CHEMIN RELATIF, jamais une URL complète et jamais une
 * URL signée. C'est ce qui rend structurellement impossible l'envoi d'un lien
 * de fichier : un modèle ne peut pas en fabriquer un.
 */
const MODELES: Readonly<Record<string, Modele>> = {
  /** Commande payée. Ni titre, ni montant. */
  commande_confirmee: {
    lien: '/bibliotheque',
    fr: {
      sujet: 'Votre commande est confirmée',
      corps: (v) =>
        [
          'Bonjour,',
          '',
          'Votre commande est confirmée et vos contes sont disponibles dans votre',
          'bibliothèque.',
          '',
          v['order_id'] ? `Référence : ${reference(v['order_id'])}` : '',
          '',
          'Retrouvez-les en vous connectant à votre espace :',
          '  {{lien}}',
          '',
          'Le téléchargement reste accessible sans limite de durée.',
          '',
          `L’équipe ${NOM_COMMERCIAL}`,
        ]
          .filter((ligne, index, tout) => !(ligne === '' && tout[index - 1] === ''))
          .join('\n'),
    },
    en: {
      sujet: 'Your order is confirmed',
      corps: (v) =>
        [
          'Hello,',
          '',
          'Your order is confirmed and your tales are available in your library.',
          '',
          v['order_id'] ? `Reference: ${reference(v['order_id'])}` : '',
          '',
          'Find them by signing in to your account:',
          '  {{lien}}',
          '',
          'Downloads remain available with no time limit.',
          '',
          `The ${NOM_COMMERCIAL} team`,
        ]
          .filter((ligne, index, tout) => !(ligne === '' && tout[index - 1] === ''))
          .join('\n'),
    },
  },

  /** Abonnement souscrit. */
  abonnement_bienvenue: {
    lien: '/bibliotheque',
    fr: {
      sujet: 'Bienvenue — votre abonnement est actif',
      corps: () =>
        [
          'Bonjour,',
          '',
          'Votre abonnement est actif. Le catalogue est accessible en lecture en',
          'ligne depuis votre espace :',
          '  {{lien}}',
          '',
          `L’équipe ${NOM_COMMERCIAL}`,
        ].join('\n'),
    },
    en: {
      sujet: 'Welcome — your subscription is active',
      corps: () =>
        [
          'Hello,',
          '',
          'Your subscription is active. The catalogue is available for online',
          'reading from your account:',
          '  {{lien}}',
          '',
          `The ${NOM_COMMERCIAL} team`,
        ].join('\n'),
    },
  },

  /**
   * Échec de prélèvement.
   *
   * Ne nomme NI le montant NI le moyen de paiement : l'utilisateur les retrouve
   * dans son espace. Un email qui annoncerait « prélèvement de 7,99 € refusé »
   * afficherait un incident de paiement sur un écran de verrouillage.
   */
  abonnement_impaye: {
    lien: '/compte/abonnement',
    fr: {
      sujet: 'Votre abonnement nécessite une action',
      corps: () =>
        [
          'Bonjour,',
          '',
          'Le renouvellement de votre abonnement n’a pas abouti. Votre accès reste',
          'ouvert pendant quelques jours, le temps de mettre à jour vos',
          'informations :',
          '  {{lien}}',
          '',
          `L’équipe ${NOM_COMMERCIAL}`,
        ].join('\n'),
    },
    en: {
      sujet: 'Your subscription needs attention',
      corps: () =>
        [
          'Hello,',
          '',
          'Your subscription renewal did not go through. Your access stays open for',
          'a few days while you update your details:',
          '  {{lien}}',
          '',
          `The ${NOM_COMMERCIAL} team`,
        ].join('\n'),
    },
  },

  /**
   * Fichiers prêts au téléchargement.
   *
   * Le modèle qui appelle le plus un lien direct — et qui n'en portera jamais.
   * Il invite à se rendre dans la bibliothèque, où le lien sera signé à la
   * demande, après vérification des droits.
   */
  telechargement_pret: {
    lien: '/bibliotheque',
    fr: {
      sujet: 'Vos fichiers sont prêts',
      corps: () =>
        [
          'Bonjour,',
          '',
          'Vos fichiers sont prêts au téléchargement depuis votre bibliothèque :',
          '  {{lien}}',
          '',
          'Pour votre sécurité, aucun lien de téléchargement n’est envoyé par',
          'email : il est généré au moment où vous le demandez.',
          '',
          `L’équipe ${NOM_COMMERCIAL}`,
        ].join('\n'),
    },
    en: {
      sujet: 'Your files are ready',
      corps: () =>
        [
          'Hello,',
          '',
          'Your files are ready to download from your library:',
          '  {{lien}}',
          '',
          'For your security, no download link is sent by email: it is generated',
          'at the moment you ask for it.',
          '',
          `The ${NOM_COMMERCIAL} team`,
        ].join('\n'),
    },
  },
};

export const MODELES_CONNUS = Object.keys(MODELES);

/** Référence courte et non devinable, dérivée de l'identifiant de commande. */
function reference(orderId: string): string {
  return orderId.replace(/-/g, '').slice(0, 8).toUpperCase();
}

/**
 * Rend un modèle dans une langue.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ REPLI SUR LE FRANÇAIS, JAMAIS D'ÉCHEC.                                  │
 * │                                                                          │
 * │ Une langue inconnue ne doit pas empêcher l'email de partir : mieux vaut  │
 * │ un message en français à un lecteur anglophone qu'aucun message du tout, │
 * │ quand ce message annonce que sa commande est prête.                      │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * @throws si le MODÈLE est inconnu — là, c'est une faute de programmation, et
 *         la taire enverrait un email vide.
 */
export function rendre(
  modele: string,
  langue: string,
  variables: VariablesModele = {},
  baseUrl = '',
): EmailRendu {
  const definition = MODELES[modele];
  if (!definition) {
    throw new Error(`Modèle d’email inconnu : ${modele}`);
  }

  const retenue: LangueEmail = langue === 'en' ? 'en' : LANGUE_PAR_DEFAUT;
  const contenu = definition[retenue];

  // Le lien est assemblé ICI, à partir d'un chemin relatif. Un modèle ne peut
  // donc pas fabriquer une URL signée : il n'en a pas les moyens.
  const lien = `${baseUrl}${definition.lien}`;

  return {
    sujet: contenu.sujet,
    texte: contenu.corps(variables).replace('{{lien}}', lien),
    lien: definition.lien,
  };
}

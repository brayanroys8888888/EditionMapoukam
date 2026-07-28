/**
 * Information préalable à la suppression d'un compte.
 *
 * Obligation d'information : l'utilisateur doit savoir, AVANT de confirmer, ce
 * qui est effacé et ce qui est conservé. Ne pas le dire reviendrait à laisser
 * croire à un effacement total alors que les factures sont conservées.
 *
 * Ce texte est la source unique : il alimente l'écran de confirmation, la
 * réponse de l'API, et la politique de confidentialité. Un texte recopié à
 * trois endroits finit par diverger, et c'est l'utilisateur qui en fait les
 * frais.
 */
export interface NoticeSuppression {
  titre: string;
  supprime: string[];
  conserve: string[];
  irreversible: string;
  duree: string;
}

export function noticeSuppression(
  langue: string,
  anneesConservation: number,
): NoticeSuppression {
  if (langue === 'en') {
    return {
      titre: 'Deleting your account',
      supprime: [
        'your email address and name',
        'your sign-in credentials',
        'your reading history and reading progress',
        'your favourites and your basket',
        'your access rights to the titles you own',
      ],
      conserve: [
        'your invoices, together with the billing details recorded when they were issued',
        'the related orders and subscriptions',
      ],
      irreversible:
        'This action cannot be undone. The account cannot be reactivated, and the titles you purchased will no longer be accessible.',
      duree: `Invoices are kept for ${String(anneesConservation)} years to meet accounting obligations, then deleted automatically.`,
    };
  }

  return {
    titre: 'Suppression de votre compte',
    supprime: [
      'votre adresse email et votre nom',
      'vos identifiants de connexion',
      'votre historique et votre progression de lecture',
      'vos favoris et votre panier',
      'vos droits d’accès aux titres que vous possédez',
    ],
    conserve: [
      'vos factures, avec les informations de facturation figées à leur émission',
      'les commandes et abonnements correspondants',
    ],
    irreversible:
      'Cette action est irréversible. Le compte ne pourra pas être réactivé, et les titres achetés ne seront plus accessibles.',
    duree: `Les factures sont conservées ${String(anneesConservation)} ans au titre des obligations comptables, puis supprimées automatiquement.`,
  };
}

/** Version en texte suivi, pour la politique de confidentialité. */
export function noticeEnTexte(notice: NoticeSuppression): string {
  return [
    notice.titre,
    '',
    'Supprimé définitivement :',
    ...notice.supprime.map((ligne) => `  - ${ligne}`),
    '',
    'Conservé :',
    ...notice.conserve.map((ligne) => `  - ${ligne}`),
    '',
    notice.duree,
    notice.irreversible,
  ].join('\n');
}

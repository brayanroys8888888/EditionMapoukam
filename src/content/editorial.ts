import type { LangueInterface } from '@/i18n';

/**
 * CONTENUS ÉDITORIAUX — §4.1 F8 à F12.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ DU CONTENU STRUCTURÉ, ET NON DU MARKDOWN — écart assumé au plan.        │
 * │                                                                          │
 * │ `docs/PLAN-FRONTEND.md` prévoyait des fichiers Markdown. Les rendre      │
 * │ aurait demandé soit une dépendance de plus, soit un analyseur maison —   │
 * │ c'est-à-dire un analyseur à tester, pour cinq pages que nous écrivons    │
 * │ nous-mêmes.                                                              │
 * │                                                                          │
 * │ Le contenu structuré donne en plus ce que le Markdown ne donne pas : le  │
 * │ TYPE garantit qu'une page existe dans les deux langues, et qu'aucune     │
 * │ section n'est oubliée d'un côté. La parité cesse d'être une convention   │
 * │ pour devenir une erreur de compilation.                                  │
 * └──────────────────────────────────────────────────────────────────────────┘
 */

/** Les cinq pages, et leurs adresses — celles que le pied de page emploie. */
export const PAGES_EDITORIALES = [
  'a-propos',
  'questions-frequentes',
  'conditions-generales',
  'confidentialite',
  'contact',
] as const;

export type SlugEditorial = (typeof PAGES_EDITORIALES)[number];

export interface Section {
  titre: string;
  /** Paragraphes, dans l'ordre. */
  paragraphes?: string[];
  /** Liste à puces, si la section en porte une. */
  points?: string[];
}

export interface PageEditoriale {
  titre: string;
  chapeau: string;
  sections: Section[];
}

/**
 * IDENTITÉ DE L'ÉDITEUR — à compléter avant toute mise en ligne.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ CES VALEURS SONT VIDES, ET ELLES DOIVENT LE RESTER JUSQU'À CE QUE       │
 * │ L'ÉDITEUR LES FOURNISSE.                                                │
 * │                                                                          │
 * │ Raison sociale, adresse, numéro d'immatriculation et directeur de la     │
 * │ publication sont des mentions légales OBLIGATOIRES, et personne d'autre  │
 * │ que l'éditeur ne les connaît. Inventer des valeurs plausibles produirait │
 * │ des mentions légales fausses — c'est-à-dire pires que des mentions       │
 * │ manquantes, puisqu'elles auraient l'air d'être vraies.                   │
 * │                                                                          │
 * │ Les pages n'affichent que ce qui est renseigné : une valeur vide         │
 * │ disparaît de l'écran au lieu de s'y afficher à moitié.                   │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export interface IdentiteEditeur {
  raisonSociale: string;
  adresse: string;
  immatriculation: string;
  directeurPublication: string;
  emailContact: string;
}

export const IDENTITE_EDITEUR: IdentiteEditeur = {
  raisonSociale: '',
  adresse: '',
  immatriculation: '',
  directeurPublication: '',
  emailContact: '',
};

const FR: Record<SlugEditorial, PageEditoriale> = {
  'a-propos': {
    titre: 'À propos',
    chapeau:
      '{marque} publie des contes du patrimoine africain, illustrés et racontés pour les enfants d’aujourd’hui.',
    sections: [
      {
        titre: 'Pourquoi ces contes',
        paragraphes: [
          'Les contes que nous publions viennent de traditions orales d’Afrique de l’Ouest, du Sahel, d’Afrique centrale, australe et de l’Est. Ils circulaient de bouche à oreille ; beaucoup n’avaient jamais été édités pour des enfants.',
          'Chaque titre est retravaillé avec des conteurs et des illustrateurs, puis publié en français et en anglais, afin qu’un enfant puisse le lire dans la langue de sa famille comme dans celle de son école.',
        ],
      },
      {
        titre: 'Pour qui',
        paragraphes: [
          'Pour les parents, et pour les enfants qu’ils accompagnent. Le compte appartient toujours à l’adulte : nous ne demandons aucune information sur les enfants, nulle part.',
        ],
      },
      {
        titre: 'Lire vite, même sur une connexion lente',
        paragraphes: [
          'Une partie de nos lecteurs se connecte depuis l’Afrique francophone, souvent sur un réseau mobile lent. Le site est construit pour cela : les pages s’affichent sans attendre l’exécution de scripts, les images sont servies à la taille réellement utile, et la page suivante d’un conte est préparée pendant que la précédente se lit.',
        ],
      },
    ],
  },

  'questions-frequentes': {
    titre: 'Questions fréquentes',
    chapeau: 'Les réponses aux questions qui reviennent le plus souvent.',
    sections: [
      {
        titre: 'Quelle différence entre l’abonnement et l’achat ?',
        paragraphes: [
          'L’abonnement donne la lecture en ligne des contes qu’il couvre, aussi longtemps qu’il est actif. L’achat à l’unité donne le fichier — PDF et EPUB — que vous téléchargez et conservez sans limite de durée.',
          'Autrement dit : l’abonnement ouvre la lecture, l’achat ouvre le fichier.',
        ],
      },
      {
        titre: 'Que se passe-t-il si mon abonnement expire ?',
        paragraphes: [
          'Vous perdez l’accès en lecture aux contes couverts par l’abonnement. Vous ne perdez rien de ce que vous avez acheté : ces titres restent lisibles et téléchargeables, sans limite de durée.',
        ],
      },
      {
        titre: 'Puis-je télécharger un conte avec l’abonnement ?',
        paragraphes: [
          'Non. Le téléchargement est accordé par l’achat d’un titre, jamais par l’abonnement. C’est ce qui permet de proposer l’abonnement à ce prix.',
        ],
      },
      {
        titre: 'Pourquoi certaines nouveautés ne sont-elles pas dans l’abonnement ?',
        paragraphes: [
          'Les nouveautés sont d’abord vendues seules pendant quelques mois, puis rejoignent l’abonnement. La date d’entrée est indiquée sur la fiche du conte.',
        ],
      },
      {
        titre: 'Dans quelles langues les contes sont-ils publiés ?',
        paragraphes: [
          'En français et en anglais. Toutes les traductions ne sont pas disponibles pour tous les titres : la fiche de chaque conte indique les langues publiées.',
        ],
      },
      {
        titre: 'Puis-je lire hors connexion ?',
        paragraphes: [
          'Les contes achetés se téléchargent en PDF et en EPUB : vous les lisez ensuite sans connexion, sur l’appareil de votre choix. La lecture en ligne, elle, demande une connexion.',
        ],
      },
    ],
  },

  'conditions-generales': {
    titre: 'Conditions générales',
    chapeau:
      'Les règles qui encadrent l’utilisation du site, l’abonnement et l’achat de contes.',
    sections: [
      {
        titre: 'Objet',
        paragraphes: [
          'Les présentes conditions régissent l’accès au site et aux contes qui y sont publiés, ainsi que les deux formules proposées : l’abonnement et l’achat à l’unité.',
        ],
      },
      {
        titre: 'Le compte',
        paragraphes: [
          'La création d’un compte est réservée aux personnes majeures. Le compte est personnel ; vous êtes responsable de la confidentialité de votre mot de passe.',
          'Aucune information concernant un enfant n’est demandée ni conservée.',
        ],
      },
      {
        titre: 'L’abonnement',
        points: [
          'Il donne la lecture en ligne des contes qu’il couvre, pendant sa durée de validité.',
          'Il ne donne jamais le droit de télécharger un fichier.',
          'Il est résiliable à tout moment ; l’accès reste ouvert jusqu’à la fin de la période déjà réglée.',
          'À son expiration, l’accès en lecture aux contes de l’abonnement cesse. Les contes achetés à l’unité ne sont pas concernés.',
        ],
      },
      {
        titre: 'L’achat à l’unité',
        points: [
          'Il donne le droit de télécharger le conte en PDF et en EPUB.',
          'Il donne la lecture en ligne de ce titre sans limite de durée.',
          'Il reste acquis quelle que soit l’évolution de votre abonnement.',
        ],
      },
      {
        titre: 'Usage des contes',
        paragraphes: [
          'Les contes sont destinés à un usage personnel et familial. Leur revente, leur diffusion publique et leur mise à disposition en ligne ne sont pas autorisées.',
          'Les fichiers téléchargés portent une marque nominative permettant d’identifier le compte à l’origine du téléchargement.',
        ],
      },
      {
        titre: 'Prix et paiement',
        paragraphes: [
          'Les prix sont indiqués sur la page des offres et sur la fiche de chaque conte. Ils peuvent varier selon la zone de facturation, déterminée par le pays de votre moyen de paiement.',
        ],
      },
    ],
  },

  confidentialite: {
    titre: 'Confidentialité',
    chapeau: 'Ce que nous collectons, pourquoi, et ce que nous ne collectons pas.',
    sections: [
      {
        titre: 'Ce que nous ne collectons pas',
        paragraphes: [
          'Aucune donnée concernant un enfant. Ni prénom, ni âge, ni date de naissance, nulle part — ni dans les formulaires, ni dans nos bases. Le compte appartient au parent.',
        ],
      },
      {
        titre: 'Ce que nous collectons',
        points: [
          'Votre adresse email, qui identifie votre compte.',
          'Votre nom, si vous choisissez de le renseigner.',
          'Votre langue préférée, pour vous servir le site dans la bonne langue.',
          'Vos commandes et vos droits d’accès, nécessaires pour vous donner ce que vous avez payé.',
          'Votre progression de lecture, pour reprendre un conte là où il a été laissé.',
        ],
      },
      {
        titre: 'Vos droits',
        paragraphes: [
          'Vous pouvez consulter, corriger et supprimer vos données depuis votre espace personnel. La suppression de votre compte anonymise vos données ; les informations que la loi impose de conserver — les factures, notamment — sont maintenues sans rattachement à votre identité.',
        ],
      },
      {
        titre: 'Cookies',
        paragraphes: [
          'Le site pose les cookies nécessaires à votre session et à votre choix de langue. Aucun cookie publicitaire, aucun traceur tiers.',
        ],
      },
    ],
  },

  contact: {
    titre: 'Nous écrire',
    chapeau: 'Une question, une difficulté, une remarque sur un conte : écrivez-nous.',
    sections: [
      {
        titre: 'Par email',
        paragraphes: [
          'Nous répondons à tous les messages, généralement sous deux jours ouvrés.',
        ],
      },
      {
        titre: 'Avant d’écrire',
        paragraphes: [
          'La page des questions fréquentes répond déjà aux demandes les plus courantes, notamment sur la différence entre l’abonnement et l’achat, et sur ce qui reste accessible après l’expiration d’un abonnement.',
        ],
      },
    ],
  },
};

const EN: Record<SlugEditorial, PageEditoriale> = {
  'a-propos': {
    titre: 'About',
    chapeau:
      '{marque} publishes African heritage tales, illustrated and retold for today’s children.',
    sections: [
      {
        titre: 'Why these tales',
        paragraphes: [
          'The tales we publish come from the oral traditions of West Africa, the Sahel, Central, Southern and East Africa. They travelled by word of mouth; many had never been edited for children.',
          'Each title is reworked with storytellers and illustrators, then published in French and English, so that a child can read it in the language of their family as well as the language of their school.',
        ],
      },
      {
        titre: 'Who it is for',
        paragraphes: [
          'For parents, and for the children they read with. The account always belongs to the adult: we never ask for any information about children, anywhere.',
        ],
      },
      {
        titre: 'Fast to read, even on a slow connection',
        paragraphes: [
          'Many of our readers connect from French-speaking Africa, often on a slow mobile network. The site is built for that: pages appear without waiting for scripts to run, images are served at the size actually needed, and the next page of a tale is prepared while the previous one is being read.',
        ],
      },
    ],
  },

  'questions-frequentes': {
    titre: 'Frequently asked questions',
    chapeau: 'Answers to the questions that come up most often.',
    sections: [
      {
        titre: 'What is the difference between subscribing and buying?',
        paragraphes: [
          'A subscription gives you online reading of the tales it covers, for as long as it is active. Buying a tale gives you the file — PDF and EPUB — which you download and keep with no time limit.',
          'In short: the subscription opens the reading, buying opens the file.',
        ],
      },
      {
        titre: 'What happens when my subscription expires?',
        paragraphes: [
          'You lose online reading access to the tales covered by the subscription. You lose nothing you have bought: those titles remain readable and downloadable, with no time limit.',
        ],
      },
      {
        titre: 'Can I download a tale with the subscription?',
        paragraphes: [
          'No. Downloading is granted by buying a title, never by the subscription. That is what makes the subscription possible at this price.',
        ],
      },
      {
        titre: 'Why are some new releases not in the subscription?',
        paragraphes: [
          'New releases are sold on their own for a few months, then join the subscription. The date they join is shown on the tale’s page.',
        ],
      },
      {
        titre: 'Which languages are the tales published in?',
        paragraphes: [
          'French and English. Not every title is available in both: each tale’s page lists the published languages.',
        ],
      },
      {
        titre: 'Can I read offline?',
        paragraphes: [
          'Tales you have bought can be downloaded as PDF and EPUB: you can then read them without a connection, on any device. Online reading does require a connection.',
        ],
      },
    ],
  },

  'conditions-generales': {
    titre: 'Terms and conditions',
    chapeau: 'The rules covering use of the site, the subscription and the purchase of tales.',
    sections: [
      {
        titre: 'Purpose',
        paragraphes: [
          'These terms govern access to the site and to the tales published on it, as well as the two plans offered: subscription and single purchase.',
        ],
      },
      {
        titre: 'The account',
        paragraphes: [
          'Accounts may only be created by adults. The account is personal; you are responsible for keeping your password confidential.',
          'No information about a child is requested or stored.',
        ],
      },
      {
        titre: 'The subscription',
        points: [
          'It gives online reading of the tales it covers, for its period of validity.',
          'It never grants the right to download a file.',
          'It can be cancelled at any time; access remains open until the end of the period already paid for.',
          'When it expires, reading access to subscription tales stops. Tales bought individually are not affected.',
        ],
      },
      {
        titre: 'Single purchase',
        points: [
          'It grants the right to download the tale as PDF and EPUB.',
          'It grants online reading of that title with no time limit.',
          'It remains yours whatever happens to your subscription.',
        ],
      },
      {
        titre: 'Use of the tales',
        paragraphes: [
          'The tales are for personal and family use. Reselling them, showing them publicly and making them available online are not permitted.',
          'Downloaded files carry a personal marking identifying the account the download came from.',
        ],
      },
      {
        titre: 'Prices and payment',
        paragraphes: [
          'Prices are shown on the plans page and on each tale’s page. They may vary by billing zone, determined by the country of your payment method.',
        ],
      },
    ],
  },

  confidentialite: {
    titre: 'Privacy',
    chapeau: 'What we collect, why, and what we do not collect.',
    sections: [
      {
        titre: 'What we do not collect',
        paragraphes: [
          'Any data about a child. No first name, no age, no date of birth, anywhere — not in our forms, not in our databases. The account belongs to the parent.',
        ],
      },
      {
        titre: 'What we collect',
        points: [
          'Your email address, which identifies your account.',
          'Your name, if you choose to provide it.',
          'Your preferred language, so we can serve the site in the right one.',
          'Your orders and access rights, needed to give you what you paid for.',
          'Your reading progress, so a tale can be picked up where it was left.',
        ],
      },
      {
        titre: 'Your rights',
        paragraphes: [
          'You can view, correct and delete your data from your personal area. Deleting your account anonymises your data; information the law requires us to keep — invoices in particular — is retained without any link to your identity.',
        ],
      },
      {
        titre: 'Cookies',
        paragraphes: [
          'The site sets the cookies needed for your session and your language choice. No advertising cookies, no third-party trackers.',
        ],
      },
    ],
  },

  contact: {
    titre: 'Contact us',
    chapeau: 'A question, a problem, a remark about a tale: write to us.',
    sections: [
      {
        titre: 'By email',
        paragraphes: ['We answer every message, usually within two working days.'],
      },
      {
        titre: 'Before writing',
        paragraphes: [
          'The frequently asked questions page already answers the most common requests, in particular the difference between subscribing and buying, and what remains accessible after a subscription expires.',
        ],
      },
    ],
  },
};

const CONTENUS: Record<LangueInterface, Record<SlugEditorial, PageEditoriale>> = {
  fr: FR,
  en: EN,
};

/** Contenu d'une page éditoriale, ou `null` si le slug est inconnu. */
export function lirePageEditoriale(
  langue: LangueInterface,
  slug: string,
): PageEditoriale | null {
  if (!(PAGES_EDITORIALES as readonly string[]).includes(slug)) return null;
  return CONTENUS[langue][slug as SlugEditorial];
}

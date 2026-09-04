import type { LangueInterface } from '@/i18n';
import type { Section } from './editorial';

/**
 * EXPERTISE & CONSEIL — la présentation, versionnée dans le dépôt.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ POURQUOI CE TEXTE EST DANS UN FICHIER.                                   │
 * │                                                                          │
 * │ Même raisonnement que `src/content/association.ts`, et il vaut ici pour  │
 * │ des raisons plus fortes encore :                                         │
 * │                                                                          │
 * │ • cette page change deux ou trois fois par an — elle décrit un métier,   │
 * │   pas un catalogue qui bouge ;                                           │
 * │ • elle est une page de VENTE : elle doit s'afficher sans requête, y      │
 * │   compris quand la base est éteinte ;                                    │
 * │ • elle ne porte AUCUN droit d'accès. Rien n'y est verrouillé, rien n'y   │
 * │   est réservé — il n'y a donc rien à protéger par RLS, et rien qui       │
 * │   justifie une table.                                                    │
 * │                                                                          │
 * │ Le type impose les DEUX langues : une section ajoutée en français et     │
 * │ oubliée en anglais ne compile pas.                                       │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LES TARIFS SONT ÉCRITS ICI, ET C'EST UN ÉCART ASSUMÉ — LISEZ POURQUOI.  │
 * │                                                                          │
 * │ La règle du projet est que les prix vivent en BASE : `plan_prices`       │
 * │ depuis la migration 0068, `prix.affichage` rendu par le serveur, et      │
 * │ `tests/unit/frontend-architecture.test.ts` interdit à l'interface de     │
 * │ formater un montant elle-même.                                           │
 * │                                                                          │
 * │ Cette règle porte sur ce qui S'ACHÈTE SUR LE SITE. Un prix en base       │
 * │ existe parce qu'il dépend de la ZONE D'ENCAISSEMENT, qu'il alimente un   │
 * │ tunnel de paiement, et qu'un droit en dépend. Rien de tout cela ici :    │
 * │                                                                          │
 * │ • aucune de ces trois prestations ne se paie sur le site — aucun panier, │
 * │   aucune commande, aucun `entitlement` ;                                 │
 * │ • ce sont des montants d'APPEL — « à partir de », « selon la taille de   │
 * │   l'établissement » — qui appellent un devis, pas un encaissement ;      │
 * │ • ils sont annoncés dans UNE monnaie, le franc CFA, sans conversion.     │
 * │                                                                          │
 * │ Les inscrire dans `plan_prices` aurait donc créé des offres achetables   │
 * │ pour des services qui ne le sont pas — et c'est un défaut plus grave que │
 * │ celui qu'on aurait évité. Ils sont donc du TEXTE éditorial : ils vivent  │
 * │ à côté de la phrase qu'ils accompagnent, et ne peuvent pas être          │
 * │ confondus avec un prix de vente.                                         │
 * │                                                                          │
 * │ Le jour où une prestation deviendra achetable en ligne, elle changera de │
 * │ nature : elle devra alors quitter ce fichier pour la base, avec sa zone  │
 * │ d'encaissement. `tests/unit/expertise-contenu.test.ts` garde la          │
 * │ frontière : aucun montant ne doit apparaître ailleurs que dans ce        │
 * │ fichier.                                                                 │
 * └──────────────────────────────────────────────────────────────────────────┘
 */

/** Une prestation, telle qu'elle est annoncée au client. */
export interface PrestationConsulting {
  /** Identifiant stable — clé de rendu et ancre de lien. */
  cle: string;
  titre: string;
  /**
   * Le tarif TEL QU'IL EST ANNONCÉ, sa monnaie et son « à partir de »
   * compris. Ce n'est pas un nombre : c'est une phrase de devis.
   */
  tarif: string;
  /** La réserve qui accompagne le tarif, quand il y en a une. */
  tarifPrecision?: string;
  /** Ce que le client obtient — jamais ce que nous faisons. */
  gains: string[];
  /** La phrase qui explique pourquoi ce tarif est celui-là. */
  pourquoi: string;
}

/**
 * UN VISUEL DE RÉALISATION.
 *
 * Le fichier, sa taille et sa clé sont les MÊMES dans les deux langues : ce
 * sont des couvertures de cahiers, pas du texte. Seule la légende se traduit,
 * et le type l'exige langue par langue — voir `CleRealisation`.
 *
 * `largeur` et `hauteur` sont celles du fichier, relevées sur le disque. Elles
 * ne sont pas décoratives : sans elles, onze images qui arrivent une à une sur
 * une connexion lente font sauter la page à chaque arrivée, et le lecteur perd
 * la ligne qu'il était en train de lire.
 */
export interface Realisation {
  cle: string;
  /** Nom du fichier, sous `/images/expertise/`. */
  fichier: string;
  largeur: number;
  hauteur: number;
}

export const REALISATIONS = [
  { cle: 'alphabet', fichier: 'cartes-alphabet.jpg', largeur: 1000, hauteur: 707 },
  { cle: 'graphisme', fichier: 'cahier-graphisme.jpg', largeur: 707, hauteur: 1000 },
  { cle: 'mathematiques', fichier: 'cahier-mathematiques.jpg', largeur: 707, hauteur: 1000 },
  { cle: 'hygiene', fichier: 'cahier-hygiene.jpg', largeur: 707, hauteur: 1000 },
  { cle: 'jeux', fichier: 'jeux-et-puzzles.jpg', largeur: 707, hauteur: 1000 },
  { cle: 'ecole', fichier: 'cahier-ecole.jpg', largeur: 705, hauteur: 1000 },
  { cle: 'trace', fichier: 'cahier-graphisme-je-trace.jpg', largeur: 763, hauteur: 1080 },
  { cle: 'coloriage', fichier: 'cahier-activites-coloriage.jpg', largeur: 707, hauteur: 1000 },
  { cle: 'perroquet', fichier: 'coloriage-perroquet.jpg', largeur: 707, hauteur: 1000 },
  { cle: 'orange', fichier: 'coloriage-orange.jpg', largeur: 707, hauteur: 1000 },
  { cle: 'atelier', fichier: 'atelier-conception.jpg', largeur: 608, hauteur: 1080 },
] as const satisfies readonly Realisation[];

/** Les clés de visuels — une légende manquante ne compile pas. */
export type CleRealisation = (typeof REALISATIONS)[number]['cle'];

/**
 * LA VIDÉO DE PRÉSENTATION.
 *
 * Elle pèse un mégaoctet et demi. Elle n'est donc JAMAIS préchargée : elle
 * porte `preload="none"` et une affiche, et ne descend que si le visiteur la
 * lance. §5.1 — une part importante du public est sur réseau mobile lent, et
 * une vidéo qui se télécharge toute seule y consomme un forfait sans qu'on
 * l'ait demandé.
 */
export const VIDEO_PRESENTATION = {
  fichier: 'presentation.mp4',
  affiche: 'atelier-conception.jpg',
} as const;

export interface PresentationConsulting {
  /** Petite capitale au-dessus du titre. */
  oeil: string;
  titre: string;
  chapeau: string;
  /** Qui nous sommes, ce que la certification veut dire. */
  sections: Section[];
  prestationsTitre: string;
  prestationsTexte: string;
  /**
   * L'intertitre qui ouvre la liste des bénéfices, sur chaque carte.
   *
   * Il vit ici et non dans `src/i18n` : c'est de la prose de vente, écrite
   * dans le même souffle que les prestations, et il change avec elles. Une
   * clé de dictionnaire l'aurait éloigné du texte qu'il annonce.
   */
  gainsTitre: string;
  /** Les trois offres, dans l'ordre où elles sont annoncées. */
  prestations: PrestationConsulting[];
  realisationsTitre: string;
  realisationsTexte: string;
  /** Légende de chaque visuel — le type exige les onze. */
  legendes: Record<CleRealisation, string>;
  videoLegende: string;
  /** Le bloc de contact, sous les réalisations. */
  appel: {
    titre: string;
    texte: string;
    /** Libellé du bouton qui mène à la page de contact. */
    action: string;
    /** Libellé du lien qui compose le numéro. */
    actionAppel: string;
  };
}

const FR: PresentationConsulting = {
  oeil: 'Expertise & conseil',
  titre: 'Mapoukam Consulting',
  chapeau:
    'L’excellence pédagogique internationale à prix juste. Pourquoi les standards d’élite et l’innovation pédagogique devraient-ils rester hors de portée ?',
  sections: [
    {
      titre: 'Un choix : l’impact partagé',
      paragraphes: [
        'Mapoukam Consulting accompagne les écoles, les structures éducatives et les porteurs de projets qui veulent aligner leurs pratiques sur les meilleurs standards mondiaux — sans en payer le prix habituel.',
        'L’accompagnement est fondé par une experte certifiée par l’INSEI, l’Institut national supérieur de formation et de recherche, référence internationale en pédagogie inclusive et spécialisée. C’est ce cadre de référence qui est mis à votre disposition, adapté à votre établissement et à votre budget.',
      ],
      points: [
        'Un accompagnement sur mesure, jamais un module acheté sur étagère.',
        'Des tarifs pensés pour les budgets locaux, annoncés avant le premier rendez-vous.',
        'Des méthodes testées et validées à l’international, applicables dès la rentrée suivante.',
      ],
    },
  ],
  prestationsTitre: 'Nos trois offres clés en main',
  prestationsTexte:
    'Trois prestations, chacune avec son tarif d’appel et ce qu’elle vous apporte. Le montant définitif est arrêté au devis, après un premier échange sur votre structure.',
  gainsTitre: 'Ce que vous gagnez',
  prestations: [
    {
      cle: 'audit',
      titre: 'L’audit pédagogique sur mesure',
      tarif: 'À partir de 75 000 FCFA',
      tarifPrecision: 'selon la taille de l’établissement',
      gains: [
        'Un diagnostic approfondi et bienveillant de vos pratiques de classe et de votre organisation.',
        'Un plan d’action stratégique clé en main, prêt à être déployé pour moderniser votre enseignement.',
        'Une image de marque rehaussée auprès des parents d’élèves, grâce à des méthodes validées à l’international.',
      ],
      pourquoi:
        'Un regard d’expert international pour structurer toute votre rentrée, à un tarif pensé pour les budgets locaux.',
    },
    {
      cle: 'formation',
      titre: 'La formation des équipes enseignantes',
      tarif: '15 000 FCFA par enseignant',
      tarifPrecision: 'ou forfait module d’équipe à partir de 100 000 FCFA',
      gains: [
        'Des enseignants formés à la gestion des profils hétérogènes, aux troubles des apprentissages et aux routines visuelles.',
        'Un climat scolaire apaisé, moins de décrochage, une nette amélioration de la réussite des élèves.',
        'Une cohésion d’équipe renforcée autour d’une pédagogie moderne et inclusive.',
      ],
      pourquoi:
        'Une montée en compétences digne des plus grands instituts de formation, sans grever le budget de l’école.',
    },
    {
      cle: 'ressources',
      titre: 'La conception de ressources pédagogiques exclusives',
      tarif: 'À partir de 30 000 FCFA',
      tarifPrecision: 'par support ou livret personnalisé — cahier d’activités, guide, supports visuels',
      gains: [
        'Des outils professionnels, ergonomiques et esthétiques, conçus sur mesure pour vos élèves ou pour votre marque.',
        'Un gain de temps exceptionnel : la conception intellectuelle et la maquette prête à imprimer sont prises en charge.',
        'Un produit exclusif, qui distingue votre établissement ou votre projet.',
      ],
      pourquoi:
        'Une ingénierie pédagogique professionnelle et sur mesure, à un prix juste et transparent.',
    },
  ],
  realisationsTitre: 'Nos réalisations',
  realisationsTexte:
    'Des supports conçus, maquettés et livrés prêts à imprimer. Chacun est né d’une demande précise : un niveau, un public, une difficulté à lever.',
  legendes: {
    alphabet:
      'Cartes de l’alphabet, maternelle 1 et 2 — pédagogie inclusive, à partir de 4 ans.',
    graphisme: 'Cahier de graphisme — tracés guidés, à partir de 4 ans.',
    mathematiques:
      'Cahier de mathématiques — les chiffres et les formes, à partir de 3 ans.',
    hygiene: 'Cahier d’hygiène — autonomie et propreté, à partir de 6 ans.',
    jeux: 'Le monde magique des jeux et puzzles — s’amuser, créer et apprendre ensemble.',
    ecole:
      'Cahier de l’école — langage, nombres, coloriage et découvertes, à partir de 9 ans.',
    trace: 'Cahier de graphisme « Je trace » — les lettres, à partir de 5 ans.',
    coloriage:
      'Cahier d’activités, dessin et coloriage — maternelle 2ᵉ année, à partir de 5 ans.',
    perroquet: 'Page intérieure : le modèle en couleur, le tracé à colorier.',
    orange: 'Page intérieure : reconnaître un fruit, puis le mettre en couleur.',
    atelier:
      'La fondatrice à son bureau, les cahiers déjà parus devant elle. C’est aussi l’affiche de la vidéo.',
  },
  videoLegende: 'La présentation de l’accompagnement, en vidéo.',
  appel: {
    titre: 'Prêt à franchir le pas ?',
    texte:
      'Offrez à votre structure l’expertise internationale qu’elle mérite. Écrivez-nous en décrivant votre établissement et ce que vous cherchez à faire évoluer : la réponse contient un devis, jamais une offre type.',
    action: 'Nous écrire',
    actionAppel: 'Nous appeler',
  },
};

const EN: PresentationConsulting = {
  oeil: 'Expertise & consulting',
  titre: 'Mapoukam Consulting',
  chapeau:
    'International teaching standards at a fair price. Why should elite standards and pedagogical innovation stay out of reach?',
  sections: [
    {
      titre: 'A deliberate choice: shared impact',
      paragraphes: [
        'Mapoukam Consulting supports schools, education providers and project leaders who want to align their practice with the best international standards — without paying the usual price for it.',
        'The practice is founded by an expert certified by INSEI, the French national institute for training and research, an international benchmark in inclusive and special-needs education. That framework is what we put at your disposal, fitted to your school and to your budget.',
      ],
      points: [
        'Tailored support, never an off-the-shelf module.',
        'Rates designed for local budgets, stated before the first meeting.',
        'Methods tested and validated internationally, usable from the next school year.',
      ],
    },
  ],
  prestationsTitre: 'Our three turnkey offers',
  prestationsTexte:
    'Three services, each with its entry price and what it brings you. The final amount is settled in the quote, after a first conversation about your organisation.',
  gainsTitre: 'What you gain',
  prestations: [
    {
      cle: 'audit',
      titre: 'The tailored teaching audit',
      tarif: 'From 75,000 FCFA',
      tarifPrecision: 'depending on the size of the school',
      gains: [
        'A thorough, supportive review of your classroom practice and your organisation.',
        'A turnkey action plan, ready to roll out to modernise your teaching.',
        'A stronger reputation with parents, backed by internationally validated methods.',
      ],
      pourquoi:
        'An international expert’s eye to structure your whole school year, at a rate designed for local budgets.',
    },
    {
      cle: 'formation',
      titre: 'Training for teaching teams',
      tarif: '15,000 FCFA per teacher',
      tarifPrecision: 'or a team module from 100,000 FCFA',
      gains: [
        'Teachers trained in mixed-ability classes, learning difficulties and visual routines.',
        'A calmer school climate, less dropping out, a clear improvement in pupils’ results.',
        'A team united around modern, inclusive teaching.',
      ],
      pourquoi:
        'The kind of professional development the largest training institutes offer, without straining the school budget.',
    },
    {
      cle: 'ressources',
      titre: 'Exclusive teaching resources, designed for you',
      tarif: 'From 30,000 FCFA',
      tarifPrecision: 'per resource or bespoke booklet — activity book, guide, visual aids',
      gains: [
        'Professional, ergonomic and attractive tools, made to measure for your pupils or your brand.',
        'A remarkable saving of time: the design work and the print-ready artwork are handled for you.',
        'An exclusive product that sets your school or your project apart.',
      ],
      pourquoi:
        'Professional, bespoke instructional design at a fair and transparent price.',
    },
  ],
  realisationsTitre: 'Our work',
  realisationsTexte:
    'Resources designed, laid out and delivered print-ready. Each one answers a precise request: a year group, an audience, a difficulty to lift.',
  legendes: {
    alphabet: 'Alphabet cards, nursery years 1 and 2 — inclusive teaching, ages 4 and up.',
    graphisme: 'Handwriting workbook — guided strokes, ages 4 and up.',
    mathematiques: 'Maths workbook — numbers and shapes, ages 3 and up.',
    hygiene: 'Hygiene workbook — independence and cleanliness, ages 6 and up.',
    jeux: 'The magical world of games and puzzles — play, make and learn together.',
    ecole:
      'School workbook — language, numbers, colouring and discovery, ages 9 and up.',
    trace: 'Handwriting workbook, “I trace” — letters, ages 5 and up.',
    coloriage: 'Activity book, drawing and colouring — nursery year 2, ages 5 and up.',
    perroquet: 'Inside page: the coloured model, and the outline to colour in.',
    orange: 'Inside page: name a fruit, then bring it into colour.',
    atelier:
      'The founder at her desk, with the workbooks already published. It is also the video’s poster frame.',
  },
  videoLegende: 'The support we offer, presented on video.',
  appel: {
    titre: 'Ready to take the step?',
    texte:
      'Give your organisation the international expertise it deserves. Write to us describing your school and what you want to change: the answer comes as a quote, never as a standard offer.',
    action: 'Write to us',
    actionAppel: 'Call us',
  },
};

const PRESENTATIONS: Record<LangueInterface, PresentationConsulting> = { fr: FR, en: EN };

/** La présentation, dans la langue demandée. Les deux existent, le type l'impose. */
export function lirePresentationConsulting(langue: LangueInterface): PresentationConsulting {
  return PRESENTATIONS[langue];
}

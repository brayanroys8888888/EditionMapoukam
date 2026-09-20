import type { LangueInterface } from '@/i18n';

/**
 * WATOSONNE CONSULTING — la présentation, versionnée dans le dépôt.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ DEUX CABINETS, DEUX FICHIERS, ET C'EST DÉLIBÉRÉ.                        │
 * │                                                                          │
 * │ `consulting.ts` porte Mapoukam Consulting, qui s'adresse aux ÉCOLES :    │
 * │ audit pédagogique, formation d'enseignants, ressources de classe. Ce     │
 * │ fichier porte Watosonne Consulting, qui s'adresse aux ENTREPRISES :      │
 * │ audit managérial, formation d'équipes, documents de pilotage.            │
 * │                                                                          │
 * │ Les deux pages se ressemblent parce qu'elles VENDENT de la même façon,   │
 * │ pas parce qu'elles vendent la même chose. Les fondre en un seul fichier  │
 * │ paramétré aurait créé une structure commune que personne n'aurait osé    │
 * │ faire diverger — et ces deux métiers divergeront.                        │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ POURQUOI CE TEXTE EST DANS UN FICHIER, ET PAS EN BASE.                  │
 * │                                                                          │
 * │ Même raisonnement que `consulting.ts` :                                  │
 * │                                                                          │
 * │ • la page décrit un métier, pas un catalogue — elle change deux ou trois │
 * │   fois par an ;                                                          │
 * │ • c'est une page de VENTE : elle doit s'afficher sans requête, y compris │
 * │   Docker éteint, parce qu'on la montre en rendez-vous ;                  │
 * │ • elle ne porte AUCUN droit d'accès. Rien n'y est réservé, donc rien à   │
 * │   protéger par RLS, donc rien qui justifie une table.                    │
 * │                                                                          │
 * │ Le type impose les DEUX langues : une offre ajoutée en français et       │
 * │ oubliée en anglais ne compile pas.                                       │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ AUCUN MONTANT N'EST ÉCRIT ICI, ET CE N'EST PAS UN OUBLI.                │
 * │                                                                          │
 * │ Mapoukam annonce trois tarifs d'appel — « à partir de », suivi d'une     │
 * │ somme. Watosonne n'en annonce aucun : ses trois prestations sont « sur   │
 * │ devis » ou « selon la taille de votre société ». C'est ce que disent les │
 * │ documents sources, et c'est cohérent avec le métier — on ne chiffre pas  │
 * │ l'audit d'une organisation sans l'avoir vue.                             │
 * │                                                                          │
 * │ Conséquence : `tarifPrecision` porte une PHRASE DE CADRAGE, jamais un    │
 * │ nombre. `tests/unit/watosonne-contenu.test.ts` refuse qu'un montant      │
 * │ apparaisse sur cette page. Le jour où une prestation aura un prix, elle  │
 * │ changera de nature : elle devra passer par la base avec sa zone          │
 * │ d'encaissement, comme toute somme encaissable du projet.                 │
 * └──────────────────────────────────────────────────────────────────────────┘
 */

/** Une prestation, telle qu'elle est annoncée au client. */
export interface PrestationWatosonne {
  /** Identifiant stable — clé de rendu, et rien d'autre. */
  cle: string;
  titre: string;
  /**
   * Ce qui CADRE le devis, à la place d'un tarif.
   *
   * « Sur devis, selon le nombre de participants » n'est pas un prix masqué :
   * c'est la variable qui décidera du prix, annoncée avant le premier
   * rendez-vous. Un prospect sait ainsi sur quoi on l'interrogera.
   */
  tarifPrecision: string;
  /** Ce que le client obtient — jamais ce que nous faisons. */
  gains: string[];
  /**
   * La liste des livrables, quand la prestation en porte une.
   *
   * SEULE la conception de documents en a, et c'est ce qui lui donne son
   * sens : « concevoir des documents stratégiques » ne dit rien tant qu'on
   * n'a pas lu « manuel de procédures, plan marketing, plaquette
   * commerciale ». Absente sur les deux autres, l'absence n'est pas un trou.
   */
  documents?: string[];
}

/** Le profil mis en avant dans le héros. */
export interface ProfilWatosonne {
  oeil: string;
  nom: string;
  /**
   * Les deux lettres du disque. ÉCRITES, et non dérivées du nom.
   *
   * La règle générale du projet prend la première lettre des deux premiers
   * mots : « Mr. WATO » donnerait « MW » — juste par accident, puisque « M »
   * y est une civilité et non un prénom. Une règle qui tombe juste pour la
   * mauvaise raison tombera faux au prochain nom.
   */
  initiales: string;
  titre: string;
  /** Les deux repères en pastilles — ancienneté, diplôme. */
  reperes: string[];
}

export interface PresentationWatosonne {
  /** Petite capitale au-dessus du titre. */
  oeil: string;
  /** Le nom du cabinet, d'un seul tenant — titre d'onglet et méta-données. */
  titre: string;
  /**
   * Le titre COUPÉ, tel que le héros l'affiche sur deux lignes.
   *
   * Le prototype écrit `Watosonne<br>Consulting`. La coupure est un choix de
   * mise en page, pas une donnée : à 72 px le nom tient sur deux lignes quoi
   * qu'il arrive, et laisser le navigateur choisir où couper donnerait
   * « Watosonne Con- / sulting » sur une fenêtre étroite.
   */
  titreLignes: readonly [string, string];
  /** La phrase de résumé, employée par la méta-description. */
  chapeau: string;
  /** La promesse, en un souffle. */
  accroche: string;
  /** Ce qui la justifie, juste dessous. */
  argument: string;
  /** Le bouton principal du héros — il mène à la page de contact. */
  actionDevis: string;
  /** Le second bouton du héros — il descend jusqu'aux prestations. */
  actionPrestations: string;
  profil: ProfilWatosonne;
  /** Les trois promesses, en bas du héros. */
  promesses: string[];
  /** Le bloc « notre cadre », entre le héros et les prestations. */
  cadre: {
    oeil: string;
    titre: string;
    paragraphes: string[];
  };
  /** L'en-tête de la section des prestations. */
  prestationsOeil: string;
  prestationsTitre: string;
  prestationsTexte: string;
  /** L'intertitre qui ouvre la liste des bénéfices, sur chaque offre. */
  gainsTitre: string;
  /** L'intertitre de la liste des livrables, sur l'offre qui en porte une. */
  documentsTitre: string;
  /** Les trois offres, dans l'ordre où elles sont annoncées. */
  prestations: PrestationWatosonne[];
  /** Le bloc de contact, en pied de page. */
  appel: {
    titre: string;
    texte: string;
    /** Libellé du bouton qui mène à la page de contact. */
    action: string;
    /** Libellé accessible du lien qui compose le numéro. */
    actionAppel: string;
  };
}

const FR: PresentationWatosonne = {
  oeil: 'Expertise & conseil',
  titre: 'Watosonne Consulting',
  titreLignes: ['Watosonne', 'Consulting'],
  chapeau:
    'L’excellence managériale internationale à prix juste. Watosonne Consulting accompagne les particuliers, les entreprises et les organisations qui veulent aligner leurs pratiques sur les meilleurs standards mondiaux.',
  accroche: 'L’excellence managériale internationale à prix juste.',
  argument:
    'Pourquoi les standards d’élite et l’innovation pédagogique devraient-ils rester hors de portée ? Chez Watosonne Consulting, nous faisons le choix d’un impact réel et partagé.',
  actionDevis: 'Demander un devis',
  actionPrestations: 'Voir les prestations',
  profil: {
    oeil: 'Profil exécutif',
    nom: 'Mr. WATO',
    initiales: 'MW',
    titre: 'Expert Senior en Management d’Entreprise, Auteur & Coach Formateur Certifié.',
    reperes: ['15+ ans d’expérience', 'Master 2 Sciences de Gestion'],
  },
  promesses: [
    'Un accompagnement sur mesure',
    'Des tarifs pensés pour les budgets locaux',
    'Des méthodes testées et validées à l’international',
  ],
  cadre: {
    oeil: 'Notre cadre',
    titre: 'Des méthodes validées à l’international, adaptées à votre structure',
    paragraphes: [
      'Watosonne Consulting accompagne les particuliers, entreprises et organisations qui veulent aligner leurs pratiques sur les meilleurs standards mondiaux.',
      'L’accompagnement est fondé par une experte certifiée par Microsoft et Google, références internationales en accompagnement spécialisé. C’est ce cadre de référence qui est mis à votre disposition, adapté à votre structure et à votre budget.',
    ],
  },
  prestationsOeil: 'Nos prestations',
  prestationsTitre: 'Trois accompagnements sur mesure',
  prestationsTexte:
    'Le montant est arrêté au devis, après un premier échange sur votre structure.',
  gainsTitre: 'Ce que vous gagnez',
  documentsTitre: 'Les documents concernés',
  prestations: [
    {
      cle: 'audit',
      titre: 'L’audit intégral d’entreprise',
      tarifPrecision: 'Selon la taille de votre société ou de votre organisation',
      gains: [
        'Un diagnostic approfondi de vos pratiques managériales et de votre organisation.',
        'Un plan d’action stratégique clé en main, prêt à être déployé pour moderniser et optimiser votre activité.',
        'Une image de marque rehaussée auprès de vos clients et partenaires grâce à des méthodes validées à l’international.',
        'Un regard d’expert international pour structurer toutes vos entreprises et organisations, à un tarif pensé pour les budgets locaux.',
      ],
    },
    {
      cle: 'formation',
      titre: 'La formation des équipes dans votre entreprise et vos organisations',
      tarifPrecision: 'Sur devis, selon le nombre de participants',
      gains: [
        'Des employés formés aux bonnes pratiques managériales.',
        'Un environnement managérial apaisé, moins de conflits, une nette amélioration dans l’atteinte des objectifs fixés par le top management.',
        'Une cohésion d’équipe renforcée autour d’une culture d’entreprise forte.',
        'Une montée en compétences digne des plus grands instituts de formation, à un coût accessible.',
      ],
    },
    {
      cle: 'documents',
      titre:
        'La conception de documents stratégiques de pilotage de vos entreprises et de vos organisations',
      tarifPrecision: 'Sur devis, par document conçu',
      documents: [
        'Les manuels de procédures',
        'Le document stratégique de croissance et développement',
        'Les plaquettes commerciales',
        'Les plans marketing',
        'Les plans de communication',
      ],
      gains: [
        'Des outils professionnels, ergonomiques et esthétiques, conçus sur mesure pour votre entreprise ou pour votre marque.',
        'Un gain de temps exceptionnel : la conception intellectuelle et la maquette prête à imprimer sont prises en charge.',
        'Un produit exclusif, qui distingue votre établissement ou votre projet.',
        'Une ingénierie managériale et professionnelle sur mesure, à un prix juste et accessible.',
      ],
    },
  ],
  appel: {
    titre: 'Parlons de votre organisation',
    texte:
      'Décrivez votre structure et ce que vous cherchez à faire évoluer : la réponse contient un devis, jamais une offre type.',
    action: 'Nous écrire',
    actionAppel: 'Appeler le cabinet',
  },
};

const EN: PresentationWatosonne = {
  oeil: 'Expertise & consulting',
  titre: 'Watosonne Consulting',
  titreLignes: ['Watosonne', 'Consulting'],
  chapeau:
    'World-class management expertise at a fair price. Watosonne Consulting works with individuals, companies and organisations that want to bring their practices in line with the best global standards.',
  accroche: 'World-class management expertise at a fair price.',
  argument:
    'Why should elite standards and teaching innovation stay out of reach? At Watosonne Consulting, we choose real, shared impact instead.',
  actionDevis: 'Request a quote',
  actionPrestations: 'See the services',
  profil: {
    oeil: 'Executive profile',
    nom: 'Mr. WATO',
    initiales: 'MW',
    titre: 'Senior business management expert, author and certified coach-trainer.',
    reperes: ['15+ years of experience', 'Master 2 in Management Science'],
  },
  promesses: [
    'Support built for your structure',
    'Rates set with local budgets in mind',
    'Methods tested and validated internationally',
  ],
  cadre: {
    oeil: 'Our framework',
    titre: 'Internationally validated methods, adapted to your organisation',
    paragraphes: [
      'Watosonne Consulting works with individuals, companies and organisations that want to bring their practices in line with the best global standards.',
      'The practice was founded by an expert certified by Microsoft and Google, international references in specialised support. That framework is what we put at your disposal, adapted to your structure and your budget.',
    ],
  },
  prestationsOeil: 'Our services',
  prestationsTitre: 'Three tailored engagements',
  prestationsTexte:
    'The amount is settled in the quote, after a first conversation about your organisation.',
  gainsTitre: 'What you gain',
  documentsTitre: 'The documents covered',
  prestations: [
    {
      cle: 'audit',
      titre: 'The full business audit',
      tarifPrecision: 'Depending on the size of your company or organisation',
      gains: [
        'A thorough review of your management practices and of the way your organisation runs.',
        'A ready-to-use strategic action plan, prepared for deployment to modernise and streamline your activity.',
        'A stronger reputation with your clients and partners, built on internationally validated methods.',
        'An international expert’s eye to structure all your companies and organisations, at a rate set with local budgets in mind.',
      ],
    },
    {
      cle: 'formation',
      titre: 'Team training inside your company and your organisations',
      tarifPrecision: 'On quote, depending on the number of participants',
      gains: [
        'Staff trained in sound management practice.',
        'A calmer management environment, fewer conflicts, and a clear improvement in meeting the targets set by senior management.',
        'Stronger team cohesion around a solid company culture.',
        'Skills growth worthy of the largest training institutes, at an affordable cost.',
      ],
    },
    {
      cle: 'documents',
      titre: 'Designing the strategic steering documents of your companies and organisations',
      tarifPrecision: 'On quote, per document designed',
      documents: [
        'Procedure manuals',
        'The strategic growth and development document',
        'Sales brochures',
        'Marketing plans',
        'Communication plans',
      ],
      gains: [
        'Professional, ergonomic and well-made tools, designed specifically for your company or your brand.',
        'Exceptional time savings: both the thinking behind the document and the print-ready layout are handled.',
        'An exclusive product that sets your organisation or your project apart.',
        'Bespoke management and professional engineering, at a fair and accessible price.',
      ],
    },
  ],
  appel: {
    titre: 'Let’s talk about your organisation',
    texte:
      'Describe your structure and what you want to change: the answer contains a quote, never an off-the-shelf offer.',
    action: 'Write to us',
    actionAppel: 'Call the practice',
  },
};

export function lirePresentationWatosonne(langue: LangueInterface): PresentationWatosonne {
  return langue === 'en' ? EN : FR;
}

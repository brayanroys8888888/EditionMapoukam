import type { LangueInterface } from '@/i18n';
import type { Section } from './editorial';

/**
 * L'ASSOCIATION DAVE — la présentation, versionnée dans le dépôt.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ POURQUOI CE TEXTE EST DANS UN FICHIER, ALORS QUE LES CONTENUS SONT EN   │
 * │ BASE.                                                                    │
 * │                                                                          │
 * │ Décision du 3 septembre 2026. Les deux moitiés de l'espace associatif    │
 * │ n'ont ni le même rythme ni le même risque :                              │
 * │                                                                          │
 * │ • CETTE PAGE — qui est l'association, ce qu'elle fait, comment adhérer — │
 * │   change deux fois par an, et elle est la première chose que voit un     │
 * │   visiteur. Elle doit s'afficher sans requête, être relue en revue de    │
 * │   code, et exister dans les DEUX langues sous peine de ne pas compiler.  │
 * │                                                                          │
 * │ • LES CONTENUS — récits de terrain, actions, ressources — se publient au │
 * │   fil de l'eau, par l'éditeur, depuis `/admin/association`. Les mettre   │
 * │   ici demanderait un déploiement à chaque publication, et surtout ils    │
 * │   portent un DROIT D'ACCÈS : `abonnes` ou `libre`. Un droit se garde en  │
 * │   base, où RLS et les privilèges de colonne le protègent — jamais dans   │
 * │   un fichier que le client télécharge.                                   │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ CE TEXTE VIENT DE L'ASSOCIATION, PAS DE NOUS.                           │
 * │                                                                          │
 * │ Le 4 septembre 2026, une première version de ce fichier a été remplacée  │
 * │ intégralement. Elle avait été écrite d'après le reste du site, faute de  │
 * │ mieux, et elle décrivait une association qui dote des bibliothèques et   │
 * │ recueille des contes auprès de conteurs. C'était vraisemblable et c'était │
 * │ faux : DAVE travaille auprès des ENFANTS À BESOINS SPÉCIFIQUES, et sa    │
 * │ devise — « grandir ensemble, apprendre autrement » — est sur son logo.   │
 * │                                                                          │
 * │ Tout ce qui suit est repris des textes fournis par l'association. Ne pas │
 * │ « améliorer » ces phrases : elles engagent une structure réelle auprès   │
 * │ de familles réelles, et une reformulation habile y glisse une promesse   │
 * │ que personne n'a faite.                                                  │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ AUCUN MONTANT D'ADHÉSION N'EST ÉCRIT ICI.                               │
 * │                                                                          │
 * │ Les tarifs vivent dans `subscription_plans` / `plan_prices` depuis la    │
 * │ migration 0068, et dépendent de la zone d'encaissement. Un prix recopié  │
 * │ dans ce fichier serait faux le jour où l'éditeur le change dans          │
 * │ `/admin/offres`, et il aurait l'air vrai. L'écran lit les offres ; ce    │
 * │ texte dit ce qu'on obtient, jamais ce qu'on paie.                        │
 * └──────────────────────────────────────────────────────────────────────────┘
 */

/**
 * LE LOGO DE L'ASSOCIATION.
 *
 * `largeur` et `hauteur` sont celles du fichier, relevées sur le disque. Sans
 * elles, la page saute au moment où l'image arrive — et sur une connexion
 * lente, elle arrive après le texte que le visiteur a commencé à lire.
 */
export const LOGO_ASSOCIATION = {
  fichier: 'logo-dave.jpg',
  largeur: 1024,
  hauteur: 1024,
} as const;

/**
 * LA VIDÉO DE PRÉSENTATION.
 *
 * Dix secondes, 640 × 360, un peu plus d'un mégaoctet — relevés dans ses
 * atomes, faute de `ffprobe` sur la machine. Elle ne descend QUE si le visiteur
 * la lance : `preload="none"` et une affiche. §5.1 — une part importante du
 * public est sur réseau mobile lent, et une vidéo qui se télécharge d'elle-même
 * y consomme un forfait sans qu'on l'ait demandé.
 *
 * L'affiche n'est pas une image extraite de la vidéo : c'est le visuel
 * « Ensemble, nous apprenons mieux » fourni par l'association. Un poster ne
 * promet pas la première image du film, il promet le sujet.
 */
export const VIDEO_PRESENTATION = {
  fichier: 'presentation.mp4',
  affiche: 'apprendre-ensemble.jpg',
} as const;

/**
 * UN AXE DE L'ACTION DE TERRAIN — la bande sombre en porte trois.
 *
 * Le `numero` est ÉCRIT, il n'est pas calculé depuis le rang : « 01 » n'est
 * pas `1`, et un rang recalculé à l'affichage se décalerait le jour où
 * l'association en ajoute un quatrième au milieu.
 */
export interface AxeAssociation {
  numero: string;
  titre: string;
  corps: string;
}

/**
 * UNE FAÇON DE SOUTENIR SANS ADHÉRER.
 *
 * `cle` choisit le PICTOGRAMME, jamais le texte. Un nom de fichier ou un
 * caractère d'émoji posé dans ce fichier ferait entrer du dessin dans une
 * donnée éditoriale ; le composant tient la table des tracés, et une clé
 * inconnue n'affiche simplement pas de pictogramme.
 */
export interface SoutienAssociation {
  cle: 'partager' | 'ateliers' | 'campagnes';
  titre: string;
  corps: string;
}

/**
 * UNE PHOTOGRAPHIE DU COLLAGE DU HÉROS.
 *
 * `alt` est une donnée éditoriale NOMMÉE POUR CET USAGE — c'est l'exception
 * que `tests/unit/images-discipline.test.ts` énonce lui-même, au même titre
 * que `logoAlt`. Il décrit ce que la photographie montre, et ne recopie aucun
 * texte déjà à l'écran.
 */
export interface PhotoAssociation {
  fichier: string;
  alt: string;
}

export interface PresentationAssociation {
  /** Petite capitale au-dessus du titre. */
  oeil: string;
  titre: string;
  chapeau: string;
  /** La devise, telle qu'elle est écrite sur le logo. */
  devise: string;
  /** Texte de remplacement du logo — il PORTE le nom et la devise. */
  logoAlt: string;
  /** Mission, adhésion, soutien — dans cet ordre. */
  sections: Section[];
  /**
   * Le SECOND paragraphe du héros : ce que l'association fait, après ce
   * qu'elle est. Il double le premier paragraphe de `sections[0]`, à un mot
   * près — « elle » plutôt que « l'association » —, parce qu'il est lu sans
   * le titre de section qui le précède ailleurs.
   */
  chapeauSecond: string;
  /** Le second bouton du héros : il descend aux contenus. */
  actionRecits: string;
  /** Les deux photographies du collage, à droite du titre. */
  collage: readonly PhotoAssociation[];
  /** Le sur-titre de la bande sombre. Son titre est celui de `sections[0]`. */
  axesOeil: string;
  axes: readonly AxeAssociation[];
  /** Le titre de la carte de mises en garde, en regard d'« Adhérer ». */
  notesTitre: string;
  /**
   * Les trois façons de soutenir autrement.
   *
   * ┌────────────────────────────────────────────────────────────────────────┐
   * │ CES TROIS-LÀ REDISENT `sections[2].points`, ET C'EST ASSUMÉ.          │
   * │                                                                        │
   * │ Les deux formes ne se déduisent pas l'une de l'autre : la puce de la   │
   * │ V2 est une phrase, la carte de la V3 est un titre PLUS un corps qui    │
   * │ porte une clause de plus. Une fonction qui fabriquerait l'une depuis   │
   * │ l'autre découperait sur un deux-points et mettrait une majuscule en    │
   * │ minuscule — elle marcherait sur ces six phrases et abîmerait la        │
   * │ septième, celle qui commencerait par un nom propre.                    │
   * │                                                                        │
   * │ La duplication est donc VOLONTAIRE et bornée : elle vit à trente       │
   * │ lignes de son double, dans le même fichier, sous les yeux du relecteur.│
   * │ Elle disparaît le jour où la V2 de cet écran est retirée.              │
   * └────────────────────────────────────────────────────────────────────────┘
   */
  soutiens: readonly SoutienAssociation[];
  /** La citation qui ferme la page, guillemets compris. */
  citation: string;
  /** Ce qu'elle demande au lecteur, sous elle. */
  citationRelance: string;
  videoLegende: string;
  /** Le bloc d'appel à l'adhésion, sous les sections. */
  appel: {
    titre: string;
    texte: string;
    /** Libellé du bouton qui mène aux offres associatives. */
    action: string;
  };
}

const FR: PresentationAssociation = {
  oeil: 'L’association',
  titre: 'L’Association DAVE',
  chapeau:
    'Le cœur battant de notre engagement sociétal. Née de la conviction qu’aucun enfant ne doit être laissé sur le bord de la route, l’Association DAVE incarne notre action de terrain.',
  devise: 'Grandir ensemble, apprendre autrement.',
  logoAlt: 'Association DAVE — enfants à besoins spécifiques — grandir ensemble, apprendre autrement',
  sections: [
    {
      titre: 'Notre action de terrain',
      paragraphes: [
        'L’association porte des initiatives concrètes pour rendre l’éducation inclusive et accessible à tous, en concevant des solutions adaptées et en soutenant activement les communautés.',
        'Bâtir l’éducation de demain se fait main dans la main. Les textes publiés plus bas racontent ce que nous faisons sur le terrain, le combat qui les motive, et comment y prendre part.',
      ],
      points: [
        'Briser l’isolement : offrir à un enfant en situation de handicap ou de difficulté d’apprentissage les moyens de participer comme les autres.',
        'Soutenir les familles : apporter aux parents des solutions concrètes et rassurantes pour accompagner le quotidien à la maison.',
        'Semer l’espoir : prouver que chaque communauté, même rurale ou défavorisée, mérite un accès égal à l’excellence éducative.',
      ],
    },
    {
      titre: 'Adhérer',
      paragraphes: [
        'L’adhésion est un abonnement distinct de celui du catalogue, et c’est délibéré : l’un finance des livres, l’autre finance des actions. Ils ne se remplacent pas, ne se déduisent pas l’un de l’autre, et l’on peut n’en prendre qu’un.',
        'Adhérer ouvre l’ensemble des contenus réservés de cet espace : récits de terrain détaillés, ressources d’accompagnement, supports adaptés et comptes rendus d’ateliers.',
      ],
      points: [
        'L’adhésion n’ouvre pas la lecture en ligne du catalogue — c’est l’abonnement de lecture qui le fait.',
        'L’abonnement de lecture n’ouvre pas les contenus réservés de l’association.',
        'Ni l’un ni l’autre ne donne le droit de télécharger un livre : cela reste réservé à l’achat.',
      ],
    },
    {
      titre: 'Nous soutenir autrement',
      paragraphes: [
        'On nous demande souvent : « Comment puis-je vous aider concrètement ? » La bonne nouvelle, c’est que chaque geste, même le plus simple, a un impact immense sur le terrain.',
      ],
      points: [
        'Partager et faire connaître : parler de nos actions autour de vous, partager nos publications, en parler à un proche.',
        'Participer à nos événements et ateliers : séminaires, formations et ateliers, en présentiel ou en ligne.',
        'Soutenir nos campagnes de terrain : contribuer à la production et à la distribution des kits pédagogiques dans les zones prioritaires.',
      ],
    },
  ],
  chapeauSecond:
    'Elle porte des initiatives concrètes pour rendre l’éducation inclusive et accessible à tous, en concevant des solutions adaptées et en soutenant activement les communautés.',
  actionRecits: 'Lire nos récits de terrain',
  collage: [
    {
      fichier: 'kit-pedagogique.jpg',
      alt: 'Un enfant et une éducatrice, souriants devant un imagier posé sur le pupitre',
    },
    {
      fichier: 'classes-inclusives.jpg',
      alt: 'Trois scènes de classe : construction en cubes, lecture à voix haute, atelier de peinture',
    },
  ],
  axesOeil: 'Pourquoi chaque action compte',
  axes: [
    {
      numero: '01',
      titre: 'Briser l’isolement',
      corps:
        'Offrir à un enfant en situation de handicap ou de difficulté d’apprentissage les moyens de participer comme les autres.',
    },
    {
      numero: '02',
      titre: 'Soutenir les familles',
      corps:
        'Apporter aux parents des solutions concrètes et rassurantes pour accompagner le quotidien à la maison.',
    },
    {
      numero: '03',
      titre: 'Semer l’espoir',
      corps:
        'Prouver que chaque communauté, même rurale ou défavorisée, mérite un accès égal à l’excellence éducative.',
    },
  ],
  notesTitre: 'Ce qu’il faut savoir',
  soutiens: [
    {
      cle: 'partager',
      titre: 'Partager et faire connaître',
      corps:
        'Parler de nos actions autour de vous, partager nos publications, en parler à un proche : c’est déjà offrir de la visibilité à notre cause.',
    },
    {
      cle: 'ateliers',
      titre: 'Participer aux ateliers',
      corps:
        'Rejoindre nos séminaires, nos formations ou nos ateliers, en présentiel ou en ligne, pour enrichir vos pratiques.',
    },
    {
      cle: 'campagnes',
      titre: 'Soutenir les campagnes',
      corps:
        'Contribuer à la production et à la distribution de nos kits pédagogiques pour équiper les enfants dans les zones prioritaires.',
    },
  ],
  citation: '« Seul on va plus vite, ensemble on va plus loin. »',
  citationRelance:
    'Rejoignez le mouvement et devenez, vous aussi, un acteur de la révolution éducative.',
  videoLegende: 'L’Association DAVE en vidéo.',
  appel: {
    titre: 'Rejoindre le mouvement',
    texte:
      '« Seul on va plus vite, ensemble on va plus loin. » L’adhésion ouvre les contenus réservés de cet espace et soutient la production et la distribution des kits pédagogiques.',
    action: 'Voir les formules d’adhésion',
  },
};

const EN: PresentationAssociation = {
  oeil: 'The association',
  titre: 'The DAVE Association',
  chapeau:
    'The beating heart of our social commitment. Born of the conviction that no child should be left by the roadside, the DAVE Association is our work on the ground.',
  devise: 'Growing up together, learning differently.',
  logoAlt:
    'DAVE Association — children with specific needs — growing up together, learning differently',
  sections: [
    {
      titre: 'Our work on the ground',
      paragraphes: [
        'The association runs concrete initiatives to make education inclusive and accessible to everyone, by designing adapted solutions and actively supporting communities.',
        'Building tomorrow’s education is done hand in hand. The pieces published below tell what we do on the ground, the fight behind it, and how to take part.',
      ],
      points: [
        'Breaking isolation: giving a child with a disability or a learning difficulty the means to take part like the others.',
        'Supporting families: giving parents concrete, reassuring answers for everyday life at home.',
        'Sowing hope: proving that every community, however rural or underserved, deserves equal access to educational excellence.',
      ],
    },
    {
      titre: 'Becoming a member',
      paragraphes: [
        'Membership is a subscription separate from the catalogue one, and that is deliberate: one funds books, the other funds action. They do not replace each other, neither is deducted from the other, and you may take only one.',
        'Membership opens every reserved item in this space: detailed field reports, support resources, adapted materials and workshop write-ups.',
      ],
      points: [
        'Membership does not open online reading of the catalogue — the reading subscription does that.',
        'The reading subscription does not open the association’s reserved contents.',
        'Neither grants the right to download a book: that remains reserved to a purchase.',
      ],
    },
    {
      titre: 'Other ways to help',
      paragraphes: [
        'We are often asked: “How can I actually help?” The good news is that every gesture, however small, has an immense impact on the ground.',
      ],
      points: [
        'Share and spread the word: talk about our work around you, share our posts, mention it to someone close.',
        'Join our events and workshops: seminars, training and workshops, in person or online.',
        'Support our field campaigns: help produce and distribute teaching kits in priority areas.',
      ],
    },
  ],
  chapeauSecond:
    'It runs concrete initiatives to make education inclusive and accessible to everyone, by designing adapted solutions and actively supporting communities.',
  actionRecits: 'Read our field reports',
  collage: [
    {
      fichier: 'kit-pedagogique.jpg',
      alt: 'A child and an educator, smiling over a picture board laid on the desk',
    },
    {
      fichier: 'classes-inclusives.jpg',
      alt: 'Three classroom scenes: building with blocks, reading aloud, a painting workshop',
    },
  ],
  axesOeil: 'Why every action counts',
  axes: [
    {
      numero: '01',
      titre: 'Breaking isolation',
      corps:
        'Giving a child with a disability or a learning difficulty the means to take part like the others.',
    },
    {
      numero: '02',
      titre: 'Supporting families',
      corps: 'Giving parents concrete, reassuring answers for everyday life at home.',
    },
    {
      numero: '03',
      titre: 'Sowing hope',
      corps:
        'Proving that every community, however rural or underserved, deserves equal access to educational excellence.',
    },
  ],
  notesTitre: 'What to know',
  soutiens: [
    {
      cle: 'partager',
      titre: 'Share and spread the word',
      corps:
        'Talking about our work around you, sharing our posts, mentioning it to someone close: that alone gives our cause visibility.',
    },
    {
      cle: 'ateliers',
      titre: 'Join the workshops',
      corps:
        'Joining our seminars, training sessions or workshops, in person or online, to enrich your practice.',
    },
    {
      cle: 'campagnes',
      titre: 'Support the campaigns',
      corps:
        'Helping produce and distribute our teaching kits to equip children in priority areas.',
    },
  ],
  citation: '“Alone we go faster, together we go further.”',
  citationRelance: 'Join the movement and become, in turn, an actor of the educational revolution.',
  videoLegende: 'The DAVE Association on video.',
  appel: {
    titre: 'Join the movement',
    texte:
      '“Alone we go faster, together we go further.” Membership opens the reserved contents of this space and supports the production and distribution of teaching kits.',
    action: 'See membership plans',
  },
};

const PRESENTATIONS: Record<LangueInterface, PresentationAssociation> = { fr: FR, en: EN };

/** La présentation, dans la langue demandée. Les deux existent, le type l'impose. */
export function lirePresentationAssociation(langue: LangueInterface): PresentationAssociation {
  return PRESENTATIONS[langue];
}

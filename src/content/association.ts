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
 * │ • LES CONTENUS — comptes rendus, actions, ressources — se publient au    │
 * │   fil de l'eau, par l'éditeur, depuis `/admin/association`. Les mettre   │
 * │   ici demanderait un déploiement à chaque publication, et surtout ils    │
 * │   portent un DROIT D'ACCÈS : `abonnes` ou `libre`. Un droit se garde en  │
 * │   base, où RLS et les privilèges de colonne le protègent — jamais dans   │
 * │   un fichier que le client télécharge.                                   │
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
export interface PresentationAssociation {
  /** Petite capitale au-dessus du titre. */
  oeil: string;
  titre: string;
  chapeau: string;
  /** Mission, adhésion, appel à soutien — dans cet ordre. */
  sections: Section[];
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
  titre: 'L’Association Dave',
  chapeau:
    'Faire arriver des histoires là où elles n’arrivent pas — dans les classes sans bibliothèque, chez les familles éloignées du livre, auprès des enfants que la lecture met en difficulté.',
  sections: [
    {
      titre: 'Ce que nous faisons',
      paragraphes: [
        'L’Association Dave est née du même constat que la maison d’édition : des enfants grandissent sans jamais entendre une histoire qui leur ressemble. L’édition répond à une partie du problème — encore faut-il que les livres franchissent la porte.',
        'L’association s’occupe de cette porte. Elle dote des classes et des bibliothèques de quartier, forme des adultes qui lisent à voix haute, et accompagne les familles d’enfants à besoins spécifiques, pour qui la lecture du soir demande des aménagements que personne ne leur explique.',
      ],
      points: [
        'Dotation de contes et de livrets pédagogiques à des écoles et des associations de quartier.',
        'Ateliers de lecture à voix haute, pour des parents et des enseignants qui n’ont jamais été formés à cela.',
        'Accompagnement des familles d’enfants dyslexiques, à trouble de l’attention, ou simplement fâchés avec le déchiffrage.',
        'Recueil et transmission de contes auprès de conteurs, avant que les versions orales ne se perdent.',
      ],
    },
    {
      titre: 'Adhérer',
      paragraphes: [
        'L’adhésion est un abonnement distinct de celui du catalogue, et c’est délibéré : l’un finance des livres, l’autre finance des actions. Ils ne se remplacent pas, ne se déduisent pas l’un de l’autre, et l’on peut n’en prendre qu’un.',
        'Adhérer ouvre l’ensemble des contenus réservés de cet espace : comptes rendus détaillés des actions, fiches d’accompagnement, guides pour monter un atelier, entretiens avec les conteurs et les enseignants avec qui nous travaillons.',
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
        'Une adhésion n’est pas la seule façon d’aider, et parfois pas la plus utile. Une classe qui accueille un atelier, un conteur qui accepte d’être enregistré, un libraire qui garde deux cartons : ce sont des soutiens que l’argent n’achète pas.',
        'Si vous êtes enseignant, bibliothécaire, orthophoniste, conteur, ou simplement quelqu’un qui connaît une structure à qui ces livres manqueraient, écrivez-nous. La page de contact suffit — dites d’où vous écrivez et ce que vous voyez autour de vous.',
      ],
    },
  ],
  appel: {
    titre: 'Rejoindre l’association',
    texte:
      'L’adhésion ouvre les contenus réservés de cet espace et finance les dotations et les ateliers.',
    action: 'Voir les formules d’adhésion',
  },
};

const EN: PresentationAssociation = {
  oeil: 'The association',
  titre: 'The Dave Association',
  chapeau:
    'Bringing stories where they do not arrive — to classrooms without a library, to families far from books, to children for whom reading is a struggle.',
  sections: [
    {
      titre: 'What we do',
      paragraphes: [
        'The Dave Association grew out of the same observation as the publishing house: children grow up without ever hearing a story that looks like them. Publishing answers part of the problem — the books still have to get through the door.',
        'The association takes care of that door. It equips classrooms and neighbourhood libraries, trains adults to read aloud, and supports families of children with specific needs, for whom bedtime reading requires adjustments nobody ever explains to them.',
      ],
      points: [
        'Donations of tales and teaching booklets to schools and neighbourhood associations.',
        'Read-aloud workshops for parents and teachers who were never trained for it.',
        'Support for families of children with dyslexia, attention difficulties, or simply a quarrel with decoding.',
        'Collecting and passing on tales from storytellers, before the oral versions are lost.',
      ],
    },
    {
      titre: 'Becoming a member',
      paragraphes: [
        'Membership is a subscription separate from the catalogue one, and that is deliberate: one funds books, the other funds action. They do not replace each other, neither is deducted from the other, and you may take only one.',
        'Membership opens every reserved item in this space: detailed reports on our work, support sheets, guides for running a workshop, and interviews with the storytellers and teachers we work with.',
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
        'Membership is not the only way to help, and sometimes not the most useful one. A class that hosts a workshop, a storyteller willing to be recorded, a bookseller who keeps two boxes aside: these are forms of support money cannot buy.',
        'If you are a teacher, a librarian, a speech therapist, a storyteller, or simply someone who knows a place these books would be missed, write to us. The contact page is enough — tell us where you are writing from and what you see around you.',
      ],
    },
  ],
  appel: {
    titre: 'Join the association',
    texte:
      'Membership opens the reserved contents of this space and funds the donations and the workshops.',
    action: 'See membership plans',
  },
};

const PRESENTATIONS: Record<LangueInterface, PresentationAssociation> = { fr: FR, en: EN };

/** La présentation, dans la langue demandée. Les deux existent, le type l'impose. */
export function lirePresentationAssociation(langue: LangueInterface): PresentationAssociation {
  return PRESENTATIONS[langue];
}

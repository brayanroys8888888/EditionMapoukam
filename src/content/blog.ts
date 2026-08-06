/**
 * LE BLOG — contenu versionné, dans le dépôt.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ POURQUOI DES FICHIERS, ET PAS UNE TABLE.                                │
 * │                                                                          │
 * │ Décision du 4 août 2026. Un blog en base demanderait une migration, des  │
 * │ politiques RLS, deux routes d'API et un écran d'administration — c'est   │
 * │ un chantier backend à part entière, et il retarderait la validation de   │
 * │ la direction visuelle, qui est ce qu'on cherche à obtenir maintenant.    │
 * │                                                                          │
 * │ Le prix à payer est nommé : publier un article demande un déploiement.   │
 * │ Le jour où le rythme de publication le rendra pénible, ce fichier se     │
 * │ remplace par une table sans que les écrans changent — ils ne connaissent │
 * │ que `lireArticle` et `ARTICLES`.                                         │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ MÊME FORME QUE `editorial.ts`, ET C'EST VOULU.                          │
 * │                                                                          │
 * │ Des sections de paragraphes et de points, en TypeScript plutôt qu'en     │
 * │ Markdown : le contenu est alors VÉRIFIÉ PAR LE COMPILATEUR. Un article   │
 * │ sans titre, une catégorie inconnue ou une clé mal orthographiée ne       │
 * │ compilent pas — là où un fichier Markdown mal formé se découvre en       │
 * │ production, sur la page publiée.                                         │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
import type { Section } from './editorial';

/**
 * Les catégories, en énumération FERMÉE.
 *
 * Le même raisonnement que `region_conte` : une catégorie en texte libre finit
 * par exister en trois orthographes, et la quatrième s'affiche sans couleur.
 */
export const CATEGORIES_BLOG = [
  'accompagnement',
  'pedagogie',
  'culture',
  'association',
] as const;

export type CategorieBlog = (typeof CATEGORIES_BLOG)[number];

export interface Article {
  slug: string;
  titre: string;
  /** Une phrase, affichée en liste et en tête d'article. */
  chapeau: string;
  categorie: CategorieBlog;
  /**
   * Date de publication, en `AAAA-MM-JJ`.
   *
   * Une chaîne et non une `Date` : les dates de contenu sont éditoriales, pas
   * métier. Elles ne passent pas par l'horloge injectable, et les figer en
   * chaîne évite qu'un fuseau les décale d'un jour à l'affichage.
   */
  publieLe: string;
  /** Durée de lecture, en minutes. Écrite, jamais estimée par un compteur. */
  minutes: number;
  /** Mis en avant en tête de liste. Un seul à la fois. */
  vedette?: boolean;
  sections: Section[];
}

export const ARTICLES: Article[] = [
  {
    slug: 'lire-a-voix-haute',
    titre: 'Lire à voix haute, même quand on n’est pas conteur',
    chapeau:
      'On croit qu’il faut savoir raconter. Il faut surtout accepter de lire mal, et de recommencer le lendemain.',
    categorie: 'accompagnement',
    publieLe: '2026-07-28',
    minutes: 6,
    vedette: true,
    sections: [
      {
        titre: 'Le trac des parents',
        paragraphes: [
          'Beaucoup de parents renoncent à la lecture du soir parce qu’ils se trouvent mauvais. Ils lisent trop vite, butent sur les noms, ne savent pas faire les voix. Ils comparent leur lecture à celle d’un comédien, et concluent qu’ils desservent l’histoire.',
          'Un enfant n’entend rien de tout cela. Ce qu’il entend, c’est une voix qu’il connaît, à une heure qu’il attend, dans un livre qu’il a choisi. La qualité de la diction arrive très loin derrière ces trois choses.',
        ],
      },
      {
        titre: 'Trois appuis qui changent tout',
        points: [
          'Ralentir davantage que ce qui paraît naturel — un enfant fabrique les images pendant les silences, pas pendant les phrases.',
          'S’arrêter sur une illustration et demander ce qui va arriver, plutôt que de vérifier ce qui a été compris.',
          'Accepter de relire le même conte vingt soirs de suite : la répétition n’est pas de l’ennui, c’est la façon dont l’histoire s’installe.',
        ],
      },
      {
        titre: 'Et quand on n’a pas le temps',
        paragraphes: [
          'Une page suffit. Un conte peut se lire en cinq soirs, et l’attente entre deux soirs fait partie du plaisir — c’est même ainsi que ces histoires circulaient à l’origine, une veillée après l’autre.',
        ],
      },
    ],
  },
  {
    slug: 'choisir-selon-l-age',
    titre: 'Choisir un conte selon l’âge, sans se tromper',
    chapeau:
      'Deux âges figurent sur chaque conte, et ils ne disent pas la même chose : l’un pour écouter, l’autre pour lire seul.',
    categorie: 'pedagogie',
    publieLe: '2026-07-21',
    minutes: 5,
    sections: [
      {
        titre: 'Écouter et lire ne s’acquièrent pas ensemble',
        paragraphes: [
          'Un enfant comprend, à l’oreille, des histoires bien plus complexes que celles qu’il peut déchiffrer. L’écart est de deux à trois ans, et il est normal : décoder des lettres occupe toute l’attention, il n’en reste plus pour l’intrigue.',
          'C’est pourquoi chaque conte porte deux mentions — « à écouter dès 5 ans », « à lire seul dès 7 ans ». Prendre la seconde pour la première, c’est priver un enfant de trois ans d’histoires qu’il aurait adorées.',
        ],
      },
      {
        titre: 'Ce qui compte plus que l’âge',
        points: [
          'La longueur : un conte de quarante pages en une fois décourage, le même en quatre soirs enchante.',
          'La densité des illustrations : elles sont des points de repos, pas de la décoration.',
          'Le sujet : la ruse, l’amitié et la peur ne se rencontrent pas au même moment selon les enfants.',
        ],
      },
    ],
  },
  {
    slug: 'anansi-et-les-histoires-du-monde',
    titre: 'Anansi, l’araignée qui possédait toutes les histoires',
    chapeau:
      'Un même personnage, trois continents : comment les contes akan ont voyagé jusqu’aux Caraïbes.',
    categorie: 'culture',
    publieLe: '2026-07-14',
    minutes: 7,
    sections: [
      {
        titre: 'Les anansesem',
        paragraphes: [
          'Chez les Akan, au Ghana et dans l’est de la Côte d’Ivoire, les contes portent un nom qui dit déjà tout : les anansesem, « les histoires d’Anansi ». Ils se racontent le soir, après le travail, quand les enfants ont fini de manger.',
          'Anansi n’est pas un héros fort. Elle est petite, souvent gourmande, parfois prise à son propre piège. Les enfants apprennent avec elle que l’intelligence vaut mieux que la force — et qu’elle a ses limites.',
        ],
      },
      {
        titre: 'Un voyage qu’on n’a pas choisi',
        paragraphes: [
          'Déportés aux Caraïbes, les Akan ont emmené leurs histoires : c’était ce qu’on ne pouvait pas leur prendre. Anansi y est devenue Anancy en Jamaïque, Ti Malice à Haïti.',
          'Raconter Anansi à un enfant aujourd’hui, ce n’est donc pas seulement lui raconter une ruse d’araignée. C’est lui montrer qu’une histoire peut survivre à tout, et continuer de faire rire trois siècles plus tard.',
        ],
      },
    ],
  },
  {
    slug: 'contes-en-classe',
    titre: 'Utiliser un conte africain en classe : ce qui marche',
    chapeau:
      'Retours d’enseignants de maternelle et de cycle 2, et les écueils qu’ils signalent tous.',
    categorie: 'pedagogie',
    publieLe: '2026-07-07',
    minutes: 8,
    sections: [
      {
        titre: 'Commencer par l’histoire, jamais par le pays',
        paragraphes: [
          'L’erreur la plus fréquente est d’ouvrir sur une carte. L’enfant reçoit alors le conte comme une leçon de géographie, et l’écoute comme telle. Les enseignants qui lisent d’abord l’histoire, et ne situent qu’après, décrivent une attention tout autre.',
        ],
      },
      {
        titre: 'Ce que les enfants retiennent',
        points: [
          'Les personnages avant les lieux — Anansi bien avant le Ghana.',
          'Les répétitions et les formules, qu’ils reprennent en chœur dès la deuxième lecture.',
          'Les motifs des illustrations, qu’ils reconnaissent d’un livre à l’autre.',
        ],
      },
      {
        titre: 'Prolonger sans alourdir',
        paragraphes: [
          'Une question ouverte suffit : « Anansi a trompé le python pour l’attraper. Est-ce que c’était juste ? » Il n’y a pas de bonne réponse, et c’est précisément ce qui fait parler une classe entière.',
        ],
      },
    ],
  },
  {
    slug: 'accompagner-enfants-besoins-specifiques',
    titre: 'Accompagner un enfant à besoins spécifiques dans la lecture',
    chapeau:
      'Troubles de l’attention, difficultés de déchiffrage : des aménagements simples, et ce qu’ils changent.',
    categorie: 'association',
    publieLe: '2026-06-30',
    minutes: 9,
    sections: [
      {
        titre: 'Ce qui bloque, souvent',
        paragraphes: [
          'Un enfant qui refuse de lire ne refuse presque jamais l’histoire. Il refuse l’effort de déchiffrage, la page trop dense, la honte de buter devant quelqu’un. Distinguer les deux change entièrement la réponse.',
        ],
      },
      {
        titre: 'Des aménagements qui coûtent peu',
        points: [
          'Lire à deux voix, en alternant les paragraphes : l’enfant garde le fil sans porter tout l’effort.',
          'Agrandir le texte et augmenter l’interligne — sur un fichier, c’est immédiat.',
          'Autoriser l’écoute seule certains soirs, sans en faire un échec.',
          'Choisir des contes courts, à illustrations nombreuses, quitte à revenir plus tard aux longs.',
        ],
      },
      {
        titre: 'Se faire aider',
        paragraphes: [
          'Les associations de parents et les professionnels de l’enfance connaissent des dispositifs que les familles découvrent souvent trop tard. Écrire, poser la question, demander qui contacter : c’est le pas qui débloque le reste.',
        ],
      },
    ],
  },
];

/** Un article par son slug, ou `null`. Le `null` devient un 404 côté route. */
export function lireArticle(slug: string): Article | null {
  return ARTICLES.find((article) => article.slug === slug) ?? null;
}

/**
 * Les articles, du plus récent au plus ancien.
 *
 * Le tri est fait ICI et pas dans l'écran : un écran qui trie finit par trier
 * différemment d'un autre, et la liste du blog cesse de correspondre au flux.
 * Les dates sont en `AAAA-MM-JJ`, donc l'ordre lexicographique EST l'ordre
 * chronologique — c'est la raison de ce format, et non un hasard.
 */
export function articlesRecents(): Article[] {
  return [...ARTICLES].sort((a, b) => b.publieLe.localeCompare(a.publieLe));
}

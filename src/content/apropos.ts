import type { LangueInterface } from '@/i18n';

/**
 * ╔═══════════════════════════════════════════════════════════════════════════╗
 * ║ L'ILLUSTRATION DE LA PAGE « À PROPOS ».                                   ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ POURQUOI CE TEXTE DE REMPLACEMENT N'EST PAS DANS `src/i18n`.             │
 * │                                                                          │
 * │ `tests/unit/images-discipline.test.ts` interdit `alt={traduire(…)}`, et  │
 * │ il a raison : trois images du produit portaient en `alt` la clé du titre │
 * │ écrit à trois lignes de là, si bien qu'un lecteur d'écran entendait deux │
 * │ fois la même phrase — la première annoncée comme une image. Le défaut a  │
 * │ l'air d'un soin, et c'est ce qui le rend durable.                        │
 * │                                                                          │
 * │ Le test nomme lui-même la seule exception légitime : « une donnée        │
 * │ éditoriale nommée pour cet usage ». C'est ce fichier. Le dictionnaire    │
 * │ d'interface porte des libellés que l'écran AFFICHE ; celui-ci porte une  │
 * │ description de ce qu'une image MONTRE, et rien d'autre ne la dit.        │
 * │                                                                          │
 * │ C'est le même arrangement que `logoAlt` dans `src/content/association`.  │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ ET POURQUOI CETTE IMAGE-LÀ MÉRITE UNE DESCRIPTION.                      │
 * │                                                                          │
 * │ La règle du produit est l'inverse : les images illustrent un texte qui   │
 * │ dit déjà tout, et leur `alt` est vide, à dessein. Celle-ci met en scène  │
 * │ ET NOMME les quatre univers de la maison — contes, ressources           │
 * │ pédagogiques, association, conseil. Elle est la seule vue d'ensemble de  │
 * │ la page, et les quatre cartes qui la reprennent sont à un écran de       │
 * │ défilement de là.                                                        │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export interface IllustrationApropos {
  /** Le fichier, sous `public/`. */
  source: string;
  /** Ses dimensions réelles — elles réservent la place avant l'arrivée. */
  largeur: number;
  hauteur: number;
  /** Ce que l'image MONTRE. Jamais le titre qui l'accompagne. */
  alt: string;
}

const SOURCE = '/images/apropos-univers.jpg';
const LARGEUR = 1080;
const HAUTEUR = 602;

const FR: IllustrationApropos = {
  source: SOURCE,
  largeur: LARGEUR,
  hauteur: HAUTEUR,
  alt:
    'Les quatre univers des Éditions Mapoukam : les contes africains racontés à l’ombre de ' +
    'l’arbre, les ressources pédagogiques en classe, l’Association DAVE sur le terrain et le ' +
    'consulting éducatif.',
};

const EN: IllustrationApropos = {
  source: SOURCE,
  largeur: LARGEUR,
  hauteur: HAUTEUR,
  alt:
    'The four worlds of Éditions Mapoukam: African tales told in the shade of the tree, ' +
    'teaching resources in the classroom, the DAVE Association in the field, and educational ' +
    'consulting.',
};

const ILLUSTRATIONS: Record<LangueInterface, IllustrationApropos> = { fr: FR, en: EN };

/** L'illustration, dans la langue demandée. Les deux existent, le type l'impose. */
export function lireIllustrationApropos(langue: LangueInterface): IllustrationApropos {
  return ILLUSTRATIONS[langue];
}

import fr from './fr.json';
import en from './en.json';

/**
 * Internationalisation de l'INTERFACE — §5.5.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ DEUX NIVEAUX À NE JAMAIS CONFONDRE.                                     │
 * │                                                                          │
 * │   * La langue de l'INTERFACE — menus, boutons, erreurs — est ici.        │
 * │   * La langue du CONTENU — celle du conte ouvert — est un paramètre des  │
 * │     routes, et vit dans `book_translations`.                            │
 * │                                                                          │
 * │ Les deux se règlent séparément : un parent peut lire l'interface en      │
 * │ français et ouvrir un conte en anglais. Les lier ferait disparaître un   │
 * │ usage réel du public visé.                                              │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export const LANGUES_INTERFACE = ['fr', 'en'] as const;
export type LangueInterface = (typeof LANGUES_INTERFACE)[number];

export const LANGUE_PAR_DEFAUT: LangueInterface = 'fr';

const DICTIONNAIRES = { fr, en } as const;

/**
 * Le dictionnaire français fait FOI sur la forme.
 *
 * Le type est dérivé de lui, si bien qu'une clé ajoutée en anglais et oubliée
 * en français ne compile pas. Un test vérifie la réciproque, que le type ne
 * peut pas exprimer.
 */
export type Dictionnaire = typeof fr;

/** Chemins de clés valides, en notation pointée. */
type Chemins<T> = {
  [K in keyof T & string]: T[K] extends Record<string, unknown>
    ? `${K}.${Chemins<T[K]>}`
    : K;
}[keyof T & string];

export type CleTraduction = Chemins<Dictionnaire>;

function lire(dictionnaire: unknown, chemin: string): string | undefined {
  let courant: unknown = dictionnaire;
  for (const segment of chemin.split('.')) {
    if (typeof courant !== 'object' || courant === null) return undefined;
    courant = (courant as Record<string, unknown>)[segment];
  }
  return typeof courant === 'string' ? courant : undefined;
}

/**
 * Traduit une clé.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ REPLI SUR LE FRANÇAIS, JAMAIS SUR LA CLÉ BRUTE.                         │
 * │                                                                          │
 * │ Une clé manquante en anglais doit afficher le texte français, pas        │
 * │ `navigation.catalogue`. Le repli est un défaut visible pour l'éditeur et │
 * │ acceptable pour l'utilisateur ; une clé brute n'est ni l'un ni l'autre.  │
 * │                                                                          │
 * │ Le même parti pris que les emails (`src/domain/emails/templates.ts`),    │
 * │ et pour la même raison.                                                  │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export function traduire(langue: LangueInterface, cle: CleTraduction): string {
  return lire(DICTIONNAIRES[langue], cle) ?? lire(fr, cle) ?? cle;
}

/** Traducteur lié à une langue, pour ne pas la répéter à chaque appel. */
export function traducteur(langue: LangueInterface): (cle: CleTraduction) => string {
  return (cle) => traduire(langue, cle);
}

/**
 * Message d'erreur affichable, depuis le CODE rendu par l'API.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ L'INTERFACE NE LIT JAMAIS LE `message` DE L'API POUR DÉCIDER.           │
 * │                                                                          │
 * │ L'API sépare délibérément `code` — destiné au programme — de `message` — │
 * │ destiné à l'utilisateur, et rédigé en français uniquement. Brancher sur  │
 * │ le message ferait analyser une phrase française pour choisir un          │
 * │ comportement, et rendrait l'anglais impossible.                          │
 * │                                                                          │
 * │ Un code inconnu retombe sur un message neutre : une version d'API plus   │
 * │ récente ne doit pas afficher une chaîne vide.                            │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export function messageErreur(langue: LangueInterface, code: string | undefined): string {
  const cle = `erreurs.${code ?? 'inconnue'}`;
  return lire(DICTIONNAIRES[langue], cle) ?? lire(fr, cle) ?? traduire(langue, 'erreurs.inconnue');
}

/**
 * Langue d'interface à partir d'une valeur quelconque.
 *
 * Sert au segment d'URL, à `users.langue_preferee` et à `Accept-Language` —
 * trois sources qui n'ont aucune raison d'être valides.
 */
export function langueValide(valeur: string | null | undefined): LangueInterface {
  return LANGUES_INTERFACE.includes(valeur as LangueInterface)
    ? (valeur as LangueInterface)
    : LANGUE_PAR_DEFAUT;
}

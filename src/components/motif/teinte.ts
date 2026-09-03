/**
 * LA TEINTE D'UN TITRE — choisie sur son THÈME, plus sur sa région.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ CE QUI A CHANGÉ, ET CE QUI N'A PAS CHANGÉ.                              │
 * │                                                                          │
 * │ La direction artistique n'a pas bougé d'un pixel : ce sont toujours les  │
 * │ cinq mêmes palettes, dessinées pour les cinq traditions, et les six      │
 * │ mêmes motifs. Leurs noms de jetons — `--region-sahel-fond` et les        │
 * │ autres — sont conservés tels quels : ce sont des EMPLACEMENTS de         │
 * │ palette, et ils nomment toujours exactement la palette qu'ils nomment.   │
 * │                                                                          │
 * │ Ce qui change est l'ENTRÉE du choix. Elle était `books.region` ; elle    │
 * │ est le premier thème du titre. La migration 0071 a retiré la région du   │
 * │ catalogue public — elle ne s'appliquait qu'aux contes, et faisait donc   │
 * │ disparaître tous les livrets pédagogiques dès qu'on s'en servait.        │
 * │ Continuer à colorer d'après elle aurait laissé la moitié du catalogue    │
 * │ en gris `inconnue`.                                                      │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ POURQUOI UN HACHAGE, ET NON UNE TABLE THÈME → PALETTE.                  │
 * │                                                                          │
 * │ Les thèmes sont de la SAISIE LIBRE : l'éditeur en écrit ce qu'il veut,   │
 * │ et la migration 0070 se contente de les nettoyer. Une table              │
 * │ d'association devrait donc être tenue à jour à chaque thème inventé, et  │
 * │ tout thème absent de la table retomberait en gris — c'est-à-dire que le  │
 * │ défaut d'entretien se verrait sur la page d'accueil.                     │
 * │                                                                          │
 * │ Un hachage donne à tout thème, connu ou non, une palette stable. Deux    │
 * │ titres qui partagent leur premier thème partagent leur teinte, et c'est  │
 * │ tout ce que l'œil doit lire. La fonction est PURE et déterministe : la   │
 * │ même chaîne rend toujours la même palette, hier comme au prochain        │
 * │ déploiement.                                                             │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Ce fichier ne décide d'aucun droit et ne lit aucune donnée : il transforme
 * une chaîne en nom de palette. C'est de la présentation, et rien d'autre.
 */

/**
 * Les cinq emplacements de palette, nommés d'après les traditions pour
 * lesquelles ils ont été dessinés. Le type dérive de la liste, afin qu'il n'y
 * ait pas deux inventaires à tenir d'accord.
 */
export const PALETTES = [
  'afrique_ouest',
  'sahel',
  'afrique_centrale',
  'afrique_australe',
  'afrique_est',
] as const;

export type Palette = (typeof PALETTES)[number];

/**
 * `'vide'` — le seul motif jaune du produit, celui de l'état « aucun résultat ».
 *
 * Il n'appartient à aucune palette de tradition, et c'est délibéré : un
 * catalogue vide n'a pas de couleur propre. Lui donner celle d'une tradition
 * ferait croire qu'un filtre de tradition est en cause.
 *
 * `null` — le titre n'a pas de thème. Il prend la teinte neutre `inconnue`
 * plutôt qu'une couleur tirée au sort : inventer une palette laisserait croire
 * à un rangement qui n'existe pas.
 */
export type TeinteMotif = Palette | 'vide' | null;

/**
 * Normalisation avant hachage.
 *
 * « Courage », « courage » et « Courage » doivent tomber sur la même palette.
 * La migration 0070 nettoie déjà les espaces et les doublons au moment de
 * l'enregistrement ; la casse et les accents, eux, sont des variantes
 * légitimes d'un même mot et se neutralisent ici.
 */
function normaliser(theme: string): string {
  return theme
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

/**
 * Hachage FNV-1a 32 bits — court, stable, et sans dépendance.
 *
 * Le choix de l'algorithme n'a aucune importance esthétique ; ce qui compte
 * est qu'il soit ÉCRIT ICI plutôt qu'emprunté à une bibliothèque susceptible
 * de changer d'implémentation. Une palette qui changerait au fil des versions
 * ferait clignoter tout le catalogue sans qu'aucune donnée ait bougé.
 */
function empreinte(valeur: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < valeur.length; i += 1) {
    h ^= valeur.charCodeAt(i);
    // Multiplication par 16777619 en arithmétique 32 bits non signée.
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

/**
 * La teinte d'un titre, d'après ses thèmes.
 *
 * Le PREMIER thème décide, et non l'ensemble : un titre porte souvent trois
 * ou quatre thèmes, et faire dépendre la couleur de leur combinaison la ferait
 * changer chaque fois que l'éditeur en ajoute un. Le premier est celui que
 * l'ordre alphabétique de la migration 0070 rend stable.
 */
export function teinteDepuisThemes(themes: readonly string[] | null | undefined): Palette | null {
  const premier = themes?.map(normaliser).find((theme) => theme.length > 0);
  if (premier === undefined) return null;
  return PALETTES[empreinte(premier) % PALETTES.length] ?? null;
}

/**
 * La teinte d'un thème pris seul — pour les pastilles et les vignettes qui
 * représentent le thème lui-même, non un titre.
 *
 * Le type de retour est `Palette | null`, plus étroit que `TeinteMotif` : ces
 * deux fonctions ne rendent JAMAIS `'vide'`, qui est l'état « aucun résultat »
 * et n'appartient à aucun titre. Le dire dans le type évite à l'appelant
 * d'écrire une branche qui ne s'exécuterait jamais.
 */
export function teinteDuTheme(theme: string): Palette | null {
  return teinteDepuisThemes([theme]);
}

/**
 * Normalisation de la couche texte extraite d'un PDF.
 *
 * Module PUR : aucun sous-processus, aucun accès disque, aucune base. Il reçoit
 * des mots déjà extraits et rend du texte propre. C'est ce qui permet de
 * l'éprouver sur les seize contes du corpus sans lancer poppler seize fois.
 *
 * Ce texte sert à deux choses, et les deux exigent la même propreté :
 *   * la recherche interne (§7.4.3) — un trait d'union conditionnel invisible
 *     casse une correspondance sans que personne comprenne pourquoi ;
 *   * l'accessibilité (§7.4.2) — c'est ce texte que lira une synthèse vocale
 *     dans l'EPUB à mise en page fixe.
 */

/** Un mot extrait, avec la hauteur de son glyphe. */
export interface MotExtrait {
  texte: string;
  hauteur: number;
}

/**
 * Majuscules d'une lettre qui sont des MOTS FRANÇAIS COMPLETS.
 *
 * Discriminant central du recollage des lettrines. « À l'entrée du village »
 * commence bien par une lettrine, mais le mot n'a pas été coupé : recoller
 * donnerait « Àl'entrée ». À l'inverse, « A u milieu » doit devenir « Au
 * milieu » — un « A » non accentué en tête de phrase n'est pas un mot français,
 * c'est nécessairement le début d'un mot coupé.
 *
 * Vérifié sur les seize contes du corpus : trois commencent par « Au », un par
 * « À », et la distinction tient sur l'accent seul.
 */
const MAJUSCULES_MOTS = new Set(['À', 'Ô']);

/**
 * Seuil de détection d'une lettrine, en multiple de la hauteur médiane.
 *
 * Mesuré sur le corpus : toutes les lettrines valent 2,96 fois la médiane,
 * aucune autre majuscule isolée ne dépasse 1,30. Le seuil de 2 se place au
 * milieu d'un écart qui n'a rien d'ambigu.
 */
export const SEUIL_LETTRINE = 2;

/** Hauteur médiane d'un ensemble de mots. */
export function hauteurMediane(mots: readonly MotExtrait[]): number {
  if (mots.length === 0) return 0;
  const hauteurs = mots.map((m) => m.hauteur).sort((a, b) => a - b);
  return hauteurs[Math.floor(hauteurs.length / 2)] ?? 0;
}

/** Un mot est-il une lettrine détachée ? */
export function estLettrine(mot: MotExtrait, mediane: number): boolean {
  if (mediane <= 0) return false;
  const caracteres = [...mot.texte];
  if (caracteres.length !== 1) return false;

  const lettre = caracteres[0] ?? '';
  if (!/\p{Lu}/u.test(lettre)) return false;

  return mot.hauteur / mediane >= SEUIL_LETTRINE;
}

/**
 * Recolle les lettrines détachées.
 *
 * pdftotext rend la lettrine comme un mot distinct : « I l y a très
 * longtemps » au lieu de « Il y a très longtemps ». Le défaut vient du gabarit
 * de composition, et les seize contes du corpus le portent.
 *
 * La détection est GÉOMÉTRIQUE — la taille du glyphe — et non lexicale : une
 * règle « majuscule isolée suivie d'une espace » corromprait « Y a-t-il », qui
 * est une phrase française parfaitement normale.
 */
export function recollerLettrines(mots: readonly MotExtrait[]): MotExtrait[] {
  const mediane = hauteurMediane(mots);
  const resultat: MotExtrait[] = [];

  for (let i = 0; i < mots.length; i += 1) {
    const mot = mots[i];
    if (!mot) continue;

    const suivant = mots[i + 1];
    if (suivant && estLettrine(mot, mediane) && !MAJUSCULES_MOTS.has(mot.texte)) {
      resultat.push({ texte: mot.texte + suivant.texte, hauteur: suivant.hauteur });
      i += 1;
      continue;
    }
    resultat.push(mot);
  }

  return resultat;
}

/**
 * Ligatures typographiques de présentation.
 *
 * Attention : `œ` et `æ` n'en font PAS partie. Ce sont des lettres du français,
 * pas des artefacts de composition — décomposer « œufs » en « oeufs » serait
 * une faute d'orthographe, pas une normalisation.
 */
const LIGATURES: readonly [RegExp, string][] = [
  [/ﬀ/g, 'ff'],
  [/ﬁ/g, 'fi'],
  [/ﬂ/g, 'fl'],
  [/ﬃ/g, 'ffi'],
  [/ﬄ/g, 'ffl'],
  [/ﬅ/g, 'st'],
  [/ﬆ/g, 'st'],
];

/**
 * Nettoie une chaîne extraite.
 *
 * Les traits d'union conditionnels et les espaces insécables sont invisibles à
 * l'œil et cassent silencieusement la recherche : chercher « bien-aimé »
 * échouerait sur un texte contenant « bien­aimé » avec une coupure douce.
 */
export function normaliserTexte(brut: string): string {
  let texte = brut;

  for (const [motif, remplacement] of LIGATURES) {
    texte = texte.replace(motif, remplacement);
  }

  // Trait d'union conditionnel (U+00AD) : invisible, et il coupe les mots.
  texte = texte.replace(/­/g, '');

  // Césure de fin de ligne : « lon-\ngtemps » doit redevenir « longtemps ».
  texte = texte.replace(/(\p{Ll})-\s*\n\s*(\p{Ll})/gu, '$1$2');

  // Espaces insécables et fines : conservées à l'affichage par la typographie
  // française, mais ramenées à une espace ordinaire dans le texte indexé.
  texte = texte.replace(/[\u00a0\u202f\u2009]/g, ' ');

  // Guillemets et apostrophes typographiques : on conserve la forme courbe,
  // qui est celle du texte d'origine. Seule l'apostrophe droite est ramenée à
  // la courbe, pour que la recherche ne dépende pas de la saisie.
  texte = texte.replace(/'/g, '’');

  // Blancs multiples et fins de ligne redondantes. L'ORDRE COMPTE : écraser
  // les blancs autour des sauts de ligne avant de traiter les lignes vides
  // ferait disparaître les séparations de paragraphes.
  texte = texte.replace(/[ \t]+/g, ' ');
  texte = texte.replace(/[ \t]*\n[ \t]*/g, '\n');
  texte = texte.replace(/\n{3,}/g, '\n\n');

  return texte.trim();
}

/**
 * Assemble les mots d'une page en texte lisible.
 *
 * Les lettrines sont recollées avant l'assemblage : l'ordre compte, puisque le
 * recollage a besoin des hauteurs, que l'assemblage jette.
 */
export function texteDePage(mots: readonly MotExtrait[]): string {
  return normaliserTexte(
    recollerLettrines(mots)
      .map((m) => m.texte)
      .join(' '),
  );
}

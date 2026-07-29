/**
 * Fabrication du slug d'un titre.
 *
 * Module PUR. Le slug est la clé publique d'un livre dans les URL du catalogue,
 * et la base lui impose la forme `^[a-z0-9]+(-[a-z0-9]+)*$` (migration 0006).
 * Une chaîne qui ne la respecte pas fait échouer l'insertion — mieux vaut la
 * produire correctement que découvrir la contrainte à l'exécution.
 */

/**
 * Lettres qui ne se décomposent pas.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ ICI, ET SEULEMENT ICI, « œ » DEVIENT « oe ».                            │
 * │                                                                          │
 * │ La normalisation du TEXTE fait exactement l'inverse et le conserve : dans │
 * │ un conte, « œufs » écrit « oeufs » est une faute d'orthographe. Dans une │
 * │ URL, « œ » n'est pas un caractère ASCII et n'a rien à y faire.           │
 * │                                                                          │
 * │ Les deux règles sont contraires parce qu'elles servent deux usages       │
 * │ contraires. Voir `text.ts`, qui documente le versant opposé.             │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * La décomposition Unicode NFD ne les traite pas : « œ » est une lettre à part
 * entière, pas un « o » porteur d'un signe. Elle doit donc être transcrite à la
 * main, contrairement aux accents.
 */
const TRANSCRIPTIONS: readonly [RegExp, string][] = [
  [/œ/gi, 'oe'],
  [/æ/gi, 'ae'],
  [/ø/gi, 'o'],
  [/ß/g, 'ss'],
  [/đ/gi, 'd'],
  [/ł/gi, 'l'],
];

/**
 * Slug d'un titre.
 *
 * Les apostrophes deviennent des séparateurs, et non rien : « L'arbre aux mille
 * histoires » donne `l-arbre-aux-mille-histoires`, et non `larbre-...` qui se
 * lirait mal et se retiendrait plus mal encore.
 */
export function slugifier(titre: string): string {
  let texte = titre;

  for (const [motif, remplacement] of TRANSCRIPTIONS) {
    texte = texte.replace(motif, remplacement);
  }

  return texte
    .toLowerCase()
    // NFD sépare la lettre de son accent, la seconde passe retire les accents.
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    // Tout ce qui n'est ni lettre ASCII ni chiffre devient un séparateur.
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Slug disponible, à partir d'un slug souhaité.
 *
 * Deux contes peuvent porter le même titre — une réédition, une version pour
 * un autre âge. La contrainte d'unicité de `books.slug` ferait alors échouer
 * l'ingestion du second. Le suffixe numérique est ajouté au moment du conflit,
 * jamais par précaution : `petit-baobab` reste `petit-baobab` tant qu'il est
 * seul.
 *
 * @param estPris interroge la base. Injecté pour que cette fonction reste pure
 *                et testable sans base.
 */
export async function slugDisponible(
  souhaite: string,
  estPris: (slug: string) => Promise<boolean>,
  maxTentatives = 50,
): Promise<string> {
  const base = slugifier(souhaite);
  if (base.length === 0) {
    throw new Error(`Slug vide : « ${souhaite} » ne contient aucun caractère utilisable.`);
  }

  if (!(await estPris(base))) return base;

  for (let suffixe = 2; suffixe <= maxTentatives; suffixe += 1) {
    const candidat = `${base}-${String(suffixe)}`;
    if (!(await estPris(candidat))) return candidat;
  }

  throw new Error(`Aucun slug disponible pour « ${souhaite} » après ${String(maxTentatives)} essais.`);
}

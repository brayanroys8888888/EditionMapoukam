import type { ReactNode } from 'react';

import styles from './catalogue.module.css';

/**
 * ╔═══════════════════════════════════════════════════════════════════════════╗
 * ║ CE QUI A ÉTÉ CHERCHÉ, MONTRÉ DANS CE QUI A ÉTÉ TROUVÉ.                    ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 *
 * `11-realtime-behaviour.md` : « Highlight matched substrings in titles with a
 * terracotta-tinted `<mark>` ».
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ ON NE SURLIGNE QUE CE QUI SE VOIT — ET SÛREMENT PAS UN RADICAL.         │
 * │                                                                          │
 * │ La recherche de ce produit est une recherche PLEIN TEXTE, faite par      │
 * │ `websearch_to_tsquery('french', …)` dans `catalog_list`. Postgres y      │
 * │ compare des RADICAUX : « lions » trouve « Le Lion », « contes » trouve   │
 * │ « conte ». Aucun de ces deux appariements n'est une sous-chaîne du       │
 * │ titre, et rien de ce qui s'écrit ici ne pourra les retrouver.            │
 * │                                                                          │
 * │ La tentation serait d'écrire un désuffixeur français en TypeScript pour  │
 * │ marquer ces cas-là. Ce serait une SECONDE implémentation de la règle de  │
 * │ recherche, à côté de celle de Postgres, et elle divergerait — c'est      │
 * │ précisément ce que `CLAUDE.md` interdit, et pour la raison qu'on         │
 * │ observerait ici : c'est toujours la copie qui a l'air d'avoir raison.    │
 * │                                                                          │
 * │ Le choix est donc asymétrique, et c'est volontaire : on ne marque QUE    │
 * │ les débuts de mot littéraux. Une correspondance par radical ne reçoit    │
 * │ aucune marque. Une marque absente ne dit rien de faux — le titre est là, │
 * │ il a été trouvé, il se lit. Une marque POSÉE AU MAUVAIS ENDROIT, elle,   │
 * │ affirmerait que le serveur a apparié ce qu'il n'a pas apparié.           │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ DÉBUT DE MOT, ET PAS N'IMPORTE OÙ DANS LE MOT.                          │
 * │                                                                          │
 * │ « on » surlignerait sinon quatre fragments dans « Le Lion et le Conte    │
 * │ du Baobab » : une bouillie de rectangles orange qui ne désigne rien.     │
 * │ Le plein texte, lui, cherche des mots ; le surlignage dit la même chose  │
 * │ en ne s'accrochant qu'à leur début.                                      │
 * └──────────────────────────────────────────────────────────────────────────┘
 */

/** En-deçà, une lettre isolée éclabousserait la moitié de la page. */
const LONGUEUR_MINIMALE = 2;

/**
 * Plie un texte pour la comparaison : sans accent, en minuscules.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ UN CARACTÈRE PLIÉ POUR UN CARACTÈRE D'ORIGINE — L'INVARIANT DE TOUT.    │
 * │                                                                          │
 * │ `texte.normalize('NFD')` est la façon courante de retirer les accents,   │
 * │ et elle RALLONGE la chaîne : « é » devient deux caractères. Les index    │
 * │ de la version pliée ne désignent alors plus rien dans l'originale, et    │
 * │ le surlignage se décale d'autant de lettres accentuées qu'il en a        │
 * │ traversé — sur « Léopard », il commence une lettre trop loin.            │
 * │                                                                          │
 * │ On plie donc POINT DE CODE PAR POINT DE CODE, en gardant à côté          │
 * │ l'offset d'origine de chacun. Un pli qui rendrait deux caractères est    │
 * │ tronqué au premier : la comparaison y perd un peu de finesse, jamais     │
 * │ l'alignement.                                                            │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
function plier(texte: string): { chaine: string; offsets: number[] } {
  const plies: string[] = [];
  const offsets: number[] = [];
  let offset = 0;

  for (const point of texte) {
    const sans = point.normalize('NFD').replace(/\p{M}/gu, '');
    const pli = (sans === '' ? point : sans).toLowerCase();
    plies.push(pli.length === 1 ? pli : (pli[0] ?? point));
    offsets.push(offset);
    offset += point.length;
  }

  // La borne de fin : `offsets[n]` doit exister pour un mot qui va au bout.
  offsets.push(offset);
  return { chaine: plies.join(''), offsets };
}

/** Un caractère de mot, au sens où le plein texte l'entend. */
function estLettre(caractere: string | undefined): boolean {
  return caractere !== undefined && /[\p{L}\p{N}]/u.test(caractere);
}

/**
 * Les segments à marquer, en offsets du texte D'ORIGINE.
 *
 * Exportée pour être éprouvée seule : la fusion des chevauchements est la
 * partie qu'un rendu ne montre pas — deux marques imbriquées produisent un
 * `<mark>` dans un `<mark>`, ce qui s'affiche exactement comme une seule.
 */
export function segmentsSurlignes(
  texte: string,
  recherche: string | null | undefined,
): readonly (readonly [number, number])[] {
  if (!recherche) return [];

  const { chaine, offsets } = plier(texte);
  const mots = plier(recherche)
    .chaine.split(/[^\p{L}\p{N}]+/u)
    .filter((mot) => mot.length >= LONGUEUR_MINIMALE);

  if (mots.length === 0) return [];

  const bruts: [number, number][] = [];

  for (const mot of mots) {
    let depart = chaine.indexOf(mot);
    while (depart !== -1) {
      // Début de mot seulement : voir l'encadré du haut.
      if (!estLettre(chaine[depart - 1])) {
        bruts.push([offsets[depart] ?? 0, offsets[depart + mot.length] ?? texte.length]);
      }
      depart = chaine.indexOf(mot, depart + 1);
    }
  }

  bruts.sort((a, b) => a[0] - b[0]);

  // La fusion : « lion lionne » sur « Lionne » poserait deux marques dont
  // l'une contient l'autre.
  const fusionnes: [number, number][] = [];
  for (const [debut, fin] of bruts) {
    const dernier = fusionnes.at(-1);
    if (dernier && debut <= dernier[1]) dernier[1] = Math.max(dernier[1], fin);
    else fusionnes.push([debut, fin]);
  }

  return fusionnes;
}

/**
 * Le texte, avec ce qui a été cherché marqué dedans.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ DES NŒUDS REACT, JAMAIS DU HTML ASSEMBLÉ.                               │
 * │                                                                          │
 * │ Le chemin évident — remplacer par `<mark>…</mark>` dans une chaîne, puis │
 * │ `dangerouslySetInnerHTML` — ferait de CHAQUE TITRE DU CATALOGUE un       │
 * │ vecteur : le titre vient de la base, la requête vient de l'URL, et les   │
 * │ deux se retrouveraient interprétés comme du balisage. React échappe ce   │
 * │ qu'on lui donne en enfant ; c'est gratuit, et c'est la seule raison      │
 * │ pour laquelle cette fonction rend un tableau plutôt qu'une chaîne.       │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export function Surligne({
  texte,
  recherche,
}: {
  texte: string;
  /** La requête courante. Absente, le texte sort intact. */
  recherche?: string | null;
}): ReactNode {
  const segments = segmentsSurlignes(texte, recherche);
  if (segments.length === 0) return texte;

  const morceaux: ReactNode[] = [];
  let curseur = 0;

  for (const [debut, fin] of segments) {
    if (debut > curseur) morceaux.push(texte.slice(curseur, debut));
    morceaux.push(
      <mark key={debut} className={styles.surligne}>
        {texte.slice(debut, fin)}
      </mark>,
    );
    curseur = fin;
  }

  if (curseur < texte.length) morceaux.push(texte.slice(curseur));

  return morceaux;
}

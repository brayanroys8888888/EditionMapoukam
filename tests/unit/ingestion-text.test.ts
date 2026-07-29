import { describe, expect, it } from 'vitest';

import {
  SEUIL_LETTRINE,
  estLettrine,
  hauteurMediane,
  normaliserTexte,
  recollerLettrines,
  texteDePage,
  type MotExtrait,
} from '@/domain/ingestion/text';

/**
 * Normalisation de la couche texte.
 *
 * Module pur : il reçoit des mots déjà extraits et rend du texte propre. Ces
 * tests couvrent la règle et ses pièges ; l'épreuve sur les seize contes réels
 * est dans `tests/integration/ingestion-corpus.test.ts`.
 */
const mot = (texte: string, hauteur: number): MotExtrait => ({ texte, hauteur });

/** Reproduit la forme observée dans le corpus : lettrine à 2,96 × la médiane. */
function paragrapheAvecLettrine(lettre: string, suite: string, reste: string[]): MotExtrait[] {
  return [
    mot(lettre, 40),
    mot(suite, 13.5),
    ...reste.map((m) => mot(m, 13.5)),
  ];
}

describe('détection géométrique de la lettrine', () => {
  it('reconnaît une majuscule isolée nettement plus grande', () => {
    const mots = paragrapheAvecLettrine('I', 'l', ['y', 'a']);

    expect(estLettrine(mots[0] as MotExtrait, hauteurMediane(mots))).toBe(true);
  });

  it('ignore une majuscule isolée de taille ordinaire', () => {
    // « Y a-t-il quelque chose » est une phrase française normale. Une règle
    // lexicale la corromprait en « Ya-t-il » ; la géométrie ne s'y trompe pas.
    const mots = [mot('Y', 13.5), mot('a-t-il', 13.5), mot('quelque', 13.5)];

    expect(estLettrine(mots[0] as MotExtrait, hauteurMediane(mots))).toBe(false);
  });

  it('ignore un mot de plusieurs lettres, même très grand', () => {
    // Un titre de chapitre est grand sans être une lettrine.
    expect(estLettrine(mot('Chapitre', 40), 13.5)).toBe(false);
  });

  it('ignore une minuscule isolée', () => {
    expect(estLettrine(mot('a', 40), 13.5)).toBe(false);
  });

  it('place le seuil au milieu d’un écart sans ambiguïté', () => {
    // Mesuré sur le corpus : lettrines à 2,96 ×, autres majuscules isolées à
    // 1,30 × au plus.
    expect(SEUIL_LETTRINE).toBeGreaterThan(1.3);
    expect(SEUIL_LETTRINE).toBeLessThan(2.96);
  });
});

describe('recollage', () => {
  it('recolle une lettrine à la suite de son mot', () => {
    const recolle = recollerLettrines(paragrapheAvecLettrine('I', 'l', ['y', 'a']));

    expect(recolle.map((m) => m.texte)).toEqual(['Il', 'y', 'a']);
  });

  it('recolle un « A » non accentué', () => {
    // « A u milieu » doit devenir « Au milieu » : un « A » seul en tête de
    // phrase n'est pas un mot français, c'est un mot coupé.
    const recolle = recollerLettrines(paragrapheAvecLettrine('A', 'u', ['milieu']));

    expect(recolle.map((m) => m.texte)).toEqual(['Au', 'milieu']);
  });

  it('NE recolle PAS un « À » accentué', () => {
    // « À l’entrée du village » : la lettrine est réelle, mais le mot n'a pas
    // été coupé. Recoller donnerait « Àl’entrée ».
    const recolle = recollerLettrines(paragrapheAvecLettrine('À', 'l’entrée', ['du']));

    expect(recolle.map((m) => m.texte)).toEqual(['À', 'l’entrée', 'du']);
  });

  it('laisse intact un paragraphe sans lettrine', () => {
    const mots = [mot('Le', 13.5), mot('soir', 13.5)];

    expect(recollerLettrines(mots).map((m) => m.texte)).toEqual(['Le', 'soir']);
  });

  it('ne recolle pas une lettrine en dernière position', () => {
    // Sans mot suivant, il n'y a rien à recoller — et surtout rien à perdre.
    const recolle = recollerLettrines([mot('texte', 13.5), mot('I', 40)]);

    expect(recolle.map((m) => m.texte)).toEqual(['texte', 'I']);
  });
});

describe('normalisation', () => {
  it('décompose les ligatures typographiques', () => {
    expect(normaliserTexte('ﬁn de lʼaﬀaire')).toContain('fin');
    expect(normaliserTexte('aﬀaire')).toBe('affaire');
  });

  it('CONSERVE les ligatures qui sont des lettres françaises', () => {
    // « œufs » n'est pas une ligature de composition : décomposer en « oeufs »
    // serait une faute d'orthographe, pas une normalisation.
    expect(normaliserTexte('des œufs d’or')).toContain('œufs');
    expect(normaliserTexte('un nævus')).toContain('nævus');
  });

  it('supprime les traits d’union conditionnels', () => {
    // Invisibles à l'œil, ils cassent silencieusement la recherche.
    expect(normaliserTexte('bien­aimé')).toBe('bienaimé');
  });

  it('recolle une césure de fin de ligne', () => {
    expect(normaliserTexte('lon-\ngtemps')).toBe('longtemps');
  });

  it('ramène les espaces insécables à une espace ordinaire', () => {
    expect(normaliserTexte('mille ans')).toBe('mille ans');
    expect(normaliserTexte('deux mille')).toBe('deux mille');
  });

  it('uniformise l’apostrophe', () => {
    // Pour que la recherche ne dépende pas de la manière dont l'utilisateur
    // tape son apostrophe.
    expect(normaliserTexte("l'araignée")).toBe('l’araignée');
  });

  it('réduit les blancs multiples sans écraser les paragraphes', () => {
    expect(normaliserTexte('un   mot\n\n\n\nautre')).toBe('un mot\n\nautre');
  });
});

describe('assemblage d’une page', () => {
  it('recolle puis normalise, dans cet ordre', () => {
    // L'ordre compte : le recollage a besoin des hauteurs, que l'assemblage
    // jette.
    const page = texteDePage(paragrapheAvecLettrine('I', 'l', ['y', 'a', "très", 'longtemps']));

    expect(page).toBe('Il y a très longtemps');
  });

  it('rend une chaîne vide pour une page sans texte', () => {
    // Un PDF scanné produit des pages muettes : ce n'est pas une erreur, c'est
    // un constat que l'analyse remonte par ailleurs (§7.4.4).
    expect(texteDePage([])).toBe('');
  });
});

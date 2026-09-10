import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';

import { Surligne, segmentsSurlignes } from '@/components/catalogue/surlignage';

/**
 * LE SURLIGNAGE DE RECHERCHE — lot 12, `11-realtime-behaviour.md`.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ DEUX RISQUES, ET AUCUN DES DEUX N'EST L'APPARENCE.                       │
 * │                                                                          │
 * │ 1. L'ALIGNEMENT. Le texte est plié — sans accent, en minuscules — pour   │
 * │    la comparaison, puis découpé selon des index calculés SUR LE PLI.     │
 * │    Toute méthode de dépliage qui change la longueur décale le            │
 * │    surlignage d'une lettre par accent traversé, et le défaut ne se voit  │
 * │    que sur les titres accentués — c'est-à-dire pas sur ceux qu'on essaie │
 * │    d'abord.                                                              │
 * │                                                                          │
 * │ 2. L'ÉCHAPPEMENT. Le titre vient de la base, la requête vient de l'URL.  │
 * │    Assemblés en HTML, ils feraient de chaque carte du catalogue un       │
 * │    vecteur d'injection.                                                  │
 * └──────────────────────────────────────────────────────────────────────────┘
 */

/** Le texte des marques, dans l'ordre. */
function marques(): string[] {
  return [...document.querySelectorAll('mark')].map((noeud) => noeud.textContent ?? '');
}

describe('ce qui est marqué, et ce qui ne l’est pas', () => {
  it('le mot cherché est marqué dans le titre', () => {
    render(<Surligne texte="Le Lion et le Baobab" recherche="lion" />);
    expect(marques()).toEqual(['Lion']);
  });

  it('la casse n’entre pas en ligne de compte', () => {
    render(<Surligne texte="Le Lion et le Baobab" recherche="LION" />);
    expect(marques()).toEqual(['Lion']);
  });

  it('chaque mot de la requête cherche pour son compte', () => {
    render(<Surligne texte="Le Lion et le Baobab" recherche="baobab lion" />);
    expect(marques()).toEqual(['Lion', 'Baobab']);
  });

  it('sans recherche, le texte sort intact et sans marque', () => {
    render(
      <p data-testid="cible">
        <Surligne texte="Le Lion et le Baobab" />
      </p>,
    );
    expect(screen.getByTestId('cible').textContent).toBe('Le Lion et le Baobab');
    expect(marques()).toEqual([]);
  });

  /**
   * ┌──────────────────────────────────────────────────────────────────────┐
   * │ LE MILIEU D'UN MOT N'EST PAS UNE CORRESPONDANCE.                     │
   * │                                                                      │
   * │ « on » se trouve dans « Lion », dans « Conte », dans « Bonjour ». Un  │
   * │ surlignage de sous-chaîne libre rendrait un titre criblé de           │
   * │ rectangles orange qui ne désignent rien — et la recherche du produit  │
   * │ est une recherche par MOTS, pas par fragments.                        │
   * └──────────────────────────────────────────────────────────────────────┘
   */
  it('un fragment au milieu d’un mot n’est pas marqué', () => {
    render(<Surligne texte="Le Lion et le Conte" recherche="on" />);
    expect(marques()).toEqual([]);
  });

  it('mais un début de mot l’est, même incomplet', () => {
    render(<Surligne texte="Le Lion et le Baobab" recherche="baob" />);
    expect(marques()).toEqual(['Baob']);
  });

  it('une lettre seule ne marque rien', () => {
    render(<Surligne texte="Le Lion et le Baobab" recherche="l" />);
    expect(marques()).toEqual([]);
  });

  /**
   * Le radical est HORS de portée, et c'est assumé : « lions » est apparié
   * par `websearch_to_tsquery('french', …)` en base, jamais ici. Ce test fixe
   * la limite plutôt que de la laisser se découvrir — le jour où quelqu'un
   * voudra écrire un désuffixeur en TypeScript, il tombera d'abord sur
   * l'encadré de `surlignage.tsx` qui dit pourquoi il ne faut pas.
   */
  it('une correspondance par radical ne reçoit AUCUNE marque — jamais une fausse', () => {
    render(<Surligne texte="Le Lion et le Baobab" recherche="lions" />);
    expect(marques()).toEqual([]);
  });
});

describe('les accents ne décalent pas la marque', () => {
  /**
   * Le test qui aurait attrapé le défaut évident : `normalize('NFD')` rallonge
   * la chaîne d'un caractère par accent. Sur « Léopard », le surlignage
   * commencerait une lettre trop loin — « éopard » au lieu de « Léopard ».
   */
  it('la requête sans accent trouve le titre accentué, au bon endroit', () => {
    render(<Surligne texte="Le Leopard rusé" recherche="leopard" />);
    expect(marques()).toEqual(['Leopard']);
  });

  it('et l’inverse aussi', () => {
    render(<Surligne texte="La Légende du Léopard" recherche="legende" />);
    expect(marques()).toEqual(['Légende']);
  });

  it('un accent AVANT la marque ne la décale pas', () => {
    render(<Surligne texte="Éléphant et Baobab" recherche="baobab" />);
    expect(marques()).toEqual(['Baobab']);
  });

  it('le texte affiché reste celui d’origine, accents compris', () => {
    render(
      <p data-testid="cible">
        <Surligne texte="La Légende du Léopard" recherche="legende leopard" />
      </p>,
    );
    expect(screen.getByTestId('cible').textContent).toBe('La Légende du Léopard');
  });
});

describe('les segments, vus seuls', () => {
  it('deux mots qui se recouvrent ne font qu’une marque', () => {
    // « lion » et « lionne » commencent au même endroit : sans fusion, la
    // seconde marque serait imbriquée dans la première.
    expect(segmentsSurlignes('La Lionne', 'lion lionne')).toEqual([[3, 9]]);
  });

  it('une requête vide ne produit rien', () => {
    expect(segmentsSurlignes('La Lionne', '')).toEqual([]);
    expect(segmentsSurlignes('La Lionne', null)).toEqual([]);
    expect(segmentsSurlignes('La Lionne', '   ')).toEqual([]);
  });

  it('les segments sont ordonnés, quel que soit l’ordre des mots', () => {
    const segments = segmentsSurlignes('Le Lion et le Baobab', 'baobab lion');
    expect(segments.map(([debut]) => debut)).toEqual([3, 14]);
  });
});

describe('le titre et la requête ne sont jamais interprétés', () => {
  /**
   * ┌──────────────────────────────────────────────────────────────────────┐
   * │ LE CONTRE-TEST QUI COMPTE.                                            │
   * │                                                                      │
   * │ Le chemin évident pour surligner est de remplacer dans une chaîne,   │
   * │ puis `dangerouslySetInnerHTML`. Il marcherait parfaitement — et il   │
   * │ ferait de chaque titre du catalogue un vecteur d'injection, la       │
   * │ requête venant de l'URL et le titre de la base.                      │
   * └──────────────────────────────────────────────────────────────────────┘
   */
  it('un titre qui contient du balisage sort en TEXTE', () => {
    render(
      <p data-testid="cible">
        <Surligne texte={'<img src=x onerror="1"> Lion'} recherche="lion" />
      </p>,
    );

    const cible = screen.getByTestId('cible');
    expect(cible.querySelector('img'), 'aucune balise ne doit avoir été créée').toBeNull();
    expect(cible.textContent).toBe('<img src=x onerror="1"> Lion');
    expect(marques()).toEqual(['Lion']);
  });

  it('une requête qui contient du balisage ne crée rien non plus', () => {
    render(
      <p data-testid="cible">
        <Surligne texte="Le Lion" recherche={'<script>alert(1)</script>'} />
      </p>,
    );
    expect(screen.getByTestId('cible').querySelector('script')).toBeNull();
  });
});

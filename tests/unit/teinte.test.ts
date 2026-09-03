import { describe, expect, it } from 'vitest';

import { PALETTES, teinteDepuisThemes, teinteDuTheme } from '@/components/motif/teinte';

/**
 * LA TEINTE D'UN TITRE — `src/components/motif/teinte.ts`.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ CE QUI EST ÉPROUVÉ ICI EST UNE PROMESSE DE STABILITÉ, PAS UN GOÛT.       │
 * │                                                                          │
 * │ Aucun de ces tests ne dit qu'un thème « devrait » être sahélien : la     │
 * │ palette d'un thème est arbitraire, et c'est assumé dans le fichier même. │
 * │ Ce qu'ils exigent est qu'elle NE BOUGE PLUS. Un catalogue dont les       │
 * │ couleurs changent au déploiement suivant, sans qu'une seule donnée ait   │
 * │ bougé, a tout l'air d'un défaut d'affichage.                             │
 * │                                                                          │
 * │ D'où les correspondances écrites en toutes lettres plus bas : elles ne   │
 * │ valident pas le hachage, elles le CLOUENT. Le jour où quelqu'un          │
 * │ remplacera FNV-1a par autre chose de « mieux », ces lignes tomberont, et │
 * │ c'est exactement ce qu'on leur demande.                                  │
 * └──────────────────────────────────────────────────────────────────────────┘
 */

describe('la teinte est stable', () => {
  /*
   * Les cinq emplacements sont représentés : si le modulo tombait toujours
   * sur les mêmes trois, le catalogue serait bicolore sans que rien ne le
   * signale.
   */
  const ANCRAGES: readonly [string, string][] = [
    ['patience', 'afrique_ouest'],
    ['amitié', 'sahel'],
    ['nature', 'afrique_centrale'],
    ['courage', 'afrique_australe'],
    ['famille', 'afrique_est'],
  ];

  it.each(ANCRAGES)('« %s » rend toujours %s', (theme, palette) => {
    expect(teinteDepuisThemes([theme])).toBe(palette);
  });

  it('couvre les cinq emplacements de palette', () => {
    const rendues = new Set(ANCRAGES.map(([, palette]) => palette));
    expect(rendues.size).toBe(PALETTES.length);
  });

  it('rend la même palette à chaque appel', () => {
    const premier = teinteDepuisThemes(['sagesse']);
    for (let i = 0; i < 50; i += 1) {
      expect(teinteDepuisThemes(['sagesse'])).toBe(premier);
    }
  });

  it('ne rend jamais autre chose qu’un emplacement connu', () => {
    for (const theme of ['ruse', 'eau', 'école', '语言', '???', 'a'.repeat(300)]) {
      expect(PALETTES).toContain(teinteDepuisThemes([theme]));
    }
  });
});

describe('la casse et les accents sont des variantes du même mot', () => {
  it.each([
    ['Courage', 'courage'],
    ['COURAGE', 'courage'],
    ['  courage  ', 'courage'],
    ['Amitié', 'amitie'],
    ['AMITIÉ', 'amitie'],
  ])('« %s » tombe sur la palette de « %s »', (ecrit, nu) => {
    expect(teinteDepuisThemes([ecrit])).toBe(teinteDepuisThemes([nu]));
  });

  it('neutralise aussi un accent composé autrement', () => {
    // « é » écrit en un seul point de code, puis en « e » suivi d'un accent
    // combinant : deux chaînes différentes pour le même mot à l'écran.
    expect(teinteDepuisThemes(['amitié'])).toBe(teinteDepuisThemes(['amitié']));
  });
});

describe('un titre sans thème n’a pas de teinte', () => {
  it.each([
    ['null', null],
    ['undefined', undefined],
    ['une liste vide', []],
    ['des chaînes vides', ['', '']],
    ['des espaces seuls', ['   ', '\t']],
  ])('%s rend null', (_cas, themes) => {
    /*
     * `null` et non une palette tirée au sort : une couleur inventée
     * laisserait croire à un rangement qui n'existe pas. Le titre prend la
     * teinte neutre `inconnue` chez l'appelant.
     */
    expect(teinteDepuisThemes(themes as readonly string[] | null | undefined)).toBeNull();
  });
});

describe('c’est le PREMIER thème qui décide', () => {
  it('ignore les thèmes suivants', () => {
    const seul = teinteDepuisThemes(['courage']);
    expect(teinteDepuisThemes(['courage', 'amitié', 'famille'])).toBe(seul);
  });

  it('ne change pas de teinte quand l’éditeur ajoute un thème', () => {
    // Le cas réel : une fiche déjà en ligne à laquelle on ajoute un mot-clé.
    // La couverture ne doit pas changer de couleur pour autant.
    const avant = teinteDepuisThemes(['nature']);
    const apres = teinteDepuisThemes(['nature', 'eau', 'forêt']);
    expect(apres).toBe(avant);
  });

  it('saute les entrées vides pour trouver le premier vrai thème', () => {
    expect(teinteDepuisThemes(['', '  ', 'famille'])).toBe(teinteDepuisThemes(['famille']));
  });

  it('deux titres qui partagent leur premier thème partagent leur teinte', () => {
    expect(teinteDepuisThemes(['sagesse', 'ruse'])).toBe(teinteDepuisThemes(['sagesse', 'voyage']));
  });
});

describe('teinteDuTheme', () => {
  it('rend la même chose que la liste à un seul élément', () => {
    for (const theme of ['courage', 'amitié', 'nature', 'patience', 'famille']) {
      expect(teinteDuTheme(theme)).toBe(teinteDepuisThemes([theme]));
    }
  });

  it('rend null sur un thème vide', () => {
    expect(teinteDuTheme('   ')).toBeNull();
  });
});

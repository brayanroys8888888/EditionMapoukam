import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  REALISATIONS,
  VIDEO_PRESENTATION,
  lirePresentationConsulting,
} from '@/content/consulting';

/**
 * EXPERTISE & CONSEIL — ce que le compilateur ne peut pas dire.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ TROIS DÉFAUTS QUI COMPILENT, ET QU'ON NE VOIT QU'EN REGARDANT LA PAGE.  │
 * │                                                                          │
 * │ • un fichier de réalisation renommé ou oublié dans `public/` : le type   │
 * │   ne connaît que la CHAÎNE, pas le disque. La page rend alors onze       │
 * │   cadres dont un est vide, et rien ne proteste ;                         │
 * │ • une prestation ajoutée en français et pas en anglais : le type impose  │
 * │   les deux LANGUES, jamais le même NOMBRE de prestations dans chacune ;  │
 * │ • un tarif recopié dans un composant ou une traduction : il vivrait      │
 * │   alors à deux endroits, et c'est toujours la copie qui a l'air d'avoir  │
 * │   raison. `src/content/consulting.ts` dit longuement pourquoi ces        │
 * │   montants sont du texte éditorial ; ce test est ce qui l'applique.      │
 * └──────────────────────────────────────────────────────────────────────────┘
 */

const RACINE = process.cwd();
const VISUELS = join(RACINE, 'public', 'images', 'expertise');

const FR = lirePresentationConsulting('fr');
const EN = lirePresentationConsulting('en');

describe('la présentation de Mapoukam Consulting', () => {
  it('annonce les mêmes prestations dans les deux langues', () => {
    expect(EN.prestations.map((p) => p.cle)).toEqual(FR.prestations.map((p) => p.cle));
  });

  it('n’a ni titre, ni tarif, ni gain vide', () => {
    for (const presentation of [FR, EN]) {
      for (const prestation of presentation.prestations) {
        expect(prestation.titre.trim(), prestation.cle).not.toBe('');
        expect(prestation.tarif.trim(), prestation.cle).not.toBe('');
        expect(prestation.pourquoi.trim(), prestation.cle).not.toBe('');
        expect(prestation.gains.length, prestation.cle).toBeGreaterThan(0);
        for (const gain of prestation.gains) expect(gain.trim()).not.toBe('');
      }
    }
  });

  it('légende chaque réalisation dans les deux langues', () => {
    for (const realisation of REALISATIONS) {
      expect(FR.legendes[realisation.cle]?.trim(), realisation.cle).not.toBe('');
      expect(EN.legendes[realisation.cle]?.trim(), realisation.cle).not.toBe('');
    }
  });

  it('n’est pas l’anglais recopié sur le français', () => {
    // Le même contrôle que `i18n.test.ts` fait sur les dictionnaires : une
    // traduction oubliée laisse un texte français sur le site anglais, et
    // c'est indétectable au typage puisque les deux champs sont des chaînes.
    expect(EN.chapeau).not.toBe(FR.chapeau);
    expect(EN.appel.action).not.toBe(FR.appel.action);
  });
});

describe('les visuels des réalisations', () => {
  it('existent tous sur le disque', () => {
    for (const realisation of REALISATIONS) {
      expect(existsSync(join(VISUELS, realisation.fichier)), realisation.fichier).toBe(true);
    }
  });

  it('n’ont ni doublon de clé ni doublon de fichier', () => {
    const cles = REALISATIONS.map((r) => r.cle);
    const fichiers = REALISATIONS.map((r) => r.fichier);
    expect(new Set(cles).size).toBe(cles.length);
    expect(new Set(fichiers).size).toBe(fichiers.length);
  });

  it('déclarent des dimensions réelles, pour réserver leur place', () => {
    // Sans `width`/`height`, la page saute à chaque image qui arrive. Un zéro
    // recopié par distraction rendrait la précaution inopérante en silence.
    for (const realisation of REALISATIONS) {
      expect(realisation.largeur, realisation.cle).toBeGreaterThan(0);
      expect(realisation.hauteur, realisation.cle).toBeGreaterThan(0);
    }
  });

  it('servent aussi d’affiche à la vidéo, qui existe elle aussi', () => {
    expect(existsSync(join(VISUELS, VIDEO_PRESENTATION.fichier))).toBe(true);
    expect(existsSync(join(VISUELS, VIDEO_PRESENTATION.affiche))).toBe(true);

    // L'affiche est l'une des onze : elle est déjà chargée par la grille, et
    // ne coûte donc rien de plus au visiteur.
    expect(REALISATIONS.map((r) => r.fichier)).toContain(VIDEO_PRESENTATION.affiche);
  });
});

describe('les tarifs de consulting', () => {
  /**
   * Les fichiers où un tarif de consulting n'a rien à faire.
   *
   * On ne balaie pas `src/` en entier, et on ne cherche pas non plus « FCFA » :
   * les dictionnaires portent déjà cette monnaie, dans les textes d'aide du
   * back-office qui expliquent comment SAISIR un montant. Un test qui les
   * attraperait serait un test qu'on finirait par désarmer.
   *
   * Ce qu'on cherche, c'est le tarif LUI-MÊME recopié — « À partir de
   * 75 000 FCFA » dans un composant ou une traduction. C'est la seule copie
   * qui pourrait diverger de celle que la page affiche.
   */
  const AILLEURS = [
    join('src', 'app', '[langue]', 'expertise', 'page.tsx'),
    join('src', 'components', 'v2', 'expertise.module.css'),
    join('src', 'i18n', 'fr.json'),
    join('src', 'i18n', 'en.json'),
  ];

  it('ne sont écrits que dans `src/content/consulting.ts`', () => {
    const tarifs = [...FR.prestations, ...EN.prestations].flatMap((prestation) =>
      prestation.tarifPrecision
        ? [prestation.tarif, prestation.tarifPrecision]
        : [prestation.tarif],
    );

    for (const fichier of AILLEURS) {
      const source = readFileSync(join(RACINE, fichier), 'utf8');
      for (const tarif of tarifs) {
        expect(source.includes(tarif), `« ${tarif} » est recopié dans ${fichier}`).toBe(false);
      }
    }
  });
});

describe('l’écran d’expertise', () => {
  it('est joignable depuis les deux thèmes et depuis le menu étroit', () => {
    // Même raison que `navigation-rayons.test.ts` : le thème et la largeur de
    // la fenêtre ne changent que l'apparence, jamais ce que le site contient.
    const joint = (fichier: string) =>
      readFileSync(join(RACINE, fichier), 'utf8').includes('expertise');

    expect(joint(join('src', 'components', 'enveloppe', 'v2.tsx')), 'en-tête V2').toBe(true);
    expect(joint(join('src', 'components', 'enveloppe', 'index.tsx')), 'pied V1').toBe(true);
    expect(joint(join('src', 'components', 'v2', 'menu-mobile.tsx')), 'menu étroit').toBe(true);
  });

  it('est annoncé par le plan de site', () => {
    const plan = readFileSync(join(RACINE, 'src', 'app', 'sitemap.ts'), 'utf8');
    expect(plan).toContain("'/expertise'");
  });

  it('a bien un écran sous `[langue]`', () => {
    expect(existsSync(join(RACINE, 'src', 'app', '[langue]', 'expertise', 'page.tsx'))).toBe(true);
  });
});

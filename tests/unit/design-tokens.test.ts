import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { fichiersSources } from '../helpers/sources';

/**
 * JETONS DE DESIGN — source unique, et contrastes CALCULÉS.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ UN CONTRASTE NE SE JUGE PAS À L'ŒIL.                                    │
 * │                                                                          │
 * │ §5.3 vise WCAG 2.1 AA. Le seuil est un NOMBRE — 4,5:1 pour le texte      │
 * │ courant, 3:1 pour le grand texte — et un écran d'ordinateur bien réglé   │
 * │ dans un bureau bien éclairé fait passer pour lisible ce qui ne l'est pas │
 * │ sur un téléphone au soleil.                                             │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
const RACINE = process.cwd();
const JETONS = join(RACINE, 'src', 'design', 'tokens.css');

const source = readFileSync(JETONS, 'utf8');

/** Valeurs `--nom: #xxxxxx` du fichier de jetons. */
function jetons(): Map<string, string> {
  const table = new Map<string, string>();
  for (const trouve of source.matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{3,8})\s*;/g)) {
    if (trouve[1] && trouve[2]) table.set(trouve[1], trouve[2].toLowerCase());
  }
  return table;
}

const TABLE = jetons();

/** Luminance relative, WCAG 2.1. */
function luminance(hex: string): number {
  const valeur = hex.replace('#', '');
  const complet =
    valeur.length === 3
      ? valeur
          .split('')
          .map((c) => c + c)
          .join('')
      : valeur;

  const canaux = [0, 2, 4].map((decalage) => {
    const brut = Number.parseInt(complet.slice(decalage, decalage + 2), 16) / 255;
    return brut <= 0.03928 ? brut / 12.92 : ((brut + 0.055) / 1.055) ** 2.4;
  });

  return 0.2126 * (canaux[0] ?? 0) + 0.7152 * (canaux[1] ?? 0) + 0.0722 * (canaux[2] ?? 0);
}

function contraste(a: string, b: string): number {
  const [clair, sombre] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return ((clair ?? 0) + 0.05) / ((sombre ?? 0) + 0.05);
}

function jeton(nom: string): string {
  const valeur = TABLE.get(nom);
  if (!valeur) throw new Error(`Jeton absent : --${nom}`);
  return valeur;
}

describe('le fichier de jetons est bien lu', () => {
  it('porte les jetons attendus', () => {
    // Garde d'effectif : une extraction ratée rendrait une table vide, et
    // toutes les assertions de contraste ci-dessous passeraient sur rien.
    expect(TABLE.size).toBeGreaterThanOrEqual(30);
    expect(TABLE.get('fond')).toBe('#fffdf9');
    expect(TABLE.get('action')).toBe('#f2b134');
  });
});

describe('contrastes — WCAG 2.1 AA', () => {
  const PAIRES: readonly [string, string, string, number][] = [
    ['texte courant', 'encre', 'fond', 4.5],
    ['texte secondaire', 'encre-douce', 'fond', 4.5],
    ['texte sur fond doux', 'encre', 'fond-doux', 4.5],
    ['texte du lecteur', 'encre', 'fond-lecture', 4.5],
    ['lien au survol', 'lien-survol', 'fond', 4.5],
    ['texte sur crème', 'encre', 'creme', 4.5],
    ['accent crème', 'creme-accent', 'creme', 4.5],
    ['texte sur le jaune d’action', 'encre', 'action', 4.5],
    ['texte sur le jaune survolé', 'encre', 'action-survol', 4.5],
  ];

  it('couvre les paires réellement employées', () => {
    expect(PAIRES.length).toBeGreaterThanOrEqual(9);
  });

  for (const [nom, avant, arriere, seuil] of PAIRES) {
    it(`${nom} : au moins ${String(seuil)}:1`, () => {
      const mesure = contraste(jeton(avant), jeton(arriere));
      expect(mesure, `--${avant} sur --${arriere} = ${mesure.toFixed(2)}:1`).toBeGreaterThanOrEqual(
        seuil,
      );
    });
  }

  it('les cinq régions restent lisibles sur leur propre fond', () => {
    const regions = ['afrique_ouest', 'sahel', 'afrique_centrale', 'afrique_australe', 'afrique_est'];
    expect(regions.length).toBe(5);

    for (const region of regions) {
      const mesure = contraste(jeton(`region-${region}-encre`), jeton(`region-${region}-fond`));
      expect(mesure, `${region} : ${mesure.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('DÉTECTE une paire insuffisante — le contre-test', () => {
    // ┌────────────────────────────────────────────────────────────────────┐
    // │ SANS CETTE ASSERTION, UN CALCUL FAUX QUI RENDRAIT TOUJOURS 21      │
    // │ FERAIT PASSER TOUTES LES PAIRES CI-DESSUS.                         │
    // │                                                                    │
    // │ Le blanc sur le jaune d'action est le cas réel que la maquette      │
    // │ évite délibérément : ~1,9:1, illisible. Le calcul doit le voir.     │
    // └────────────────────────────────────────────────────────────────────┘
    const blancSurJaune = contraste('#ffffff', jeton('action'));
    expect(blancSurJaune).toBeLessThan(3);

    // Et il doit distinguer : la bonne combinaison, elle, passe largement.
    expect(contraste(jeton('encre'), jeton('action'))).toBeGreaterThan(8);
  });
});

describe('aucune seconde source de vérité visuelle', () => {
  it('aucune couleur littérale hors du fichier de jetons', () => {
    // ┌────────────────────────────────────────────────────────────────────┐
    // │ LES MAQUETTES N'ONT AUCUNE VARIABLE : toutes leurs valeurs sont     │
    // │ écrites en dur et répétées d'un fichier à l'autre. Reconstruire     │
    // │ ainsi reproduirait le défaut qu'on vient de corriger — et la        │
    // │ première correction pressée créerait une divergence.                │
    // │                                                                    │
    // │ Le rotor et le squelette, eux, n'emploient que des jetons : c'est   │
    // │ vérifiable en lisant `etats.module.css`, et c'est ce test qui le    │
    // │ tient dans la durée.                                               │
    // └────────────────────────────────────────────────────────────────────┘
    const coupables: string[] = [];

    for (const fichier of fichiersSources(join(RACINE, 'src'), /\.(tsx|css)$/)) {
      if (fichier === JETONS) continue;
      // ┌──────────────────────────────────────────────────────────────────┐
      // │ EXCLUSION UNIQUE, ET ÉCRITE : la console de simulation.          │
      // │                                                                  │
      // │ `/dev` n'est pas l'interface du produit. CLAUDE.md la veut       │
      // │ « très rudimentaire », elle est fermée en production, et aucun   │
      // │ utilisateur ne la voit. Lui imposer la charte coûterait sans     │
      // │ rien protéger.                                                   │
      // │                                                                  │
      // │ L'exclusion est nommée plutôt que large : `src/app/dev`, et rien │
      // │ d'autre. Une exclusion par motif finirait par couvrir un écran   │
      // │ réel.                                                            │
      // └──────────────────────────────────────────────────────────────────┘
      if (fichier.replace(/\\/g, '/').includes('/src/app/dev/')) continue;
      const contenu = readFileSync(fichier, 'utf8');

      for (const trouve of contenu.matchAll(/#[0-9a-fA-F]{3,8}\b/g)) {
        const ligne = contenu.slice(0, trouve.index).split('\n').length;
        coupables.push(`${fichier.replace(RACINE, '')}:${String(ligne)} → ${trouve[0]}`);
      }
    }

    expect(coupables).toEqual([]);
  });

  it('parcourt réellement des fichiers — sinon ce test ne prouverait rien', () => {
    // `fichiersSources` LÈVE sur un parcours vide ; cette assertion garde le
    // filtre d'extension, qui pourrait rendre une liste vide sans lever.
    const trouves = fichiersSources(join(RACINE, 'src'), /\.(tsx|css)$/);
    expect(trouves.length).toBeGreaterThanOrEqual(3);
  });
});

describe('accessibilité inscrite dans les jetons', () => {
  it('le focus vaut 3 px partout — y compris pour l’administration', () => {
    // La maquette d'administration descendait à 2 px. L'accessibilité ne se
    // négocie pas contre une maquette (docs/maquettes/JETONS.md, écart É3).
    expect(source).toMatch(/--focus-epaisseur:\s*3px/);
    expect(source).toMatch(/--focus-decalage:\s*3px/);
  });

  it('la cible tactile minimale est déclarée', () => {
    // Le lecteur doit s'utiliser à une main, sur tablette, par un enfant de
    // six ans.
    expect(source).toMatch(/--cible-min:\s*44px/);
  });

  it('le mouvement tombe sous `prefers-reduced-motion`', () => {
    expect(source).toMatch(/@media \(prefers-reduced-motion: reduce\)/);
    expect(source).toMatch(/animation-duration:\s*0\.01ms\s*!important/);
  });

  it('les polices sont EMBARQUÉES, jamais chargées depuis un CDN', () => {
    // ┌────────────────────────────────────────────────────────────────────┐
    // │ Les treize maquettes appellent `fonts.googleapis.com`. C'est un     │
    // │ service externe, et surtout une feuille bloquante sur la connexion  │
    // │ lente que §5.1 décrit comme la condition réelle d'une partie du     │
    // │ public — ce que Lighthouse sanctionne, et 85 est un critère de F14. │
    // └────────────────────────────────────────────────────────────────────┘
    const coupables: string[] = [];
    for (const fichier of fichiersSources(join(RACINE, 'src'), /\.(tsx|ts|css)$/)) {
      const contenu = readFileSync(fichier, 'utf8');
      if (/fonts\.googleapis\.com|fonts\.gstatic\.com/.test(contenu)) {
        coupables.push(fichier.replace(RACINE, ''));
      }
    }
    expect(coupables).toEqual([]);
  });
});

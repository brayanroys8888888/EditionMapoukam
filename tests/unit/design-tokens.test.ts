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

  /**
   * ┌──────────────────────────────────────────────────────────────────────┐
   * │ LA V2 EST MESURÉE COMME LA V1, ET SUR SES PROPRES NOMS.              │
   * │                                                                      │
   * │ Le bloc `[data-design='v2']` des jetons ne fait que RÉAFFECTER les    │
   * │ noms sémantiques à des valeurs `--v2-*`, par `var()`. Les assertions  │
   * │ ci-dessus lisent donc les hexadécimaux de la V1 et ne prouvent rien   │
   * │ sur la V2 : c'est exactement le genre d'angle mort qui laisse une     │
   * │ direction entière passer sous le seuil sans qu'un test rougisse.      │
   * │                                                                      │
   * │ Deux paires portent tout le risque de cette palette :                 │
   * │                                                                      │
   * │   * l'ocre est une SURFACE — sur la crème il vaut 2,90:1, donc il ne  │
   * │     doit jamais porter de texte. `--v2-ocre-encre` existe pour ça ;   │
   * │   * sur l'ocre, le texte est l'ENCRE et jamais du blanc, qui tombe    │
   * │     à 3,10:1. C'est la même inversion que le jaune de la V1.          │
   * └──────────────────────────────────────────────────────────────────────┘
   */
  const PAIRES_V2: readonly [string, string, string, number][] = [
    ['V2 — texte courant', 'v2-encre', 'v2-fond', 4.5],
    ['V2 — texte secondaire', 'v2-encre-douce', 'v2-fond', 4.5],
    ['V2 — texte sur fond doux', 'v2-encre', 'v2-fond-doux', 4.5],
    ['V2 — texte secondaire sur fond doux', 'v2-encre-douce', 'v2-fond-doux', 4.5],
    ['V2 — le vert en texte', 'v2-vert', 'v2-fond', 4.5],
    ['V2 — texte sur l’ocre d’action', 'v2-encre', 'v2-ocre', 4.5],
    ['V2 — texte sur l’ocre survolé', 'v2-encre', 'v2-ocre-survol', 4.5],
    ['V2 — l’ocre EN TEXTE, assombri', 'v2-ocre-encre', 'v2-fond', 4.5],
    ['V2 — crème sur le vert de l’en-tête', 'v2-fond', 'v2-vert', 4.5],
    ['V2 — crème sur le vert du pied', 'v2-fond', 'v2-vert-nuit', 4.5],
    ['V2 — crème sur le vert clair', 'v2-fond', 'v2-vert-clair', 4.5],
  ];

  it('couvre les paires V2 réellement employées', () => {
    expect(PAIRES_V2.length).toBeGreaterThanOrEqual(11);
  });

  for (const [nom, avant, arriere, seuil] of PAIRES_V2) {
    it(`${nom} : au moins ${String(seuil)}:1`, () => {
      const mesure = contraste(jeton(avant), jeton(arriere));
      expect(mesure, `--${avant} sur --${arriere} = ${mesure.toFixed(2)}:1`).toBeGreaterThanOrEqual(
        seuil,
      );
    });
  }

  /**
   * ┌──────────────────────────────────────────────────────────────────────┐
   * │ LA V3 EST MESURÉE DEUX FOIS — UNE PAR THÈME.                         │
   * │                                                                      │
   * │ C'est la première direction du dépôt à porter un thème sombre, et    │
   * │ c'est un doublement du risque, pas un ajout cosmétique : une palette │
   * │ retournée n'hérite RIEN des contrastes de celle dont elle vient.     │
   * │ Un thème sombre validé à l'œil sur un écran de bureau est exactement │
   * │ le genre de chose qui passe six mois sans que personne ne remarque   │
   * │ que les libellés secondaires y sont illisibles.                      │
   * │                                                                      │
   * │ Les deux palettes portent donc des NOMS distincts dans le fichier de │
   * │ jetons — `--v3-*` et `--v3-nuit-*` — précisément pour que ce test    │
   * │ puisse lire les deux. Une palette sombre écrite uniquement dans un   │
   * │ `@media` serait invisible ici.                                       │
   * └──────────────────────────────────────────────────────────────────────┘
   */
  const PAIRES_V3: readonly [string, string, string, number][] = [
    ['V3 clair — texte courant', 'v3-encre', 'v3-fond', 4.5],
    ['V3 clair — texte secondaire', 'v3-encre-douce', 'v3-fond', 4.5],
    ['V3 clair — texte sur fond doux', 'v3-encre', 'v3-fond-2', 4.5],
    ['V3 clair — texte secondaire sur fond doux', 'v3-encre-douce', 'v3-fond-2', 4.5],
    ['V3 clair — texte sur la carte', 'v3-encre', 'v3-carte', 4.5],
    ['V3 clair — la terre cuite EN TEXTE', 'v3-terre-encre', 'v3-fond', 4.5],
    ['V3 clair — la terre cuite en texte sur la carte', 'v3-terre-encre', 'v3-carte', 4.5],
    ['V3 clair — la sauge EN TEXTE', 'v3-sauge-encre', 'v3-fond', 4.5],
    ['V3 clair — la sauge en texte sur fond doux', 'v3-sauge-encre', 'v3-fond-2', 4.5],
    ['V3 clair — texte sur la terre cuite d’action', 'v3-encre', 'v3-terre', 4.5],
    ['V3 clair — texte sur la terre cuite survolée', 'v3-encre', 'v3-terre-survol', 4.5],
    ['V3 clair — crème sur l’olive profond', 'v3-sur-profond', 'v3-profond', 4.5],
    ['V3 clair — crème sur le second olive', 'v3-sur-profond', 'v3-profond-2', 4.5],

    ['V3 sombre — texte courant', 'v3-nuit-encre', 'v3-nuit-fond', 4.5],
    ['V3 sombre — texte secondaire', 'v3-nuit-encre-douce', 'v3-nuit-fond', 4.5],
    ['V3 sombre — texte sur fond doux', 'v3-nuit-encre', 'v3-nuit-fond-2', 4.5],
    ['V3 sombre — texte secondaire sur fond doux', 'v3-nuit-encre-douce', 'v3-nuit-fond-2', 4.5],
    ['V3 sombre — texte sur la carte', 'v3-nuit-encre', 'v3-nuit-carte', 4.5],
    ['V3 sombre — texte secondaire sur la carte', 'v3-nuit-encre-douce', 'v3-nuit-carte', 4.5],
    ['V3 sombre — la terre cuite EN TEXTE', 'v3-nuit-terre-encre', 'v3-nuit-fond', 4.5],
    ['V3 sombre — la terre cuite en texte sur la carte', 'v3-nuit-terre-encre', 'v3-nuit-carte', 4.5],
    ['V3 sombre — la sauge EN TEXTE', 'v3-nuit-sauge', 'v3-nuit-fond', 4.5],
    ['V3 sombre — la sauge en texte sur la carte', 'v3-nuit-sauge', 'v3-nuit-carte', 4.5],
    ['V3 sombre — texte sur la terre cuite d’action', 'v3-nuit-fond', 'v3-nuit-terre', 4.5],
    ['V3 sombre — texte sur la terre cuite survolée', 'v3-nuit-fond', 'v3-nuit-terre-survol', 4.5],
    ['V3 sombre — crème sur l’olive profond', 'v3-sur-profond', 'v3-nuit-profond', 4.5],

    /*
     * LA SCÈNE DE LECTURE — lot 6.
     *
     * Elle a sa propre paire de jetons parce qu'elle a son propre fond :
     * l'olive profond, et non celui de la page. Le compteur de pages et la
     * note d'aide y sont du texte COURANT, pas de l'ornement — un lecteur qui
     * ne sait plus à quelle page il en est a perdu le fil de l'histoire.
     */
    ['V3 clair — encre sourde sur la scène de lecture', 'v3-sur-profond-doux', 'v3-profond', 4.5],
    ['V3 sombre — encre sourde sur la scène de lecture', 'v3-sur-profond-doux', 'v3-nuit-profond', 4.5],

    /*
     * L'ACCENT SUR L'OLIVE — le sur-titre du héros d'« Expertise ».
     *
     * `--accent-sur-chrome` vaut la terre cuite de NUIT dans les deux thèmes,
     * et c'est ce que ces deux lignes vérifient : la valeur du jour, mesurée
     * sur l'olive du jour, échouerait à 3,34:1.
     */
    ['V3 clair — l’accent sur l’olive profond', 'v3-nuit-terre', 'v3-profond', 4.5],
    ['V3 sombre — l’accent sur l’olive profond', 'v3-nuit-terre', 'v3-nuit-profond', 4.5],
  ];

  it('couvre les DEUX thèmes de la V3', () => {
    const clair = PAIRES_V3.filter(([nom]) => nom.startsWith('V3 clair'));
    const sombre = PAIRES_V3.filter(([nom]) => nom.startsWith('V3 sombre'));

    // Aucun des deux thèmes ne peut être mesuré « en passant » par l'autre :
    // chacun porte ses propres hexadécimaux, donc ses propres risques.
    expect(clair.length).toBeGreaterThanOrEqual(13);
    expect(sombre.length).toBeGreaterThanOrEqual(13);
  });

  for (const [nom, avant, arriere, seuil] of PAIRES_V3) {
    it(`${nom} : au moins ${String(seuil)}:1`, () => {
      const mesure = contraste(jeton(avant), jeton(arriere));
      expect(mesure, `--${avant} sur --${arriere} = ${mesure.toFixed(2)}:1`).toBeGreaterThanOrEqual(
        seuil,
      );
    });
  }

  /**
   * ┌──────────────────────────────────────────────────────────────────────┐
   * │ LE CONTRE-TEST DE LA V3 : LE BLANC SUR LA TERRE CUITE.               │
   * │                                                                      │
   * │ Le dossier de passation écrit noir sur blanc « Primary: --terra      │
   * │ fill, #fff text ». C'est la SEULE prescription du dossier que la V3   │
   * │ n'a pas suivie, et ce test fige la raison — sans quoi la prochaine   │
   * │ lecture du dossier la remettrait, de bonne foi, en croyant corriger  │
   * │ un oubli.                                                            │
   * │                                                                      │
   * │ C'est la troisième fois que ce dépôt tranche la même question : le   │
   * │ jaune de la V1, l'ocre de la V2, la terre cuite de la V3. Un accent  │
   * │ chaud et saturé ne porte jamais de blanc.                            │
   * └──────────────────────────────────────────────────────────────────────┘
   */
  it('V3 — le blanc sur la terre cuite est REFUSÉ, dans les DEUX thèmes', () => {
    const clair = contraste('#ffffff', jeton('v3-terre'));
    const sombre = contraste('#ffffff', jeton('v3-nuit-terre'));

    expect(clair, `blanc sur --v3-terre = ${clair.toFixed(2)}:1`).toBeLessThan(4.5);
    expect(sombre, `blanc sur --v3-nuit-terre = ${sombre.toFixed(2)}:1`).toBeLessThan(4.5);

    // Et l'encre, elle, passe — c'est ce qui rend le refus tenable.
    expect(contraste(jeton('v3-encre'), jeton('v3-terre'))).toBeGreaterThanOrEqual(4.5);
    expect(contraste(jeton('v3-nuit-fond'), jeton('v3-nuit-terre'))).toBeGreaterThanOrEqual(4.5);
  });

  /**
   * La sauge d'APLAT ne passe pas en texte — même raison que l'ocre de la V2,
   * et c'est pourquoi `--v3-sauge-encre` existe à côté d'elle.
   */
  it('V3 — la sauge de SURFACE ne porte pas de texte', () => {
    const aplat = contraste(jeton('v3-sauge'), jeton('v3-fond'));
    expect(aplat, `--v3-sauge sur --v3-fond = ${aplat.toFixed(2)}:1`).toBeLessThan(4.5);
    expect(contraste(jeton('v3-sauge-encre'), jeton('v3-fond'))).toBeGreaterThanOrEqual(4.5);
  });

  it('l’ocre de SURFACE ne passe PAS en texte — c’est pourquoi l’autre existe', () => {
    // ┌────────────────────────────────────────────────────────────────────┐
    // │ Un contre-test, et il compte autant que les autres.                │
    // │                                                                    │
    // │ Il fige la RAISON d'être de `--v2-ocre-encre`. Si quelqu'un         │
    // │ éclaircissait un jour `--v2-ocre` jusqu'à le rendre lisible, les    │
    // │ deux jetons feraient double emploi et l'un serait supprimé au       │
    // │ hasard. Si on l'assombrissait pour fusionner les deux, les boutons  │
    // │ perdraient leur chaleur. Ce test dit que la séparation est voulue.  │
    // └────────────────────────────────────────────────────────────────────┘
    const surface = contraste(jeton('v2-ocre'), jeton('v2-fond'));
    expect(surface, `--v2-ocre sur --v2-fond = ${surface.toFixed(2)}:1`).toBeLessThan(4.5);
  });

  it('le blanc sur l’ocre est REFUSÉ — l’encre, et jamais l’inverse', () => {
    const blancSurOcre = contraste('#ffffff', jeton('v2-ocre'));
    const encreSurOcre = contraste(jeton('v2-encre'), jeton('v2-ocre'));

    expect(blancSurOcre).toBeLessThan(4.5);
    expect(encreSurOcre).toBeGreaterThanOrEqual(4.5);
    expect(
      encreSurOcre,
      `l’encre (${encreSurOcre.toFixed(2)}:1) doit rester meilleure que le blanc (${blancSurOcre.toFixed(2)}:1)`,
    ).toBeGreaterThan(blancSurOcre);
  });

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

describe('aucun composant ne lit la palette BRUTE', () => {
  /**
   * ┌──────────────────────────────────────────────────────────────────────┐
   * │ LA RÈGLE QUE `CLAUDE.md` ÉNONÇAIT SANS QUE RIEN NE LA TIENNE.        │
   * │                                                                      │
   * │ « Aucun composant ne connaît le thème. Ils lisent des jetons qui     │
   * │ changent de valeur sous eux. » La couche V2 ne la respectait pas :   │
   * │ 224 lectures directes de `--v2-*` dans quinze modules CSS, dont 107  │
   * │ du seul `--v2-vert`.                                                 │
   * │                                                                      │
   * │ Un jeton `--v2-*` est une VALEUR, pas un rôle : il ne bouge sous     │
   * │ aucune autre direction, par construction. Le symptôme n'est donc pas │
   * │ une erreur de compilation mais une page à moitié repeinte — du vert  │
   * │ de la V2 subsistant sous la V3, et, en thème sombre, des titres      │
   * │ clairs sur une bande restée claire.                                  │
   * │                                                                      │
   * │ Ce test est le pendant exact de celui qui interdit les hexadécimaux  │
   * │ juste en dessous : même faute, un cran plus haut.                    │
   * └──────────────────────────────────────────────────────────────────────┘
   */
  it('aucune lecture de `--v2-*` hors du fichier de jetons', () => {
    const fautifs: string[] = [];

    for (const fichier of fichiersSources(join(RACINE, 'src'), /\.(tsx|ts|css)$/)) {
      if (fichier === JETONS) continue;

      const contenu = readFileSync(fichier, 'utf8');
      for (const trouve of contenu.matchAll(/var\(\s*--v2-[\w-]+/g)) {
        const ligne = contenu.slice(0, trouve.index).split('\n').length;
        fautifs.push(`${fichier}:${String(ligne)} → ${trouve[0]})`);
      }
    }

    expect(
      fautifs,
      `Ces lectures pointent une VALEUR et non un rôle : elles ne suivront ni la V3 ni le thème sombre.\n${fautifs.join('\n')}`,
    ).toEqual([]);
  });

  /**
   * Le pendant du test précédent : il ne prouverait rien s'il ne parcourait
   * aucun fichier, et il ne prouverait rien non plus si les rôles n'existaient
   * pas pour accueillir ce qu'il interdit.
   */
  it('les rôles qui remplacent la palette brute existent tous', () => {
    for (const role of [
      'chrome',
      'chrome-2',
      'chrome-clair',
      'chrome-encre',
      'marque',
      'marque-survol',
      'marque-encre',
      'accent-encre',
      'action-texte',
      'second-encre',
      'surface',
      'accent-sur-chrome',
    ]) {
      expect(source, `--${role} manque au fichier de jetons`).toMatch(
        new RegExp(`^\\s*--${role}:`, 'm'),
      );
    }
  });

  /**
   * ┌──────────────────────────────────────────────────────────────────────┐
   * │ SOUS LA V2, LES NOUVEAUX RÔLES RENDENT EXACTEMENT L'ANCIENNE VALEUR. │
   * │                                                                      │
   * │ C'est ce qui rend la reclassification sûre : la V2 est une direction │
   * │ LIVRÉE, et 179 lignes de ses feuilles de style viennent d'être       │
   * │ réécrites. Si un seul rôle pointait ailleurs, elle changerait        │
   * │ d'apparence sans que personne l'ait demandé.                         │
   * │                                                                      │
   * │ Le piège concret, rencontré en chemin : `--action` vaut l'OCRE sous  │
   * │ la V2. Router les boutons verts vers `--action` les aurait rendus    │
   * │ ocres — d'où `--marque`, qui est le vert sous la V2 et la terre      │
   * │ cuite sous la V3.                                                    │
   * └──────────────────────────────────────────────────────────────────────┘
   */
  it('la V2 ne bouge pas : chaque rôle pointe sur le jeton qu’il remplace', () => {
    const attendu: readonly [string, string][] = [
      ['chrome', 'v2-vert'],
      ['chrome-2', 'v2-vert-nuit'],
      ['chrome-clair', 'v2-vert-clair'],
      ['chrome-encre', 'v2-fond'],
      ['marque', 'v2-vert'],
      ['marque-survol', 'v2-vert-clair'],
      ['marque-encre', 'v2-fond'],
      ['accent-encre', 'v2-vert'],
      ['action-texte', 'v2-ocre-encre'],
      ['second-encre', 'v2-vert-clair'],
    ];

    for (const [role, brut] of attendu) {
      expect(source, `--${role} devrait pointer sur --${brut} hors V3`).toMatch(
        new RegExp(`^\\s*--${role}: var\\(--${brut}\\);`, 'm'),
      );
    }
  });

  /**
   * ┌──────────────────────────────────────────────────────────────────────┐
   * │ LE ONZIÈME RÔLE : LA SURFACE POSÉE SUR LE FOND.                      │
   * │                                                                      │
   * │ Organic travaille sur trois plans — la page, la bande, et ce qui se  │
   * │ pose dessus. La V2 n'en a que deux : ses cartes sont du même crème    │
   * │ que la page. `--surface` vaut donc `--fond` hors V3, ce qui la laisse │
   * │ strictement inchangée, et prend le crème plus clair sous Organic.     │
   * │                                                                      │
   * │ Ce qu'il remplace est un piège silencieux : `var(--carte, var(--fond))│
   * │ était écrit dans deux feuilles, et `--carte` n'a JAMAIS existé. Un    │
   * │ repli de variable ne prévient pas quand il se déclenche — la règle    │
   * │ paraissait juste et ne faisait rien.                                  │
   * └──────────────────────────────────────────────────────────────────────┘
   */
  /**
   * ┌──────────────────────────────────────────────────────────────────────┐
   * │ LA SCÈNE DE LECTURE ET SON ENCRE VONT ENSEMBLE — OU PAS DU TOUT.     │
   * │                                                                      │
   * │ Le lot 1 avait laissé `--fond-lecture` sur le crème de carte, en      │
   * │ écrivant pourquoi : le basculer SEUL sur l'olive profond aurait posé  │
   * │ l'encre sombre du reste du site sur un fond sombre. Le lot 6 les      │
   * │ bascule tous les deux.                                               │
   * │                                                                      │
   * │ Ce test fige le couple. Il tombe si quelqu'un remet un jour la scène  │
   * │ sur l'olive sans son encre, ou l'inverse — et c'est un défaut qui ne  │
   * │ se voit que sur l'écran de lecture, c'est-à-dire celui qu'on ouvre le │
   * │ moins souvent en développant.                                        │
   * └──────────────────────────────────────────────────────────────────────┘
   */
  it('la scène de lecture et son encre basculent ENSEMBLE sous la V3', () => {
    // Hors V3 : les trois valent ce que valait la page. Le lecteur ne bouge pas.
    expect(source).toMatch(/^\s*--encre-lecture: var\(--encre\);/m);
    expect(source).toMatch(/^\s*--encre-lecture-douce: var\(--encre-douce\);/m);
    expect(source).toMatch(/^\s*--bordure-lecture: var\(--bordure\);/m);

    // Sous V3 : l'olive profond, et l'encre claire qui va avec.
    expect(source).toMatch(/^\s*--fond-lecture: var\(--v3-profond\);/m);
    expect(source).toMatch(/^\s*--encre-lecture: var\(--v3-sur-profond\);/m);
    expect(source).toMatch(/^\s*--encre-lecture-douce: var\(--v3-sur-profond-doux\);/m);
  });

  /**
   * Le contre-test : le lecteur ne doit plus lire une couleur de RÉGION.
   *
   * Sa barre de progression et ses miniatures empruntaient la teinte de
   * l'Afrique de l'Ouest — sur tous les titres, y compris ceux qui n'en
   * viennent pas. Sous la V2, cette teinte VAUT le vert de marque : personne
   * ne pouvait le voir. Sous Organic, elle devient la sauge là où le dossier
   * demande la terre cuite, et la question redevient visible.
   *
   * ┌──────────────────────────────────────────────────────────────────────┐
   * │ ET LE MOTIF AUSSI — LE PRÉFIXE MANQUANT DE LA PREMIÈRE VERSION.      │
   * │                                                                      │
   * │ Ce test n'interdisait que `var(--region-…)`. Les miniatures de page  │
   * │ portaient `var(--motif-afrique_ouest)` : le kenté, sur chaque page   │
   * │ de chaque titre, y compris les livrets pédagogiques, qui n'ont pas   │
   * │ d'origine. Il a fallu le voir sur une capture pour le trouver.       │
   * │                                                                      │
   * │ Les deux préfixes disent la même chose — « ce livre vient de là » —  │
   * │ et une scène de lecture n'a pas à le dire à la place du catalogue,   │
   * │ qui a cessé de le dire aux migrations 0066 et 0071.                  │
   * └──────────────────────────────────────────────────────────────────────┘
   */
  it('le lecteur n’emprunte plus ni la teinte ni le motif d’une région', () => {
    const lecteur = readFileSync(
      join(RACINE, 'src', 'components', 'lecteur', 'lecteur.module.css'),
      'utf8',
    );

    expect(
      lecteur.match(/var\(\s*--region-[\w-]+/g) ?? [],
      'la scène de lecture ne parle pas d’une région du monde',
    ).toEqual([]);

    expect(
      lecteur.match(/var\(\s*--motif-[\w-]+/g) ?? [],
      'une vignette de page désigne un rang, pas une origine',
    ).toEqual([]);
  });

  /**
   * ┌──────────────────────────────────────────────────────────────────────┐
   * │ UNE CLASSE UTILISÉE QUATRE FOIS, ET DÉFINIE NULLE PART.              │
   * │                                                                      │
   * │ `sr-only` venait d'un `tailwind.css` retiré du produit. Les quatre    │
   * │ écrans qui la posent ont continué de la poser, et leur texte — le    │
   * │ `h1` de l'écran de lecture, entre autres — s'est mis à s'AFFICHER.   │
   * │ Une classe absente ne lève aucune erreur : ni au build, ni au        │
   * │ typecheck, ni à l'exécution. Rien ne pouvait le signaler.            │
   * │                                                                      │
   * │ Ce test vérifie les deux moitiés : que la règle existe, et qu'elle   │
   * │ CACHE SANS SUPPRIMER. `display: none` et `visibility: hidden`        │
   * │ retirent le texte de l'arbre d'accessibilité — appliqués ici, ils    │
   * │ effaceraient le `h1` au lieu de le masquer, et l'écran de lecture    │
   * │ n'aurait plus de point d'entrée pour qui l'écoute.                   │
   * └──────────────────────────────────────────────────────────────────────┘
   */
  it('`sr-only` est définie, et elle masque sans supprimer', () => {
    const global = readFileSync(join(RACINE, 'src', 'design', 'global.css'), 'utf8');

    const regle = global.match(/^\.sr-only\s*\{([^}]*)\}/m);
    expect(regle, 'la classe `sr-only` doit exister dans la feuille globale').toBeTruthy();

    const corps = regle?.[1] ?? '';
    expect(corps, 'elle sort le texte de la scène').toMatch(/position:\s*absolute/);
    expect(corps, 'et elle le rogne à rien').toMatch(/clip-path:\s*inset\(50%\)/);
    expect(corps, 'un pixel ne se replie pas à une lettre par ligne').toMatch(
      /white-space:\s*nowrap/,
    );
    expect(corps, '`display: none` retirerait le texte des lecteurs d’écran').not.toMatch(
      /display:\s*none/,
    );
    expect(corps, '`visibility: hidden` aussi').not.toMatch(/visibility:\s*hidden/);
  });

  /**
   * Le contre-test du précédent : toute classe utilitaire posée en clair dans
   * du JSX doit exister dans la feuille globale. Les modules CSS sont vérifiés
   * par le compilateur — `styles.zone` ne compile pas si `.zone` n'existe pas.
   * Les chaînes nues, elles, ne le sont par personne.
   */
  it('aucun écran ne pose une classe utilitaire qui n’existe pas', () => {
    const global = readFileSync(join(RACINE, 'src', 'design', 'global.css'), 'utf8');
    const inconnues = new Set<string>();

    for (const fichier of fichiersSources(join(RACINE, 'src'), /\.tsx$/)) {
      const contenu = readFileSync(fichier, 'utf8');
      for (const trouve of contenu.matchAll(/className="([^"{}]+)"/g)) {
        for (const classe of (trouve[1] ?? '').split(/\s+/)) {
          if (classe.length === 0) continue;
          if (!new RegExp(`\\.${classe}\\b`).test(global)) inconnues.add(classe);
        }
      }
    }

    expect([...inconnues], 'une classe écrite à la main doit être définie quelque part').toEqual(
      [],
    );
  });

  /**
   * ┌──────────────────────────────────────────────────────────────────────┐
   * │ LE TROU QUE LE TEST DES HEXADÉCIMAUX NE VOYAIT PAS.                  │
   * │                                                                      │
   * │ `auth.module.css` peint son panneau d'illustration avec des `rgba()` │
   * │ écrites en toutes lettres — un dégradé turquoise, une bordure verte, │
   * │ un motif vert. Le test des couleurs littérales cherche un `#` : ces  │
   * │ treize-là passaient au travers depuis le début.                       │
   * │                                                                      │
   * │ Conséquence, découverte au lot 8 : sous Organic, l'écran de          │
   * │ CONNEXION affichait un panneau turquoise — le premier écran qu'un    │
   * │ client voit après avoir décidé d'acheter.                            │
   * │                                                                      │
   * │ Ce test ne les interdit pas rétroactivement : il les CONFINE. Elles   │
   * │ ne vivent que dans ce fichier, et chaque direction doit repeindre le │
   * │ panneau — faute de quoi la prochaine héritera du turquoise à son     │
   * │ tour, sans que rien ne le dise.                                      │
   * └──────────────────────────────────────────────────────────────────────┘
   */
  it('les couleurs `rgba()` littérales ne débordent pas de leur seul fichier', () => {
    const fautifs: string[] = [];

    for (const fichier of fichiersSources(join(RACINE, 'src'), /\.css$/)) {
      if (fichier.endsWith(join('auth', 'auth.module.css'))) continue;

      const contenu = readFileSync(fichier, 'utf8');
      // La forme moderne `rgb(a b c / d%)` reste permise : elle sert à diluer
      // une crème ou une encre déjà décidée, jamais à inventer une teinte.
      if (/rgba\(/.test(contenu)) fautifs.push(fichier);
    }

    expect(fautifs, `ces feuilles inventent une couleur au lieu de lire un jeton`).toEqual([]);
  });

  it('chaque direction repeint le panneau d’illustration de la connexion', () => {
    const auth = readFileSync(
      join(RACINE, 'src', 'components', 'auth', 'auth.module.css'),
      'utf8',
    );

    for (const version of ['v2', 'v3']) {
      expect(
        auth,
        `la ${version} n’a pas repeint .illustration : elle hérite du turquoise de la V1`,
      ).toMatch(new RegExp(`\\[data-design='${version}'\\]\\) \\.illustration \\{`));
    }
  });

  /**
   * ┌──────────────────────────────────────────────────────────────────────┐
   * │ UNE COLONNE PARTAGÉE NE SE MESURE PAS EN `ch`.                       │
   * │                                                                      │
   * │ `ch` est la largeur du « 0 » de la police de L'ÉLÉMENT. Un titre et   │
   * │ le paragraphe qu'il coiffe n'ont pas la même police : mesurés tous    │
   * │ les deux en `72ch`, ils obtiennent deux colonnes différentes. Sur     │
   * │ `/expertise`, cela faisait 1405 px pour le titre et 691 pour son      │
   * │ texte — deux cents pixels de décalage entre une phrase et le titre    │
   * │ qui l'annonce.                                                        │
   * │                                                                      │
   * │ Le défaut existait sous la V2 et personne ne l'y avait vu. Caprasimo  │
   * │ l'a rendu criant, parce que son « 0 » est bien plus large.            │
   * │                                                                      │
   * │ Ce test interdit la combinaison, pas l'unité : `ch` reste juste pour  │
   * │ borner un titre SUR SA PROPRE mesure — ce que fait l'accroche de la   │
   * │ page de connexion, seule exception, et elle ne partage sa colonne     │
   * │ avec rien.                                                            │
   * └──────────────────────────────────────────────────────────────────────┘
   */
  it('aucune colonne partagée n’est mesurée dans la police de titre', () => {
    const fautifs: string[] = [];

    for (const fichier of fichiersSources(join(RACINE, 'src'), /\.css$/)) {
      const contenu = readFileSync(fichier, 'utf8');

      for (const regle of contenu.matchAll(/([^{}]*)\{([^{}]*)\}/g)) {
        const corps = regle[2] ?? '';
        if (!corps.includes('--police-titre')) continue;
        if (!/max-width:\s*[\d.]+ch/.test(corps)) continue;

        const selecteur = (regle[1] ?? '').trim().split('\n').pop()?.trim() ?? '';
        // L'accroche de la connexion borne SON PROPRE titre, sur sa mesure.
        if (selecteur.includes('illustrationTexte')) continue;

        const ligne = contenu.slice(0, regle.index).split('\n').length;
        fautifs.push(`${fichier}:${String(ligne)} → ${selecteur}`);
      }
    }

    expect(
      fautifs,
      `Ces règles mesurent une colonne dans la police de titre :\n${fautifs.join('\n')}`,
    ).toEqual([]);
  });

  /**
   * ┌──────────────────────────────────────────────────────────────────────┐
   * │ UN APLAT SOMBRE DOIT PORTER SON PROPRE ANNEAU DE FOCUS.              │
   * │                                                                      │
   * │ `--focus-couleur` vaut l'encre de PAGE, faite pour la crème. Sur le   │
   * │ pied olive, la barre utilitaire, le rail d'administration ou le       │
   * │ panneau de connexion, elle disparaît : le focus clavier existe, il    │
   * │ est simplement invisible — le pire des deux mondes, puisque rien ne   │
   * │ signale la panne.                                                     │
   * │                                                                      │
   * │ La liste est nominative parce que la règle ne vaut QUE pour les       │
   * │ conteneurs. Une pastille active — un tri, un onglet — est sombre elle │
   * │ aussi, mais son anneau se pose À CÔTÉ d'elle, sur la crème de la      │
   * │ page : lui donner l'encre claire l'y ferait disparaître à son tour.   │
   * └──────────────────────────────────────────────────────────────────────┘
   */
  it('chaque grande surface sombre déclare son anneau de focus', () => {
    const surfaces: readonly [string, string][] = [
      ['admin/admin.module.css', '.rail'],
      ['admin/admin.module.css', '.barre'],
      // Le panneau de connexion n'est un aplat sombre QUE sous la V3 : la
      // règle visée est donc la sienne, pas celle de la V1 juste au-dessus.
      ['auth/auth.module.css', ":global(:root[data-design='v3']) .illustration"],
      ['enveloppe/v2.module.css', '.pied'],
      ['enveloppe/v3.module.css', '.barreUtilitaire'],
      ['toast/toast.module.css', '.toast'],
      ['v2/accueil.module.css', '.appel'],
      ['v2/boutique.module.css', '.banniere'],
      ['v2/boutique.module.css', ":global(:root[data-design='v3']) .barreAchat"],
      ['v2/menu-mobile.module.css', '.panneau'],
    ];

    for (const [fichier, classe] of surfaces) {
      const contenu = readFileSync(join(RACINE, 'src', 'components', ...fichier.split('/')), 'utf8');

      const regle = [...contenu.matchAll(/([^{}]*)\{([^{}]*)\}/g)].find((trouve) => {
        // La dernière ligne du sélecteur, sans l'accolade que la capture exclut.
        const selecteur = (trouve[1] ?? '').trim().split('\n').pop()?.trim() ?? '';
        // Égalité, ou fin de sélecteur précédée d'une espace : `.rail` ne doit
        // pas se reconnaître dans `.detail`.
        return selecteur === classe || selecteur.endsWith(` ${classe}`);
      });

      expect(regle, `${fichier} n’a pas de règle ${classe}`).toBeDefined();
      expect(
        regle?.[2] ?? '',
        `${fichier} ${classe} : un aplat sombre sans anneau de focus à lui`,
      ).toContain('--focus-couleur');
    }
  });

  it('la surface vaut le fond hors V3, et le crème de carte sous V3', () => {
    expect(source).toMatch(/^\s*--surface: var\(--fond\);/m);
    expect(source).toMatch(/^\s*--surface: var\(--v3-carte\);/m);
  });

  /**
   * Le contre-test du précédent : plus aucune feuille ne doit se replier sur
   * un jeton fantôme. Un `var(--truc, var(--fond))` compile, ne prévient pas,
   * et rend la valeur de repli pour toujours.
   */
  it('aucune feuille ne se replie sur un jeton de surface qui n’existe pas', () => {
    const fautifs: string[] = [];

    for (const fichier of fichiersSources(join(RACINE, 'src'), /\.css$/)) {
      // Le fichier de jetons CITE le repli fautif dans son commentaire : c'est
      // là qu'on explique pourquoi il ne faut plus l'écrire.
      if (fichier === JETONS) continue;

      const contenu = readFileSync(fichier, 'utf8');
      for (const trouve of contenu.matchAll(/var\(\s*--carte\s*,/g)) {
        const ligne = contenu.slice(0, trouve.index).split('\n').length;
        fautifs.push(`${fichier}:${String(ligne)}`);
      }
    }

    expect(fautifs, `--carte n'existe pas : ces replis sont muets.`).toEqual([]);
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

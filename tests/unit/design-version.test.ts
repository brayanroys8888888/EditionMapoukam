import { afterEach, describe, expect, it, vi } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  COOKIE_THEME,
  VERSIONS_DESIGN,
  estV2,
  estV3,
  structureRefondue,
  themeValide,
  versionDesign,
} from '@/design/version';

/**
 * LE COMMUTATEUR DE DIRECTION, ET LE SECOND AXE QU'IL PORTE DEPUIS LA V3.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ CE FICHIER GARDE UNE PANNE QUI NE SE VOIT PAS À LA COMPILATION.         │
 * │                                                                          │
 * │ `versionDesign()` lit une variable d'environnement : toute valeur y est  │
 * │ syntaxiquement acceptable, et une faute de frappe ne casse rien — elle   │
 * │ sert simplement une autre direction que celle demandée, en silence.      │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
const RACINE = process.cwd();

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('la direction servie', () => {
  it('sert la V3 quand on la demande', () => {
    vi.stubEnv('NEXT_PUBLIC_DESIGN_VERSION', 'v3');
    expect(versionDesign()).toBe('v3');
    expect(estV3()).toBe(true);
    expect(estV2()).toBe(false);
  });

  it('sert la V1 quand on la demande', () => {
    vi.stubEnv('NEXT_PUBLIC_DESIGN_VERSION', 'v1');
    expect(versionDesign()).toBe('v1');
  });

  /**
   * Le repli est la direction VALIDÉE, pas la plus récente.
   *
   * Une V3 servie par défaut alors que ses lots ne sont pas finis livrerait
   * un chantier à un visiteur, sans que personne l'ait décidé.
   */
  it('replie sur la V2 quand rien n’est demandé', () => {
    vi.stubEnv('NEXT_PUBLIC_DESIGN_VERSION', undefined);
    expect(versionDesign()).toBe('v2');
  });

  it('replie sur la V2 sur une valeur INCONNUE — la faute de frappe', () => {
    vi.stubEnv('NEXT_PUBLIC_DESIGN_VERSION', 'V3');
    expect(versionDesign()).toBe('v2');

    vi.stubEnv('NEXT_PUBLIC_DESIGN_VERSION', 'v4');
    expect(versionDesign()).toBe('v2');
  });

  it('déclare exactement les trois directions qui existent', () => {
    expect([...VERSIONS_DESIGN]).toEqual(['v1', 'v2', 'v3']);
  });

  /**
   * ┌──────────────────────────────────────────────────────────────────────┐
   * │ LA LISTE EST ÉCRITE DEUX FOIS, ET CE TEST EST LE PRIX À PAYER.       │
   * │                                                                      │
   * │ `src/design/version.ts` est lu des DEUX côtés du réseau ;             │
   * │ `src/lib/config/env.ts` valide l'environnement au démarrage du        │
   * │ serveur et refuse de s'exécuter dans un navigateur. Les deux ne       │
   * │ peuvent donc pas partager une constante — la fusion ferait fuiter le  │
   * │ garde qui protège la clé de service.                                  │
   * │                                                                      │
   * │ La divergence est SILENCIEUSE dans un sens et brutale dans l'autre :  │
   * │   * ajoutée au schéma seulement, la direction se sert mais n'a aucun  │
   * │     jeton — la page s'affiche, simplement fausse ;                    │
   * │   * ajoutée à `version.ts` seulement, le schéma REFUSE de démarrer.   │
   * │                                                                      │
   * │ C'est arrivé le 5 septembre 2026, en posant la V3 : les jetons, le    │
   * │ commutateur et les polices étaient bons, et chaque page rendait 200   │
   * │ en journalisant « NEXT_PUBLIC_DESIGN_VERSION : Invalid input ».       │
   * └──────────────────────────────────────────────────────────────────────┘
   */
  it('le schéma d’environnement accepte EXACTEMENT les mêmes directions', () => {
    const env = readFileSync(join(RACINE, 'src', 'lib', 'config', 'env.ts'), 'utf8');
    const trouve = env.match(/NEXT_PUBLIC_DESIGN_VERSION:\s*z\.enum\(\[([^\]]+)\]\)/);

    expect(trouve, 'l’énumération n’a pas été trouvée dans src/lib/config/env.ts').not.toBeNull();

    const declarees = [...(trouve?.[1] ?? '').matchAll(/'([^']+)'/g)].map((m) => m[1]);
    expect(declarees).toEqual([...VERSIONS_DESIGN]);
  });
});

describe('la structure refondue couvre la V2 ET la V3', () => {
  /**
   * ┌──────────────────────────────────────────────────────────────────────┐
   * │ C'EST LE TEST QUI EMPÊCHE LA V3 DE RETOMBER SUR LE SQUELETTE V1.     │
   * │                                                                      │
   * │ Douze écrans branchent sur ce prédicat. Écrit `=== 'v2'`, il rendait │
   * │ la structure d'origine sous la V3 : la palette d'Organic peinte sur  │
   * │ un squelette qu'elle n'a pas été dessinée pour habiller. Rien dans   │
   * │ la compilation ne l'aurait signalé.                                  │
   * └──────────────────────────────────────────────────────────────────────┘
   */
  it('vaut pour la V3', () => {
    vi.stubEnv('NEXT_PUBLIC_DESIGN_VERSION', 'v3');
    expect(structureRefondue()).toBe(true);
  });

  it('vaut pour la V2', () => {
    vi.stubEnv('NEXT_PUBLIC_DESIGN_VERSION', 'v2');
    expect(structureRefondue()).toBe(true);
  });

  it('ne vaut PAS pour la V1 — sinon le prédicat ne dirait plus rien', () => {
    vi.stubEnv('NEXT_PUBLIC_DESIGN_VERSION', 'v1');
    expect(structureRefondue()).toBe(false);
  });
});

describe('le thème clair ou sombre', () => {
  it('lit le choix explicite du visiteur', () => {
    vi.stubEnv('NEXT_PUBLIC_DESIGN_VERSION', 'v3');
    expect(themeValide('dark')).toBe('dark');
    expect(themeValide('light')).toBe('light');
  });

  /**
   * ┌──────────────────────────────────────────────────────────────────────┐
   * │ L'ABSENCE D'ATTRIBUT EST UNE VALEUR : « SUIS LE SYSTÈME ».           │
   * │                                                                      │
   * │ Replier sur `light` paraît anodin et ne l'est pas : cela retirerait  │
   * │ son thème sombre à tout visiteur qui a réglé son téléphone en sombre │
   * │ et n'a jamais touché au commutateur du site — c'est-à-dire à la      │
   * │ quasi-totalité des premières visites.                                │
   * │                                                                      │
   * │ Sans attribut, c'est la requête média des jetons qui décide, sur le  │
   * │ sélecteur `:root[data-design='v3']:not([data-theme])`.               │
   * └──────────────────────────────────────────────────────────────────────┘
   */
  it('ne pose RIEN quand le visiteur n’a jamais choisi', () => {
    vi.stubEnv('NEXT_PUBLIC_DESIGN_VERSION', 'v3');
    expect(themeValide(undefined)).toBeNull();
    expect(themeValide(null)).toBeNull();
    expect(themeValide('')).toBeNull();
  });

  it('ignore une valeur de cookie fabriquée', () => {
    vi.stubEnv('NEXT_PUBLIC_DESIGN_VERSION', 'v3');
    expect(themeValide('DARK')).toBeNull();
    expect(themeValide('sombre')).toBeNull();
    expect(themeValide('<script>')).toBeNull();
  });

  /**
   * Les V1 et V2 n'ont jamais eu de thème sombre. Leur en poser un
   * fabriquerait une direction que personne n'a dessinée — et les jetons
   * n'ont aucun bloc pour la servir : le visiteur verrait la palette claire
   * sous un attribut qui annonce le contraire.
   */
  it('ne pose aucun thème sur les directions qui n’en ont pas', () => {
    for (const version of ['v1', 'v2']) {
      vi.stubEnv('NEXT_PUBLIC_DESIGN_VERSION', version);
      expect(themeValide('dark'), `--- ${version} ---`).toBeNull();
      expect(themeValide('light'), `--- ${version} ---`).toBeNull();
    }
  });

  it('nomme le cookie une seule fois, et le serveur comme le client le lisent là', () => {
    expect(COOKIE_THEME).toBe('em_theme');
  });
});

describe('les polices de la V3 sont EMBARQUÉES', () => {
  const POLICES = readFileSync(join(RACINE, 'src', 'design', 'polices.css'), 'utf8');

  /**
   * Le dossier de passation prescrit `next/font/google`. Le dépôt ne le suit
   * pas : `src/design/polices.css` porte l'argumentaire, et il tient au §5.1
   * — une part du public est sur connexion lente, et une feuille bloquante
   * servie par un tiers est exactement ce que Lighthouse mobile sanctionne.
   */
  it('déclare Caprasimo et Figtree', () => {
    expect(POLICES).toContain("font-family: 'Caprasimo'");
    expect(POLICES).toContain("font-family: 'Figtree'");
  });

  it('les octets sont dans le dépôt, pas chez un tiers', () => {
    for (const fichier of [
      'caprasimo-latin-400-normal.woff2',
      'caprasimo-latin-ext-400-normal.woff2',
      'figtree-latin-wght-normal.woff2',
      'figtree-latin-ext-wght-normal.woff2',
    ]) {
      expect(existsSync(join(RACINE, 'public', 'fonts', fichier)), fichier).toBe(true);
      expect(POLICES).toContain(`/fonts/${fichier}`);
    }
  });

  /**
   * L'OFL exige que le texte de la licence accompagne les fichiers. Les cinq
   * familles du dépôt sont sous OFL-1.1 ; la règle de licence du projet
   * n'accepte que du permissif, et c'en est.
   */
  it('les licences accompagnent les octets, comme l’OFL l’exige', () => {
    for (const licence of ['LICENSE-Caprasimo.txt', 'LICENSE-Figtree.txt']) {
      expect(existsSync(join(RACINE, 'public', 'fonts', licence)), licence).toBe(true);
    }
  });

  /**
   * Caprasimo n'est PAS variable. Déclarer une plage de graisses ferait
   * synthétiser un faux gras par le navigateur — il épaissit les pleins sans
   * toucher aux déliés, et la police perd le dessin qui motive son choix.
   * Le dossier le dit : « weight 400 only, the single display voice ».
   */
  it('Caprasimo est déclarée au poids 400, et pas sur une plage', () => {
    const bloc = POLICES.slice(POLICES.indexOf("font-family: 'Caprasimo'"));
    const premier = bloc.slice(0, bloc.indexOf('}'));
    expect(premier).toContain('font-weight: 400;');
    expect(premier).not.toMatch(/font-weight: \d+ \d+;/);
  });
});

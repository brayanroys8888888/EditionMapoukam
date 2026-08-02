import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { IGNORES_AUTORISES } from '../../scripts/porte-tests.mjs';
import { fichiersSources } from '../helpers/sources';

/**
 * LA PORTE DE VALIDATION SE GARDE ELLE-MÊME.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ CINQ FOIS DANS CE PROJET, UN TEST EST RESTÉ VERT SANS RIEN VALIDER.     │
 * │                                                                          │
 * │   1. une fixture `%PDF-1.4\n%%EOF` trop faible pour être filigranée ;     │
 * │   2. `nb_pages` et `book_pages` divergents dans le jeu de données, ce qui │
 * │      masquait une divergence réelle du code ;                            │
 * │   3. six parcours de sources dont un rendait `[]` en silence ;            │
 * │   4. une assertion « ni 401 ni 403 » qui tolérait un 500 ;                │
 * │   5. un `hookTimeout` qui a fait sauter 26 tests, dont toute la suite de  │
 * │      sécurité des fichiers.                                              │
 * │                                                                          │
 * │ Une seule classe de défaut : LA VALIDATION VIDE. Son symptôme est un     │
 * │ test vert, donc elle est invisible — personne ne relit un test vert.     │
 * │                                                                          │
 * │ Ce fichier garde les garde-fous. Sans lui, la porte serait à son tour un │
 * │ dispositif que rien n'exerce.                                            │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
const RACINE = process.cwd();

describe('liste blanche des tests ignorés', () => {
  it('est VIDE', () => {
    // ┌──────────────────────────────────────────────────────────────────────┐
    // │ ZÉRO EXCEPTION, ET NON « PEU D'EXCEPTIONS ».                        │
    // │                                                                      │
    // │ Une liste blanche vide n'a pas besoin d'être relue ; une liste à      │
    // │ trois entrées est relue une fois, puis plus jamais, et la quatrième   │
    // │ entrée s'ajoute sans discussion. Le projet n'a aujourd'hui aucun      │
    // │ motif d'y inscrire quoi que ce soit : le seul cas envisageable, une   │
    // │ dépendance d'environnement absente, est traité autrement — le test    │
    // │ d'epubcheck ÉCHOUE quand le validateur manque, il ne se saute pas     │
    // │ (arbitrage Q7.1).                                                    │
    // └──────────────────────────────────────────────────────────────────────┘
    expect(IGNORES_AUTORISES).toEqual([]);
  });

  it('reste courte et justifiée si elle cesse un jour d’être vide', () => {
    // Le garde-fou du garde-fou : si une entrée apparaît, elle devra porter une
    // raison écrite, et la liste ne pourra pas devenir un dépotoir.
    expect(IGNORES_AUTORISES.length).toBeLessThanOrEqual(3);

    for (const entree of IGNORES_AUTORISES) {
      expect(entree).toHaveProperty('nom');
      expect(String(entree.raison ?? '').length).toBeGreaterThan(20);
    }
  });
});

describe('AUCUN test n’est désactivé dans les sources', () => {
  /**
   * Le contrôle statique, complémentaire du contrôle d'exécution.
   *
   * La porte attrape un test ignoré AU MOMENT où il l'est. Ce test l'attrape
   * dans le TEXTE, ce qui donne un message bien plus utile : le fichier et la
   * ligne, plutôt qu'un nom de test dans un décompte.
   */
  /**
   * Ce fichier-ci est EXCLU du parcours, et il faut dire pourquoi.
   *
   * Il contient les expressions recherchées — sous forme d'expressions
   * régulières — et se signalerait donc lui-même. Ce n'est pas un trou : un
   * `.skip` réellement caché ici serait attrapé par l'AUTRE contrôle, celui
   * d'exécution, qui compte les tests ignorés sans se soucier du fichier d'où
   * ils viennent. Les deux contrôles se couvrent mutuellement, ce qui est
   * exactement ce qu'on demande à un garde-fou de garde-fou.
   */
  const CE_FICHIER = 'porte-tests.test.ts';

  const fichiersDeTest = fichiersSources(join(RACINE, 'tests')).filter(
    (f) => f.endsWith('.test.ts') && !f.endsWith(CE_FICHIER),
  );

  it('trouve bien les fichiers de test — sinon ce test ne prouverait rien', () => {
    expect(fichiersDeTest.length).toBeGreaterThanOrEqual(20);
  });

  it('n’utilise ni `.skip`, ni `.todo`, ni `.fails`', () => {
    const coupables: string[] = [];

    for (const fichier of fichiersDeTest) {
      const lignes = readFileSync(fichier, 'utf8').split('\n');
      lignes.forEach((ligne, index) => {
        // `it.skip`, `describe.skip`, `test.todo`, `it.fails`, `xit`, `xdescribe`.
        if (/\b(it|test|describe|suite)\s*\.\s*(skip|todo|fails|skipIf|runIf)\b/.test(ligne)) {
          coupables.push(`${fichier.replace(RACINE, '').replace(/\\/g, '/')}:${String(index + 1)}`);
        }
      });
    }

    expect(coupables).toEqual([]);
  });

  it('n’utilise ni `.only` ni `fit`, qui masqueraient tous les autres', () => {
    // ┌──────────────────────────────────────────────────────────────────────┐
    // │ `.only` EST LE PLUS DANGEREUX DES DEUX.                             │
    // │                                                                      │
    // │ Un `.skip` retire un test ; un `.only` oublié en retire TOUS LES      │
    // │ AUTRES du fichier, en les comptant comme ignorés. C'est la panne      │
    // │ silencieuse maximale : un fichier de quarante tests réduit à un seul, │
    // │ au vert.                                                             │
    // └──────────────────────────────────────────────────────────────────────┘
    const coupables: string[] = [];

    for (const fichier of fichiersDeTest) {
      const lignes = readFileSync(fichier, 'utf8').split('\n');
      lignes.forEach((ligne, index) => {
        if (/\b(it|test|describe|suite)\s*\.\s*only\b/.test(ligne)) {
          coupables.push(`${fichier.replace(RACINE, '').replace(/\\/g, '/')}:${String(index + 1)}`);
        }
      });
    }

    expect(coupables).toEqual([]);
  });
});

describe('LE DÉLAI DES HOOKS DÉPASSE CELUI DU PLUS LENT DES TESTS', () => {
  const config = readFileSync(join(RACINE, 'vitest.config.ts'), 'utf8');

  /** Délais de hooks déclarés dans la configuration, dans l'ordre des projets. */
  function delaisHooks(): number[] {
    return [...config.matchAll(/hookTimeout:\s*([\d_]+)/g)].map((m) =>
      Number((m[1] ?? '0').replace(/_/g, '')),
    );
  }

  /** Le plus long délai explicitement demandé par un test du dossier. */
  function delaiMaximalDemande(dossiers: readonly string[]): number {
    let maximum = 0;
    for (const dossier of dossiers) {
      for (const fichier of fichiersSources(join(RACINE, dossier))) {
        if (!fichier.endsWith('.test.ts')) continue;
        for (const trouve of readFileSync(fichier, 'utf8').matchAll(/\}\s*,\s*([\d_]+)\s*\)/g)) {
          maximum = Math.max(maximum, Number((trouve[1] ?? '0').replace(/_/g, '')));
        }
      }
    }
    return maximum;
  }

  it('déclare un délai de hook pour CHAQUE projet', () => {
    // Un projet sans réglage explicite hérite du défaut de Vitest — 10 s — qui
    // est sous le délai de plusieurs tests. C'est exactement la configuration
    // qui a fait sauter 26 tests.
    const projets = [...config.matchAll(/name:\s*'(\w+)'/g)].map((m) => m[1]);

    expect(projets.length).toBeGreaterThanOrEqual(2);
    expect(delaisHooks()).toHaveLength(projets.length);
  });

  it('dépasse, pour l’intégration, le plus long délai demandé par ses tests', () => {
    // ┌──────────────────────────────────────────────────────────────────────┐
    // │ UN HOOK NE DOIT JAMAIS EXPIRER AVANT LE TEST QU'IL PRÉPARE.          │
    // │                                                                      │
    // │ Sinon la préparation abandonne, les tests sont comptés « ignorés », et │
    // │ l'on perd la seule information utile : ce que le test aurait dit.     │
    // │                                                                      │
    // │ La marge est vérifiée, pas seulement le dépassement : un hook réglé à │
    // │ la valeur exacte du test le plus lent expirerait au premier           │
    // │ ralentissement de la machine.                                        │
    // └──────────────────────────────────────────────────────────────────────┘
    const demande = delaiMaximalDemande(['tests/integration', 'tests/security']);
    expect(demande).toBeGreaterThan(0);

    const hook = delaisHooks()[1] ?? 0;
    expect(hook).toBeGreaterThanOrEqual(Math.ceil(demande * 1.2));
  });

  it('dépasse, pour les tests unitaires, le plus long délai demandé', () => {
    const demande = delaiMaximalDemande(['tests/unit']);
    const hook = delaisHooks()[0] ?? 0;

    expect(hook).toBeGreaterThanOrEqual(Math.max(Math.ceil(demande * 1.2), 30_000));
  });
});

describe('la porte ne peut pas être contournée par la configuration', () => {
  it('n’utilise pas `--passWithNoTests`', () => {
    // ┌──────────────────────────────────────────────────────────────────────┐
    // │ MESURÉ : avec ce drapeau, une exécution de ZÉRO test sort en 0.      │
    // │                                                                      │
    // │ Une erreur de motif d'inclusion suffisait donc à valider une étape    │
    // │ sur rien. Le drapeau a été retiré, et la porte échoue explicitement   │
    // │ si l'effectif tombe à zéro.                                          │
    // └──────────────────────────────────────────────────────────────────────┘
    const paquet = readFileSync(join(RACINE, 'package.json'), 'utf8');

    expect(paquet).not.toContain('passWithNoTests');
  });

  it('fait passer `verify` PAR la porte, et non par Vitest en direct', () => {
    const paquet = JSON.parse(readFileSync(join(RACINE, 'package.json'), 'utf8')) as {
      scripts: Record<string, string>;
    };

    // `verify` appelle `test`, et `test` appelle la porte. Un `verify` qui
    // appellerait `vitest` directement retrouverait le comportement d'avant.
    expect(paquet.scripts['verify']).toContain('npm run test');
    expect(paquet.scripts['test']).toContain('porte-tests.mjs');
  });

  it('conserve l’effectif attendu dans un fichier versionné', () => {
    // Versionné, donc toute variation se lit dans un diff. Un seuil gardé en
    // mémoire du processus ou dans un fichier ignoré ne survivrait pas à une
    // machine neuve, et la protection disparaîtrait sans bruit.
    const effectif = JSON.parse(
      readFileSync(join(RACINE, 'tests', 'effectif-attendu.json'), 'utf8'),
    ) as { total: number };

    expect(effectif.total).toBeGreaterThan(800);
  });
});

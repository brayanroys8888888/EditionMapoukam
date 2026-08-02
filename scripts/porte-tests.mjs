#!/usr/bin/env node
/**
 * LA PORTE DE VALIDATION.
 *
 * ┌────────────────────────────────────────────────────────────────────────────┐
 * │ UN TEST QUI NE S'EXÉCUTE PAS NE PROTESTE PAS.                             │
 * │                                                                            │
 * │ C'est la classe de défaut la plus coûteuse du projet, parce qu'elle est     │
 * │ INVISIBLE : le symptôme d'un test qui ne valide rien est un test vert.      │
 * │ Personne ne relit un test vert.                                            │
 * │                                                                            │
 * │ Mesuré sur ce dépôt, avec Vitest 4 :                                       │
 * │                                                                            │
 * │   * un `beforeAll` qui expire → fichier en échec, code de sortie 1. La      │
 * │     porte tient, mais le décompte affiche « 811 passés, 26 ignorés », ce    │
 * │     qui se lit comme un succès dans un journal de trois cents lignes.       │
 * │                                                                            │
 * │   * `it.skip` et `it.todo` → fichier « passé », CODE DE SORTIE 0. Là, la    │
 * │     porte ne tient pas du tout.                                            │
 * │                                                                            │
 * │   * `--passWithNoTests` → aucun test exécuté, code 0. Une erreur de motif   │
 * │     d'inclusion suffisait à valider une étape sur zéro test.                │
 * │                                                                            │
 * │ Ce script ferme les trois.                                                  │
 * └────────────────────────────────────────────────────────────────────────────┘
 *
 * Deux invariants, tous deux fatals :
 *
 *   1. AUCUN test ignoré, sauté ou en attente — hors liste blanche explicite.
 *   2. Le nombre de tests exécutés NE DIMINUE JAMAIS. Un test qui disparaît est
 *      aussi bruyant qu'un test qui échoue.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';

import { join, relative, sep } from 'node:path';
import { argv } from 'node:process';
import { fileURLToPath } from 'node:url';

const RACINE = process.cwd();
const FICHIER_EFFECTIF = join(RACINE, 'tests', 'effectif-attendu.json');

/**
 * LISTE BLANCHE DES TESTS IGNORÉS.
 *
 * Volontairement VIDE, et elle doit le rester. Chaque entrée devrait porter un
 * `nom` (le nom complet du test) et une `raison` — mais la seule raison
 * admissible serait une dépendance à un environnement absent, et le projet
 * traite ce cas autrement : le test d'epubcheck, par exemple, ÉCHOUE quand le
 * validateur manque au lieu de se sauter (arbitrage Q7.1).
 *
 * `tests/unit/porte-tests.test.ts` vérifie que cette liste reste courte et
 * justifiée.
 */
export const IGNORES_AUTORISES = [];

function lireEffectifAttendu() {
  if (!existsSync(FICHIER_EFFECTIF)) return null;
  return JSON.parse(readFileSync(FICHIER_EFFECTIF, 'utf8'));
}

/**
 * Un filtre de fichiers ou de projet rend l'exécution PARTIELLE.
 *
 * Le contrôle d'effectif ne s'y applique pas — comparer une exécution d'un seul
 * fichier au total du dépôt échouerait toujours. Le contrôle des tests ignorés,
 * lui, s'applique dans tous les cas.
 */
function executionPartielle(args) {
  return args.some((a) => !a.startsWith('-')) || args.some((a) => a.startsWith('--project'));
}

function main() {
  const args = process.argv.slice(2);
  const partielle = executionPartielle(args);

  // Le rapport est déposé SOUS LE DÉPÔT, et non dans le dossier temporaire du
  // système : sur Windows, ce dernier commence par « C: », et Vitest découpe
  // l'option `--outputFile` sur le premier deux-points pour en tirer un nom de
  // rapporteur. Le fichier partait alors sur un chemin fantôme, la porte ne
  // trouvait aucun rapport, et elle échouait pour la mauvaise raison.
  const dossier = mkdtempSync(join(RACINE, 'node_modules', '.cache-porte-'));
  const rapport = join(dossier, 'rapport.json');

  try {
    // Les DEUX rapporteurs : `default` pour l'humain qui regarde défiler, `json`
    // pour la porte. Sans le premier, on perdrait la lisibilité ; sans le
    // second, on relirait un décompte à l'œil — ce qui a précisément échoué.
    //
    // `--passWithNoTests` est ABSENT, et c'est délibéré : une exécution sans
    // aucun test doit être un échec, pas un succès par défaut.
    // ┌────────────────────────────────────────────────────────────────────┐
    // │ VITEST EST LANCÉ PAR SON ENTRÉE JAVASCRIPT, PAS PAR `npx`.         │
    // │                                                                    │
    // │ Depuis Node 18.20 / 20.12, `spawnSync` refuse d'exécuter un `.cmd`  │
    // │ sans `shell: true` — un correctif de sécurité. Sur Windows, l'appel │
    // │ à `npx.cmd` échouait donc SANS AUCUNE SORTIE, et la porte concluait │
    // │ « aucun rapport produit » : le bon verdict, la mauvaise raison.     │
    // │                                                                    │
    // │ Passer par `shell: true` aurait rouvert la question de l'échappement│
    // │ des arguments. L'entrée JS de Vitest, elle, se lance avec le Node   │
    // │ courant, sans interpréteur intermédiaire.                          │
    // └────────────────────────────────────────────────────────────────────┘
    const entreeVitest = join(RACINE, 'node_modules', 'vitest', 'vitest.mjs');
    if (!existsSync(entreeVitest)) {
      console.error(`\n✗ PORTE DE VALIDATION : Vitest introuvable (${entreeVitest}).`);
      process.exit(1);
    }

    const vitest = spawnSync(
      process.execPath,
      [
        entreeVitest,
        'run',
        '--reporter=default',
        '--reporter=json',
        // Chemin RELATIF au dépôt : voir la note sur le découpage Windows.
        `--outputFile.json=${relative(RACINE, rapport).split(sep).join('/')}`,
        ...args,
      ],
      { stdio: 'inherit', cwd: RACINE },
    );

    if (!existsSync(rapport)) {
      console.error(
        '\n✗ PORTE DE VALIDATION : aucun rapport produit.\n' +
          '  Vitest n’a pas pu écrire son rapport JSON. Une exécution dont on ne\n' +
          '  peut pas lire le décompte ne peut pas être validée.',
      );
      process.exit(1);
    }

    const resultat = JSON.parse(readFileSync(rapport, 'utf8'));

    const executes = resultat.numTotalTests ?? 0;
    const reussis = resultat.numPassedTests ?? 0;
    const echoues = resultat.numFailedTests ?? 0;
    const enAttente = resultat.numPendingTests ?? 0;
    const aFaire = resultat.numTodoTests ?? 0;

    /** Les tests réellement non exécutés, nommés un par un. */
    const inexecutes = [];
    for (const fichier of resultat.testResults ?? []) {
      for (const assertion of fichier.assertionResults ?? []) {
        if (assertion.status === 'passed' || assertion.status === 'failed') continue;
        const nom = assertion.fullName || assertion.title || '(sans nom)';
        if (IGNORES_AUTORISES.some((a) => a.nom === nom)) continue;
        inexecutes.push(`${assertion.status.padEnd(7)} ${nom}`);
      }
    }

    console.log('\n── PORTE DE VALIDATION ──────────────────────────────────────');
    console.log(`   exécutés : ${executes}   réussis : ${reussis}   échoués : ${echoues}`);
    console.log(`   ignorés : ${enAttente}   en attente : ${aFaire}`);

    let rouge = vitest.status !== 0;
    if (rouge) {
      console.error('\n✗ Vitest a échoué. Voir ci-dessus.');
    }

    // ── Invariant 1 : aucun test non exécuté ────────────────────────────────
    if (inexecutes.length > 0) {
      console.error(
        `\n✗ ${inexecutes.length} test(s) NON EXÉCUTÉ(S). Un test ignoré ne protège rien :\n`,
      );
      for (const ligne of inexecutes) console.error(`    ${ligne}`);
      console.error(
        '\n  Un test qui ne peut pas tourner doit être RÉPARÉ ou SUPPRIMÉ, jamais\n' +
          '  laissé au vert. CLAUDE.md : « Ne désactive pas un test pour faire\n' +
          '  passer la suite. »',
      );
      rouge = true;
    }

    // ── Invariant 2 : l'effectif ne diminue jamais ──────────────────────────
    const attendu = lireEffectifAttendu();

    if (partielle) {
      console.log('   (exécution partielle : contrôle d’effectif non applicable)');
    } else if (executes === 0) {
      console.error(
        '\n✗ AUCUN TEST EXÉCUTÉ. Un motif d’inclusion cassé produirait exactement\n' +
          '  ce résultat, et validerait une étape sur rien.',
      );
      rouge = true;
    } else if (attendu && executes < attendu.total) {
      console.error(
        `\n✗ L’EFFECTIF A DIMINUÉ : ${executes} tests exécutés contre ${attendu.total} attendus.\n\n` +
          `  ${attendu.total - executes} test(s) ont DISPARU de l’exécution. Un test qui\n` +
          '  disparaît doit être aussi bruyant qu’un test qui échoue — c’est même\n' +
          '  pire, parce qu’un test absent ne se signale jamais de lui-même.\n\n' +
          '  Causes probables : un fichier renommé hors du motif d’inclusion, un\n' +
          '  `describe` commenté, un fichier de test supprimé.\n\n' +
          `  Si la baisse est VOULUE, corrigez ${'tests/effectif-attendu.json'}\n` +
          '  dans le même commit, pour que la décision soit visible dans l’historique.',
      );
      rouge = true;
    } else if (!rouge && (!attendu || executes > attendu.total)) {
      // La hausse est enregistrée. Le fichier est versionné : la variation se
      // lit dans le diff, ce qui vaut mieux qu'un chiffre à recopier à la main
      // — une étape à recopier est une étape qu'on oublie.
      writeFileSync(
        FICHIER_EFFECTIF,
        `${JSON.stringify(
          {
            _: 'Effectif de la suite. La porte de validation (scripts/porte-tests.mjs) ÉCHOUE si le nombre de tests exécutés descend sous ce seuil. Mis à jour automatiquement à la hausse ; toute baisse doit être corrigée à la main, dans le même commit, pour rester visible.',
            total: executes,
            maj: new Date().toISOString().slice(0, 10),
          },
          null,
          2,
        )}\n`,
      );
      const delta = attendu ? executes - attendu.total : executes;
      console.log(`   effectif porté à ${executes} (+${delta}) — tests/effectif-attendu.json`);
    }

    console.log('─────────────────────────────────────────────────────────────\n');
    process.exit(rouge ? 1 : 0);
  } finally {
    rmSync(dossier, { recursive: true, force: true });
  }
}

/**
 * N'exécute la porte que si ce fichier est LANCÉ, jamais s'il est importé.
 *
 * `tests/unit/porte-tests.test.ts` importe `IGNORES_AUTORISES` pour vérifier que
 * la liste blanche reste vide. Sans cette garde, l'import relancerait toute la
 * suite depuis l'intérieur de la suite — et le `process.exit` de la porte
 * abattrait le test qui l'inspecte.
 */
if (argv[1] && fileURLToPath(import.meta.url) === argv[1]) {
  main();
}

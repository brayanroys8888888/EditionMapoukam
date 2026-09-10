import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

import { chemin, fichiersSources } from '../helpers/sources';

/**
 * ╔═══════════════════════════════════════════════════════════════════════════╗
 * ║ `class="undefined"` — LE DÉFAUT QUI NE LÈVE RIEN.                         ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ UNE CLASSE DÉCLARÉE SEULEMENT SOUS `:global(...)` N'EST PAS EXPORTÉE.   │
 * │                                                                          │
 * │ Les modules CSS n'exportent que les classes ayant au moins une           │
 * │ déclaration LOCALE PURE. Une classe qui n'apparaît que dans une chaîne   │
 * │ `:global(:root[data-design='v3']) .machin` n'entre pas dans l'objet      │
 * │ `styles` : `styles.machin` vaut `undefined`, React rend                  │
 * │ `class="undefined"`, et la règle ne trouve jamais sa cible.              │
 * │                                                                          │
 * │ Rien ne le signale. Ni le build, ni `tsc` — `styles` est typé comme un   │
 * │ index de chaînes — ni l'exécution. Le style ne s'applique simplement     │
 * │ pas, et l'on cherche l'erreur dans la règle, qui est juste.              │
 * │                                                                          │
 * │ Ce piège s'est produit CINQ fois pendant la refonte V3, sur cinq         │
 * │ classes différentes, et chaque fois il a fallu mesurer dans le           │
 * │ navigateur pour le voir. D'où ce test.                                   │
 * └──────────────────────────────────────────────────────────────────────────┘
 */

const RACINE = process.cwd();
const SOURCES = join(RACINE, 'src');

/** `import styles from './machin.module.css'` → le chemin du fichier. */
const IMPORT_MODULE = /import\s+(\w+)\s+from\s+'([^']+\.module\.css)'/g;

/**
 * Les classes qu'un module CSS exporte réellement.
 *
 * Une déclaration est locale et pure quand le sélecteur commence par la classe
 * elle-même — `.machin {` — sans être précédé d'un `:global(...)`. On collecte
 * donc les classes en tête de sélecteur, ligne à ligne, commentaires retirés.
 */
function classesExportees(css: string): Set<string> {
  const sansCommentaires = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const exportees = new Set<string>();

  for (const bloc of sansCommentaires.split('{')) {
    // Le sélecteur est ce qui suit la dernière accolade fermante.
    const selecteur = bloc.slice(bloc.lastIndexOf('}') + 1);

    for (const partie of selecteur.split(',')) {
      const nette = partie.trim();
      // Écarté : tout ce qui est enveloppé dans `:global(...)` en tête.
      if (nette.startsWith(':global')) continue;
      const trouve = /^\.([\w-]+)/.exec(nette);
      if (trouve?.[1]) exportees.add(trouve[1]);
    }
  }

  return exportees;
}

describe('aucun écran ne pose une classe que son module n’exporte pas', () => {
  it('chaque `styles.x` correspond à une déclaration locale pure', () => {
    const manquantes: string[] = [];
    /*
     * ┌──────────────────────────────────────────────────────────────────────┐
     * │ UN PARCOURS VIDE EST UNE ERREUR, JAMAIS UN SUCCÈS.                   │
     * │                                                                      │
     * │ C'est la règle que `tests/helpers/sources.ts` énonce pour les         │
     * │ fichiers, et elle vaut ici pour les USAGES : ce test collecte des     │
     * │ infractions puis affirme que la liste est vide. Si l'expression       │
     * │ régulière cessait de correspondre — une escape mangée par un          │
     * │ outil d'édition, un renommage de liaison — la liste serait vide elle  │
     * │ aussi, et le test passerait au vert sans avoir rien vérifié.          │
     * │                                                                      │
     * │ Cela s'est produit pendant l'écriture : `\\b` écrit `\b` dans un      │
     * │ gabarit est un CARACTÈRE D'EFFACEMENT, pas une limite de mot. Le     │
     * │ test est passé du premier coup, en n'examinant rien.                  │
     * └──────────────────────────────────────────────────────────────────────┘
     */
    let examinees = 0;

    for (const fichier of fichiersSources(SOURCES, /\.tsx$/)) {
      const source = readFileSync(fichier, 'utf8');

      // Les modules importés par CE fichier, par leur nom de liaison.
      const modules = new Map<string, string>();
      for (const trouve of source.matchAll(IMPORT_MODULE)) {
        const [, liaison, relatif] = trouve;
        if (!liaison || !relatif) continue;
        const absolu = relatif.startsWith('.')
          ? resolve(dirname(fichier), relatif)
          : join(SOURCES, relatif.replace(/^@\//, ''));
        modules.set(liaison, absolu);
      }

      if (modules.size === 0) continue;

      const exportees = new Map<string, Set<string>>();
      for (const [liaison, absolu] of modules) {
        exportees.set(liaison, classesExportees(readFileSync(absolu, 'utf8')));
      }

      /*
       * ┌────────────────────────────────────────────────────────────────────┐
       * │ UNE CLÉ DE TRADUCTION N'EST PAS UN ACCÈS DE PROPRIÉTÉ.            │
       * │                                                                    │
       * │ `traduire(langue, 'accueil.voirTout')` ressemble à `accueil.x`, et │
       * │ `import styles from './accueil.module.css'` aussi. Ce sont des     │
       * │ CHAÎNES.                                                           │
       * │                                                                    │
       * │ Une première version les retirait par expression régulière. Elle   │
       * │ échouait : ce dépôt écrit en français, et chaque apostrophe de     │
       * │ « d'écran » désynchronise l'appariement des guillemets simples.    │
       * │                                                                    │
       * │ On regarde donc le caractère qui PRÉCÈDE. Un accès de propriété    │
       * │ n'est jamais collé à un guillemet ouvrant ; une clé de traduction  │
       * │ l'est toujours. C'est plus simple, et ça ne dépend d'aucun         │
       * │ appariement.                                                       │
       * └────────────────────────────────────────────────────────────────────┘
       */
      /*
       * Les lignes d'import sortent du champ : `from
       * '@/components/ecran/ecran.module.css'` contient `ecran.module`, que le
       * caractère précédent — une barre oblique — ne suffit pas à écarter.
       */
      const corps = source
        .split('\n')
        .filter((ligne) => !/^\s*import\b/.test(ligne))
        .join('\n');

      for (const [liaison, connues] of exportees) {
        const usage = new RegExp(`(.?)\\b${liaison}\\.([A-Za-z]\\w*)\\b`, 'g');
        for (const trouve of corps.matchAll(usage)) {
          const precedent = trouve[1] ?? '';
          if (precedent === "'" || precedent === '"' || precedent === '`') continue;
          /*
           * ┌──────────────────────────────────────────────────────────────┐
           * │ ET LE CHEMIN D'IMPORT LUI-MÊME.                              │
           * │                                                              │
           * │ `import ecran from '@/components/ecran/ecran.module.css'` :   │
           * │ le caractère qui précède `ecran.module` est une BARRE, pas un │
           * │ guillemet — la garde ci-dessus ne l'attrape pas, et le test   │
           * │ réclamait une classe `.module` dans dix-neuf écrans.          │
           * │                                                              │
           * │ Un accès de propriété n'est jamais précédé d'une barre : le   │
           * │ seul cas serait une division `a / b.c`, où `a` porterait le    │
           * │ nom d'un module de style. La garde ne perd donc rien.         │
           * └──────────────────────────────────────────────────────────────┘
           */
          if (precedent === '/') continue;
          const classe = trouve[2];
          if (!classe) continue;
          examinees += 1;
          if (!connues.has(classe)) {
            manquantes.push(`${chemin(fichier)} → ${liaison}.${classe}`);
          }
        }
      }
    }

    expect(
      examinees,
      'le parcours n’a examiné aucun usage : la recherche est cassée',
    ).toBeGreaterThan(300);

    expect(
      [...new Set(manquantes)],
      'ces classes rendent `class="undefined"` : il leur faut une déclaration locale',
    ).toEqual([]);
  });
});

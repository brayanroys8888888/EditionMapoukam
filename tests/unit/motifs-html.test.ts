import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { chemin, fichiersSources } from '../helpers/sources';

/**
 * ╔═══════════════════════════════════════════════════════════════════════════╗
 * ║ UN `pattern` INVALIDE NE REFUSE PAS LA SAISIE — IL BLOQUE LE FORMULAIRE.  ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ CE QUE CE TEST A TROUVÉ LE JOUR OÙ IL A ÉTÉ ÉCRIT.                      │
 * │                                                                          │
 * │ `pattern="[A-Za-z0-9-]+"` sur le champ d'un code promotionnel. Les       │
 * │ navigateurs récents compilent l'attribut avec l'indicateur `v`, où un    │
 * │ tiret NU en fin de classe est ambigu et donc refusé.                     │
 * │                                                                          │
 * │ Un motif invalide ne rend pas le champ invalide : il fait LEVER          │
 * │ `checkValidity()`, et le formulaire n'est jamais envoyé. L'éditeur       │
 * │ presse « Créer », la page ne bouge pas, aucune erreur ne s'affiche, et   │
 * │ rien n'entre dans le journal du serveur — puisqu'aucune requête n'est    │
 * │ partie.                                                                  │
 * │                                                                          │
 * │ Ni `tsc` ni ESLint ne lisent le contenu d'un attribut HTML. Seul un      │
 * │ essai dans un vrai navigateur l'a montré.                                │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Le test compile chaque motif comme le navigateur le fait — ancré, avec `v`.
 */
const SOURCES = join(process.cwd(), 'src');

/** `pattern="..."` dans un attribut JSX littéral. */
const MOTIF = /\bpattern="([^"]+)"/g;

describe('les attributs `pattern` des formulaires', () => {
  it('sont tous des expressions régulières valides en mode `v`', () => {
    const coupables: string[] = [];
    let trouves = 0;

    for (const fichier of fichiersSources(SOURCES, /\.tsx$/)) {
      const source = readFileSync(fichier, 'utf8');
      for (const trouve of source.matchAll(MOTIF)) {
        const motif = trouve[1] ?? '';
        trouves += 1;
        try {
          // Exactement ce que fait le navigateur : ancré des deux côtés,
          // indicateur `v`. C'est le `v` qui refuse le tiret nu.
          new RegExp(`^(?:${motif})$`, 'v');
        } catch (erreur) {
          coupables.push(
            `${chemin(fichier)} : pattern="${motif}" — ${
              erreur instanceof Error ? erreur.message : String(erreur)
            }`,
          );
        }
      }
    }

    // Sans motif trouvé, le test passerait sur une expression cassée.
    expect(trouves, 'aucun `pattern` trouvé : le test ne prouve plus rien').toBeGreaterThan(0);

    expect(
      coupables,
      'Un motif invalide fait LEVER checkValidity : le formulaire ne part jamais.\n' +
        coupables.join('\n'),
    ).toEqual([]);
  });
});

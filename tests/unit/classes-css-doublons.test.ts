import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { chemin, fichiersSources } from '../helpers/sources';

/**
 * ╔═══════════════════════════════════════════════════════════════════════════╗
 * ║ DEUX COMPOSANTS QUI SE PARTAGENT UN NOM DE CLASSE SANS LE SAVOIR.         ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ CE QUE CE TEST A ÉTÉ ÉCRIT POUR ATTRAPER — c'est arrivé.                │
 * │                                                                          │
 * │ `admin.module.css` fait trois mille lignes et sert quinze écrans. Le     │
 * │ tableau de bord y posait déjà `.panneau`, `.panneauEntete`,              │
 * │ `.panneauTitre` et `.panneauCorps` pour ses panneaux de contenu. Le      │
 * │ tiroir latéral, écrit huit cents lignes plus bas, a repris les MÊMES     │
 * │ quatre noms.                                                             │
 * │                                                                          │
 * │ Un module CSS n'y voit pas de conflit : il émet les deux règles sous le  │
 * │ même nom généré, et les propriétés fusionnent. Résultat : le tiroir      │
 * │ héritait d'un rembourrage qu'il n'avait pas demandé, et — beaucoup plus  │
 * │ grave — les panneaux du TABLEAU DE BORD recevaient le                    │
 * │ `position: fixed` du tiroir. Un écran cassé par l'écriture d'un autre.   │
 * │                                                                          │
 * │ Rien ne le signale : ni le build, ni `tsc`, ni le test des classes       │
 * │ `undefined` — les deux noms EXISTENT. Seule la mesure l'a montré, et     │
 * │ elle ne portait que sur le tiroir ; le tableau de bord serait resté      │
 * │ cassé jusqu'à ce que quelqu'un l'ouvre.                                  │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ CE QUE LE TEST TOLÈRE, ET POURQUOI.                                     │
 * │                                                                          │
 * │ Une classe peut légitimement apparaître plusieurs fois : un survol, un   │
 * │ état, une requête de média, un sélecteur composé. Ce sont des            │
 * │ RAFFINEMENTS de la même règle, reconnaissables à ce qu'ils portent autre │
 * │ chose que la classe seule.                                               │
 * │                                                                          │
 * │ Le test ne compte donc que les déclarations NUES — `.machin {` en début  │
 * │ de ligne, sans pseudo-classe, sans combinateur, hors requête de média.   │
 * │ Deux de celles-là pour un même nom, c'est deux composants qui croient    │
 * │ chacun posséder la classe.                                              │
 * └──────────────────────────────────────────────────────────────────────────┘
 */

const RACINE = process.cwd();
const SOURCES = join(RACINE, 'src');

/**
 * Une déclaration NUE : la ligne ne porte que la classe et son accolade.
 *
 * `.machin {` compte. `.machin:hover {`, `.machin .autre {`, `.machin,` et
 * `.a .machin {` ne comptent pas — ce sont des raffinements ou des listes.
 */
const DECLARATION_NUE = /^\.([A-Za-z_][\w-]*)\s*\{\s*$/;

/** Les blocs `@media` : une redéfinition sous condition n'est pas un doublon. */
function horsMedia(source: string): string[] {
  const lignes = source.split('\n');
  const retenues: string[] = [];
  let profondeurMedia = 0;
  let profondeur = 0;

  for (const ligne of lignes) {
    const entreMedia = /^\s*@(media|supports|container)\b/.test(ligne);
    if (entreMedia) profondeurMedia = profondeur + 1;

    if (profondeurMedia === 0) retenues.push(ligne);

    profondeur += (ligne.match(/\{/g) ?? []).length;
    profondeur -= (ligne.match(/\}/g) ?? []).length;
    if (profondeurMedia > 0 && profondeur < profondeurMedia) profondeurMedia = 0;
  }
  return retenues;
}

describe('les modules CSS', () => {
  it('ne déclarent jamais deux fois la même classe à nu', () => {
    const coupables: string[] = [];

    for (const fichier of fichiersSources(SOURCES, /\.module\.css$/)) {
      const lignes = horsMedia(readFileSync(fichier, 'utf8'));
      const vues = new Map<string, number[]>();

      lignes.forEach((ligne, index) => {
        const trouve = DECLARATION_NUE.exec(ligne);
        if (!trouve?.[1]) return;

        /*
         * PAS la dernière ligne d'une LISTE de sélecteurs.
         *
         * `.a,` puis `.b,` puis `.c {` : la dernière a exactement la forme
         * d'une déclaration nue, et `.c` partage sa règle avec `.a` et `.b`
         * DÉLIBÉRÉMENT. Vingt et un faux coupables sont sortis de cet oubli
         * à la première exécution — assez pour que le test soit inutilisable.
         */
        const precedente = lignes
          .slice(0, index)
          .reverse()
          .find((l) => l.trim() !== '' && !l.trim().startsWith('*') && !l.trim().startsWith('/*'));
        if (precedente?.trim().endsWith(',')) return;

        const nom = trouve[1];
        vues.set(nom, [...(vues.get(nom) ?? []), index + 1]);
      });

      for (const [nom, positions] of vues) {
        if (positions.length < 2) continue;

        /*
         * ┌──────────────────────────────────────────────────────────────────┐
         * │ UN DOUBLON N'EST PAS TOUJOURS UNE FAUTE — CELUI-CI L'EST.        │
         * │                                                                  │
         * │ Redéclarer une classe plus bas pour l'AUGMENTER est un usage     │
         * │ légitime, et le dépôt en compte cinq : `.image` reçoit son        │
         * │ animation dans la section des animations, `.moyenLien` change de │
         * │ grille dans la section V3. Les interdire ferait échouer le test  │
         * │ sur du code juste, et il serait désarmé dans la semaine.          │
         * │                                                                  │
         * │ Ce qui est fautif, c'est de reprendre `position` ou `display` :  │
         * │ ces deux-là décident du MODE DE MISE EN PAGE. Un composant qui   │
         * │ les repose sur une classe qu'un autre croyait sienne ne l'ajuste │
         * │ pas, il l'arrache à son flux — c'est exactement ce qui est       │
         * │ arrivé quand le tiroir latéral a posé `position: fixed` sur le   │
         * │ `.panneau` du tableau de bord.                                    │
         * └──────────────────────────────────────────────────────────────────┘
         */
        const structurelles = positions.slice(1).filter((debut) => {
          for (let i = debut; i < lignes.length; i += 1) {
            const ligne = lignes[i] ?? '';
            if (ligne.trim() === '}') return false;
            if (/^\s*(position|display)\s*:/.test(ligne)) return true;
          }
          return false;
        });

        if (structurelles.length > 0) {
          coupables.push(
            `${chemin(fichier)} : .${nom} redéclarée ligne ${structurelles.join(', ')} ` +
              `avec \`position\` ou \`display\` — elle en a déjà une ligne ${String(positions[0])}`,
          );
        }
      }
    }

    expect(
      coupables,
      'Deux composants se partagent un nom de classe : leurs propriétés fusionnent.\n' +
        'Renommez-en un — le module CSS ne les distingue pas.\n' +
        coupables.join('\n'),
    ).toEqual([]);
  });
});

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { PALETTE_EMAIL } from '@/emails/palette';

/**
 * LA PALETTE DES EMAILS NE PEUT PAS DÉRIVER DE LA CHARTE.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ CE TEST EXISTE PARCE QUE LA COPIE EST INÉVITABLE.                       │
 * │                                                                          │
 * │ Aucun client de messagerie ne résout `var(--v3-terre)` : les couleurs    │
 * │ d'un email DOIVENT être littérales. `src/emails/palette.ts` en porte     │
 * │ donc un double, ce que `design-tokens` interdirait partout ailleurs.     │
 * │                                                                          │
 * │ Ce qu'on ne peut pas empêcher, on le SURVEILLE : chaque valeur est       │
 * │ comparée au jeton qu'elle prétend refléter, relu dans `tokens.css`. Une  │
 * │ retouche de la charte qui oublierait les emails échoue ici, au lieu de   │
 * │ partir sans bruit dans les boîtes de réception.                          │
 * └──────────────────────────────────────────────────────────────────────────┘
 */

const JETONS = readFileSync(join(process.cwd(), 'src', 'design', 'tokens.css'), 'utf8');

/** Le couple palette → jeton reflété. Le commentaire de `palette.ts` le dit aussi. */
const REFLETS: Record<keyof typeof PALETTE_EMAIL, string> = {
  fond: '--v3-fond',
  carte: '--v3-carte',
  ligne: '--v3-fond-2',
  encre: '--v3-encre',
  encreDouce: '--v3-encre-douce',
  terre: '--v3-terre',
  terreEncre: '--v3-terre-encre',
};

/**
 * La valeur DÉCLARÉE d'un jeton, en thème clair.
 *
 * On prend la PREMIÈRE déclaration littérale : le bloc sombre redéfinit les
 * mêmes noms en `var(--v3-nuit-*)`, et un email ne suit pas le thème du
 * lecteur — c'est la valeur claire qui part.
 */
function valeurDuJeton(nom: string): string | null {
  // Un balayage de lignes plutôt qu'une expression construite par
  // concaténation : celle-ci se relit mal, et une échappement de travers y
  // rend `null` en silence — c'est-à-dire un test qui ne teste plus rien.
  for (const ligne of JETONS.split(/\r?\n/)) {
    const nette = ligne.trim();
    if (!nette.startsWith(`${nom}:`)) continue;

    const valeur = nette.slice(nom.length + 1).replace(';', '').trim();
    if (valeur.startsWith('#')) return valeur.toLowerCase();

    // Le bloc sombre redéfinit les mêmes noms en `var(--v3-nuit-*)` : on
    // passe, la déclaration littérale du thème clair vient avant.
  }
  return null;
}

describe('la palette des emails', () => {
  it('reflète exactement les jetons qu’elle nomme', () => {
    for (const [cle, jeton] of Object.entries(REFLETS)) {
      const attendu = valeurDuJeton(jeton);

      // Un jeton introuvable est un échec, pas une comparaison sautée : c'est
      // le cas où quelqu'un renomme une variable et casse le lien en silence.
      expect(attendu, `${jeton} est introuvable dans tokens.css`).not.toBeNull();

      expect(
        PALETTE_EMAIL[cle as keyof typeof PALETTE_EMAIL].toLowerCase(),
        `PALETTE_EMAIL.${cle} a dérivé de ${jeton}`,
      ).toBe(attendu);
    }
  });

  it('couvre toute la palette — sinon une couleur pourrait s’ajouter sans surveillance', () => {
    expect(Object.keys(REFLETS).sort()).toEqual(Object.keys(PALETTE_EMAIL).sort());
  });
});

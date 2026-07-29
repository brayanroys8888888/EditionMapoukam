import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

import { fichiersSources } from '../helpers/sources';

/**
 * Discipline d'horloge, vérifiée sur les sources plutôt que sur le
 * comportement.
 *
 * docs/PLAN.md §2.5 (b) : `app.now` n'est jamais dérivé d'une entrée
 * utilisateur. Sa seule source est le DevClock, un état détenu par le serveur.
 * Pour que cette garantie tienne dans le temps, un seul module du dépôt a le
 * droit de nommer ce paramètre — et ce test échoue dès qu'un autre le fait.
 *
 * Un commentaire suffit à documenter une règle ; il ne suffit pas à la tenir.
 */
const SRC = join(process.cwd(), 'src');
const MODULE_AUTORISE = join('src', 'lib', 'supabase', 'dev-clock-session.ts');

describe('paramètre de session app.now', () => {
  it('n’est nommé que par le module autorisé', () => {
    const coupables = fichiersSources(SRC)
      .filter((chemin) => readFileSync(chemin, 'utf8').includes('app.now'))
      .map((chemin) => relative(process.cwd(), chemin))
      .filter((chemin) => chemin !== MODULE_AUTORISE);

    expect(coupables).toEqual([]);
  });

  it('est bien nommé par le module autorisé — sinon ce test ne prouverait rien', () => {
    const source = readFileSync(join(process.cwd(), MODULE_AUTORISE), 'utf8');

    expect(source).toContain('app.now');
  });
});

describe('lecture directe du temps dans la logique métier', () => {
  it('src/domain n’appelle jamais new Date() ni Date.now()', () => {
    // Doublon volontaire de la règle ESLint : le lint peut être contourné par
    // un commentaire de désactivation, pas ce test.
    //
    // Une version antérieure enveloppait ce parcours dans un `try/catch` qui
    // rendait la main quand `src/domain` était introuvable — écrit à l'époque
    // où le dossier n'existait pas encore. Il rendait la règle silencieusement
    // désactivable : renommer `src/domain` aurait suffi à la faire taire, au
    // vert. L'absence du dossier doit faire ÉCHOUER ce test, pas le sauter.
    const coupables = fichiersSources(join(SRC, 'domain'))
      .filter((chemin) => /new Date\(\s*\)|Date\.now\(\s*\)/.test(readFileSync(chemin, 'utf8')))
      .map((chemin) => relative(process.cwd(), chemin));

    expect(coupables).toEqual([]);
  });
});

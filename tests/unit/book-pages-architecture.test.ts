import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

import { fichiersSources } from '../helpers/sources';

/**
 * CE TEST REMPLACE UN FILET DE SÉCURITÉ.
 *
 * `book_pages` porte le contenu vendu. Elle a RLS activée et une politique de
 * refus total : aucun client `anon` ou `authenticated` ne l'atteint. Mais le
 * serveur y accède avec `service_role`, qui contourne RLS par construction — la
 * base ne rattrape donc pas une erreur applicative sur cette table.
 *
 * La compensation est architecturale : un point de passage unique, où la
 * vérification des droits est intégrée. Ce test est ce qui rend cette règle
 * réelle plutôt que verbale. Sans lui, la protection du contenu ne reposerait
 * que sur la mémoire du prochain développeur.
 *
 * Écart assumé avec la règle de sécurité n°1 de CLAUDE.md, consigné en §2.3 de
 * docs/PLAN.md.
 *
 * ---------------------------------------------------------------------------
 * ÉVOLUTION DE LA RÈGLE À L'ÉTAPE 7 — SCINDÉE, ET NON ASSOUPLIE
 *
 * La chaîne d'ingestion doit ALIMENTER cette table. La règle d'origine — un
 * module unique — ne pouvait pas l'accueillir sans être affaiblie.
 *
 * Ce que la règle protège, c'est la LECTURE : la garantie « aucune page ne sort
 * sans être passée par `access_for` » ne tient que parce qu'aucun autre chemin
 * de lecture n'existe. L'écriture fait entrer du contenu, elle n'en fait pas
 * sortir : elle ne met pas cette garantie en jeu.
 *
 * La règle est donc découpée selon le sens du flux :
 *   * `page-service.ts` — seul à LIRE, et toujours après `getAccess` ;
 *   * `pages-repository.ts` — seul à ÉCRIRE, et INCAPABLE de lire.
 *
 * La dernière clause est ce qui empêche l'assouplissement : sans elle, le
 * module d'écriture deviendrait un second chemin de lecture sans contrôle de
 * droits, et la garantie d'origine tomberait sans que rien ne le signale.
 */
const RACINE = process.cwd();
const MODULE_LECTURE = join('src', 'lib', 'content', 'page-service.ts');
const MODULE_ECRITURE = join('src', 'lib', 'ingestion', 'pages-repository.ts');

/** Fichier généré depuis le schéma : il décrit toutes les tables, par nature. */
const TYPES_GENERES = join('src', 'lib', 'supabase', 'database.types.ts');

describe('accès à book_pages', () => {
  it('n’est référencée que par le service de pages et le dépôt d’ingestion', () => {
    const coupables = fichiersSources(join(RACINE, 'src'))
      .filter((chemin) => readFileSync(chemin, 'utf8').includes('book_pages'))
      .map((chemin) => relative(RACINE, chemin))
      .filter(
        (chemin) =>
          chemin !== MODULE_LECTURE && chemin !== MODULE_ECRITURE && chemin !== TYPES_GENERES,
      );

    expect(coupables).toEqual([]);
  });

  it('est bien référencée par ces modules — sinon ce test ne prouverait rien', () => {
    expect(readFileSync(join(RACINE, MODULE_LECTURE), 'utf8')).toContain("from('book_pages')");
    expect(readFileSync(join(RACINE, MODULE_ECRITURE), 'utf8')).toContain("from('book_pages')");
  });

  it('n’est jamais lue sans passer par le moteur de droits', () => {
    const source = readFileSync(join(RACINE, MODULE_LECTURE), 'utf8');

    // Le contrôle doit précéder la lecture : lire puis filtrer laisserait une
    // fenêtre où le contenu est en mémoire, et un `return` oublié suffirait.
    const positionControle = source.indexOf('getAccess(');
    const positionLecture = source.indexOf("from('book_pages')");

    expect(positionControle).toBeGreaterThan(-1);
    expect(positionControle).toBeLessThan(positionLecture);
  });
});

describe('le module d’écriture ne sait pas lire', () => {
  /**
   * C'est cette clause qui empêche l'ouverture faite à l'étape 7 de dégénérer.
   *
   * Un `select` ici serait un chemin de lecture du contenu vendu SANS
   * vérification de droits — exactement ce que la règle d'origine interdit. Le
   * module n'a aucune raison d'en avoir besoin : il insère et il supprime.
   */
  it('ne fait aucun select', () => {
    const source = readFileSync(join(RACINE, MODULE_ECRITURE), 'utf8');

    expect(source).not.toMatch(/\.select\s*\(/);
  });

  it('ne rend jamais une ligne écrite à son appelant', () => {
    // PostgREST rend la ligne écrite dès qu'on le lui demande : un
    // `single`/`maybeSingle` ici serait une lecture déguisée en écriture.
    const source = readFileSync(join(RACINE, MODULE_ECRITURE), 'utf8');

    expect(source).not.toMatch(/\.maybeSingle\s*\(|\.single\s*\(/);
  });

  it('n’écrit que par upsert ou suppression', () => {
    const source = readFileSync(join(RACINE, MODULE_ECRITURE), 'utf8');

    expect(source).toMatch(/\.upsert\s*\(/);
    expect(source).toMatch(/\.delete\s*\(/);
  });
});

describe('paramètres métier', () => {
  it('ne sont plus lus depuis l’environnement', () => {
    // Source unique : la table `business_settings`. Deux sources finiraient par
    // diverger, et un test de concordance n'aurait fait que le constater.
    const coupables = fichiersSources(join(RACINE, 'src'))
      .filter((chemin) => {
        const source = readFileSync(chemin, 'utf8');
        return (
          /NEW_RELEASE_WINDOW_DAYS/.test(source) || /PAYMENT_GRACE_PERIOD_DAYS/.test(source)
        );
      })
      .map((chemin) => relative(RACINE, chemin))
      // `env.ts` en parle dans un commentaire qui explique justement leur absence.
      .filter((chemin) => chemin !== join('src', 'lib', 'config', 'env.ts'));

    expect(coupables).toEqual([]);
  });
});

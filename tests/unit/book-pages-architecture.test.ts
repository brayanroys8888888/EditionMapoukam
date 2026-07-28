import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

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
 */
const RACINE = process.cwd();
const MODULE_AUTORISE = join('src', 'lib', 'content', 'page-service.ts');

/** Fichier généré depuis le schéma : il décrit toutes les tables, par nature. */
const TYPES_GENERES = join('src', 'lib', 'supabase', 'database.types.ts');

function fichiersSources(racine: string): string[] {
  const trouves: string[] = [];
  for (const entree of readdirSync(racine)) {
    const chemin = join(racine, entree);
    if (statSync(chemin).isDirectory()) {
      trouves.push(...fichiersSources(chemin));
    } else if (/\.(ts|tsx)$/.test(chemin)) {
      trouves.push(chemin);
    }
  }
  return trouves;
}

describe('accès à book_pages', () => {
  it('n’est référencée que par le service de pages', () => {
    const coupables = fichiersSources(join(RACINE, 'src'))
      .filter((chemin) => readFileSync(chemin, 'utf8').includes('book_pages'))
      .map((chemin) => relative(RACINE, chemin))
      .filter((chemin) => chemin !== MODULE_AUTORISE && chemin !== TYPES_GENERES);

    expect(coupables).toEqual([]);
  });

  it('est bien référencée par ce module — sinon ce test ne prouverait rien', () => {
    const source = readFileSync(join(RACINE, MODULE_AUTORISE), 'utf8');

    expect(source).toContain("from('book_pages')");
  });

  it('n’est jamais lue sans passer par le moteur de droits', () => {
    const source = readFileSync(join(RACINE, MODULE_AUTORISE), 'utf8');

    // Le contrôle doit précéder la lecture : lire puis filtrer laisserait une
    // fenêtre où le contenu est en mémoire, et un `return` oublié suffirait.
    const positionControle = source.indexOf('getAccess(');
    const positionLecture = source.indexOf("from('book_pages')");

    expect(positionControle).toBeGreaterThan(-1);
    expect(positionControle).toBeLessThan(positionLecture);
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

import { describe, expect, it } from 'vitest';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * UN SEUL CHEMIN MÈNE AU FICHIER D'UN LIVRE, ET IL FILIGRANE.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ POURQUOI CE TEST EXISTE : UNE ROUTE DE CONTOURNEMENT A RÉELLEMENT VÉCU. │
 * │                                                                          │
 * │ `GET /api/books/[id]/file`, livrée à l'étape 6, servait le fichier       │
 * │ générique. Après l'étape 11, elle contournait intégralement le           │
 * │ filigrane : ni marque, ni journal, ni échec fermé. Le journal de §10.2   │
 * │ aurait eu des TROUS INVISIBLES — pire qu'un journal absent, puisqu'on    │
 * │ l'aurait cru complet.                                                    │
 * │                                                                          │
 * │ Elle a été supprimée le jour où son remplaçant a été livré. Attendre     │
 * │ cinq étapes aurait laissé du code s'y brancher de bonne foi, et ce       │
 * │ n'aurait plus été une suppression mais une migration.                    │
 * │                                                                          │
 * │ Ce test est ce qui empêche la situation de se reformer.                 │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
const RACINE = process.cwd();
const API = join(RACINE, 'src', 'app', 'api');

/** Seul module autorisé à résoudre le fichier téléchargeable d'un titre. */
const SERVICE_TELECHARGEMENT = join('src', 'lib', 'downloads', 'service.ts');

/** Seul module autorisé à écrire ce chemin : la chaîne d'ingestion. */
const PIPELINE_INGESTION = join('src', 'lib', 'ingestion', 'pipeline.ts');

/** Fichier généré depuis le schéma : il décrit toutes les tables, par nature. */
const TYPES_GENERES = join('src', 'lib', 'supabase', 'database.types.ts');

/** Seule route autorisée à servir un fichier de livre. */
const ROUTE_TELECHARGEMENT = join('src', 'app', 'api', 'downloads', '[bookId]', 'route.ts');

function fichiersSources(racine: string): string[] {
  if (!existsSync(racine)) return [];
  const trouves: string[] = [];
  for (const entree of readdirSync(racine)) {
    const chemin = join(racine, entree);
    if (statSync(chemin).isDirectory()) trouves.push(...fichiersSources(chemin));
    else if (/\.(ts|tsx)$/.test(chemin)) trouves.push(chemin);
  }
  return trouves;
}

describe('la route de contournement a bien disparu', () => {
  it('n’existe plus sur le disque', () => {
    // Le contrôle le plus direct : le fichier lui-même.
    expect(existsSync(join(API, 'books', '[id]', 'file'))).toBe(false);
  });

  it('n’est référencée nulle part', () => {
    const coupables = [...fichiersSources(join(RACINE, 'src')), ...fichiersSources(join(RACINE, 'tests'))]
      .filter((chemin) => /books\/\[id\]\/file/.test(readFileSync(chemin, 'utf8')))
      .map((chemin) => relative(RACINE, chemin))
      // Ce fichier-ci la nomme pour expliquer sa disparition.
      .filter((chemin) => chemin !== join('tests', 'unit', 'telechargement-architecture.test.ts'));

    expect(coupables).toEqual([]);
  });
});

describe('le fichier téléchargeable n’est résolu que par le service de téléchargement', () => {
  it('`fichier_telechargement` n’est lu que par lui', () => {
    // C'est la colonne qui désigne le fichier vendu. Qui la lit peut le servir ;
    // la restreindre revient à restreindre l'accès au fichier lui-même.
    const coupables = fichiersSources(join(RACINE, 'src'))
      .filter((chemin) => {
        const source = readFileSync(chemin, 'utf8');
        // Les mentions en commentaire sont légitimes : on cherche un usage,
        // c'est-à-dire une lecture ou une écriture de la colonne.
        return /fichier_telechargement\s*[,:)]|['"]fichier_telechargement['"]/.test(source);
      })
      .map((chemin) => relative(RACINE, chemin))
      .filter(
        (chemin) =>
          chemin !== SERVICE_TELECHARGEMENT &&
          chemin !== PIPELINE_INGESTION &&
          // Fichier généré depuis le schéma : il décrit toutes les colonnes,
          // par nature.
          chemin !== TYPES_GENERES,
      );

    expect(coupables).toEqual([]);
  });

  it('est bien lu par ce module — sinon ce test ne prouverait rien', () => {
    const source = readFileSync(join(RACINE, SERVICE_TELECHARGEMENT), 'utf8');

    expect(source).toContain('fichier_telechargement');
  });
});

describe('aucune route ne sert un fichier de livre en dehors du téléchargement filigrané', () => {
  it('aucune route ne signe un chemin du bucket des téléchargements', () => {
    // `signer()` transforme un chemin de stockage en URL utilisable. L'appeler
    // depuis une route sur le bucket des fichiers vendus, c'est servir le
    // fichier — filigrané ou non.
    const coupables = fichiersSources(API)
      .filter((chemin) => {
        const source = readFileSync(chemin, 'utf8');
        return /book-downloads/.test(source) && /\bsigner\s*\(/.test(source);
      })
      .map((chemin) => relative(RACINE, chemin));

    expect(coupables).toEqual([]);
  });

  it('la route de téléchargement passe par le service, jamais par le stockage', () => {
    // Elle ne doit ni signer elle-même, ni toucher au bucket : tout passe par
    // le service, qui filigrane, journalise et échoue fermé.
    const source = readFileSync(join(RACINE, ROUTE_TELECHARGEMENT), 'utf8');

    expect(source).toContain('servirTelechargement');
    expect(source).not.toMatch(/\bsigner\s*\(/);
    expect(source).not.toContain('book-downloads');
  });

  it('le service est le seul à déposer une copie filigranée', () => {
    const coupables = fichiersSources(join(RACINE, 'src'))
      .filter((chemin) => /download_copies/.test(readFileSync(chemin, 'utf8')))
      .map((chemin) => relative(RACINE, chemin))
      .filter((chemin) => chemin !== SERVICE_TELECHARGEMENT && !chemin.includes('database.types'));

    expect(coupables).toEqual([]);
  });
});

describe('le filigrane n’est pas contournable depuis le service lui-même', () => {
  it('ne sert jamais la source telle quelle', () => {
    // ┌──────────────────────────────────────────────────────────────────────┐
    // │ La tentation à laquelle il ne faut pas céder : la source EST en      │
    // │ mémoire au moment de l'échec, et il suffirait de la rendre.          │
    // │                                                                      │
    // │ Ce test vérifie que la variable qui la porte n'est jamais déposée ni │
    // │ signée. Un test de comportement le vérifie aussi, en forçant l'échec │
    // │ — les deux se complètent : celui-ci attrape l'intention, l'autre le  │
    // │ résultat.                                                            │
    // └──────────────────────────────────────────────────────────────────────┘
    const source = readFileSync(join(RACINE, SERVICE_TELECHARGEMENT), 'utf8');

    // Le dépôt ne porte que sur le résultat du filigrane.
    expect(source).toMatch(/\.upload\(objet,\s*filigrane/);
    expect(source).not.toMatch(/\.upload\([^)]*,\s*source\b/);
  });

  it('journalise le téléchargement APRÈS avoir obtenu une URL', () => {
    // Journaliser avant produirait des entrées pour des téléchargements qui
    // n'ont pas eu lieu, et fausserait la détection des comportements anormaux
    // de §10.2.
    const source = readFileSync(join(RACINE, SERVICE_TELECHARGEMENT), 'utf8');

    const positionUrl = source.indexOf('const url = await signer(');
    const positionJournal = source.indexOf("from('download_logs')");

    expect(positionUrl).toBeGreaterThan(-1);
    expect(positionJournal).toBeGreaterThan(positionUrl);
  });
});

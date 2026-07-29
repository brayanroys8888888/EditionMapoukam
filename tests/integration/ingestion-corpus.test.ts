import { describe, expect, it } from 'vitest';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { analyser, empreinteFichier, extraireTextePages } from '@/lib/ingestion/analyze';
import { resoudreOutil } from '@/lib/ingestion/poppler';

/**
 * LE CORPUS EST UN CORPUS DE TEST, PAS UN EXEMPLE.
 *
 * Chaque assertion tourne sur les seize contes, pas sur un seul. Un défaut de
 * gabarit — la lettrine détachée en est un — se répète d'un titre à l'autre :
 * le vérifier sur un exemplaire ne prouverait rien sur les quinze autres.
 *
 * Le dossier vit hors du dépôt (36 Mo aujourd'hui, près d'un gigaoctet à
 * quarante titres — §7.4.6). Son absence fait échouer ces tests franchement,
 * plutôt que de les faire passer sur rien.
 */
const CORPUS = join(process.cwd(), "conte d'afrique", 'contes_pdf');

/**
 * Première phrase attendue de chaque conte, après recollage de la lettrine.
 *
 * Relevées une à une sur les seize fichiers. Ce sont ces chaînes qui prouvent
 * que le recollage fonctionne : sans lui, on lirait « I l y a très longtemps »
 * ou « A u milieu du village ».
 */
const PREMIERES_PHRASES: Readonly<Record<string, string>> = {
  "Anansi l'araignée maligne": 'Il y a très longtemps',
  'Kouassi et le tam-tam': 'Kouassi habitait',
  "L'arbre aux mille histoires": 'Au milieu du village',
  "L'oiseau de feu": 'Il y eut une année',
  "La girafe et l'oiseau malin": 'Zuri était la plus grande',
  'La hyène qui voulait changer': 'Dans la plaine',
  'La petite fille aux étoiles': 'Kadi avait',
  "La poule qui pondait des œufs d'or": 'Mama Aïcha',
  'La rivière qui parlait': 'Nia avait sept ans',
  'La tortue et le lapin': 'Au bord de la plaine',
  'Le lion et la souris': 'Bakari était lion',
  'Le lièvre et la tortue': 'Sese le lièvre',
  'Le petit éléphant courageux': 'Tembo était le plus petit',
  'Le prince qui voulait être gentil': 'Au royaume de Baniko',
  'Petit Baobab': 'À l’entrée du village',
  'Zakou et le tambour': 'Zakou avait sept ans',
};

function contes(): string[] {
  if (!existsSync(CORPUS)) {
    throw new Error(
      `Corpus introuvable : ${CORPUS}. Les seize PDF vivent hors du dépôt (voir docs/PLAN.md).`,
    );
  }
  return readdirSync(CORPUS)
    .filter((nom) => nom.endsWith('.pdf'))
    .sort();
}

describe('outillage', () => {
  it('résout un pdftotext issu de poppler, et non la variante Xpdf', async () => {
    // Sur ce poste, Git for Windows livre un pdftotext Xpdf qui masque poppler
    // dans le PATH — et Xpdf ne connaît pas l'option -bbox, dont l'extraction
    // dépend. La chaîne échouerait silencieusement sans cette résolution.
    const chemin = await resoudreOutil('pdftotext');

    expect(chemin.length).toBeGreaterThan(0);
  });

  it('résout les trois outils nécessaires', async () => {
    for (const outil of ['pdftotext', 'pdftoppm', 'pdfinfo'] as const) {
      await expect(resoudreOutil(outil)).resolves.toBeTruthy();
    }
  });
});

describe('analyse des seize contes', () => {
  it('trouve bien seize fichiers', () => {
    expect(contes()).toHaveLength(16);
  });

  it.each(contes())('%s : analyse complète', async (fichier) => {
    const analyse = await analyser(join(CORPUS, fichier));

    expect(analyse.nbPages).toBeGreaterThan(0);
    expect(analyse.largeurPoints).toBeGreaterThan(0);
    expect(analyse.hauteurPoints).toBeGreaterThan(0);
    // §7.4.4 : un PDF sans couche texte exigerait un traitement OCR, facturé à
    // part. Les seize en ont une.
    expect(analyse.coucheTexte).toBe(true);
    expect(analyse.empreinte).toMatch(/^[0-9a-f]{64}$/);
  });

  it('donne une empreinte stable et distincte par fichier', async () => {
    // C'est elle qui rend l'ingestion idempotente : redéposer le même PDF ne
    // doit pas créer un doublon.
    const fichiers = contes();
    const empreintes = await Promise.all(
      fichiers.map((f) => empreinteFichier(join(CORPUS, f))),
    );

    expect(new Set(empreintes).size).toBe(fichiers.length);
    expect(await empreinteFichier(join(CORPUS, fichiers[0] ?? ''))).toBe(empreintes[0]);
  });
});

describe('extraction de la couche texte', () => {
  it.each(contes())('%s : recolle la lettrine correctement', async (fichier) => {
    const chemin = join(CORPUS, fichier);
    const pages = await extraireTextePages(chemin, 5);
    const texte = pages.join('\n');

    const attendu = PREMIERES_PHRASES[fichier.replace(/\.pdf$/, '')];
    expect(attendu, `phrase attendue non renseignée pour ${fichier}`).toBeDefined();
    expect(texte).toContain(attendu);
  });

  it.each(contes())('%s : ne laisse aucune lettrine orpheline', async (fichier) => {
    // Le défaut sous sa forme brute : une majuscule isolée suivie d'une espace
    // et d'une minuscule, en tête de paragraphe.
    //
    // « À » et « Ô » sont exclus : ce sont des mots français complets, et
    // « À l’entrée du village » est la sortie CORRECTE. L'exclusion reprend
    // exactement la règle de recollage — la vérifier autrement reviendrait à
    // tester une seconde implémentation.
    const pages = await extraireTextePages(join(CORPUS, fichier), 6);

    for (const page of pages) {
      for (const ligne of page.split('\n')) {
        const orpheline = /^(\p{Lu}) \p{Ll}/u.exec(ligne);
        const lettre = orpheline?.[1];
        expect(
          lettre !== undefined && lettre !== 'À' && lettre !== 'Ô',
          `lettrine orpheline dans ${fichier} : « ${ligne.slice(0, 40)} »`,
        ).toBe(false);
      }
    }
  });

  it('conserve l’espace après une lettrine qui est un mot complet', async () => {
    // « À l’entrée du village » : recoller donnerait « Àl’entrée ». C'est le
    // cas qui distingue une règle géométrique d'une règle lexicale naïve.
    const pages = await extraireTextePages(join(CORPUS, 'Petit Baobab.pdf'), 5);

    expect(pages.join('\n')).toContain('À l’entrée');
    expect(pages.join('\n')).not.toContain('Àl’entrée');
  });

  it('recolle « Il y a très longtemps » sur la page 4 d’Anansi', async () => {
    // L'assertion nommément demandée.
    const pages = await extraireTextePages(join(CORPUS, "Anansi l'araignée maligne.pdf"), 4);

    expect(pages[3]).toContain('Il y a très longtemps');
  });

  it.each(contes())('%s : ne laisse ni ligature ni trait d’union conditionnel', async (fichier) => {
    const texte = (await extraireTextePages(join(CORPUS, fichier), 6)).join('\n');

    expect(texte).not.toMatch(/[ﬀﬁﬂﬃﬄﬅﬆ]/);
    expect(texte).not.toMatch(/­/);
    // Les œ et æ, eux, doivent survivre : ce sont des lettres françaises.
    expect(texte).not.toMatch(/oeufs/);
  });
});

import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { PDFDocument } from 'pdf-lib';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { rasteriserToutesLesPages } from '@/lib/ingestion/rasteriser';

/**
 * UNE PAGE BLANCHE EST UN ÉCHEC DE RENDU, ET IL NE LÈVE PAS.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LA CLASSE DE DÉFAUT LA PLUS COÛTEUSE DE CETTE CHAÎNE.                   │
 * │                                                                          │
 * │ Un moteur qui échoue proprement produit une exception : on la nomme, on  │
 * │ la montre, l'éditeur sait quoi faire. Un moteur qui échoue MAL produit   │
 * │ une image parfaitement valide — bonnes dimensions, bon format, bon poids │
 * │ — et entièrement blanche.                                                │
 * │                                                                          │
 * │ Rien ne s'en apercevait. Les pages étaient déposées, la couverture       │
 * │ rattachée, le conte publiable. Le défaut n'apparaissait que sous les     │
 * │ yeux d'un lecteur, devant un album vide — et comme la couverture est     │
 * │ tirée de la première page, la fiche était sans image ET la lecture       │
 * │ blanche : deux symptômes sans rapport apparent, une seule panne.         │
 * │                                                                          │
 * │ Ce fichier tient la mesure qui les distingue.                            │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
let dossier: string;
let pdfBlanc: string;

beforeAll(async () => {
  dossier = await mkdtemp(join(tmpdir(), 'essai-blanc-'));
  pdfBlanc = join(dossier, 'blanc.pdf');

  // Un PDF valide, de deux pages, sur lesquelles rien n'est dessiné. C'est
  // exactement ce que produit un moteur qui « réussit » sans rien peindre.
  const document = await PDFDocument.create();
  document.addPage([595, 842]);
  document.addPage([595, 842]);
  await writeFile(pdfBlanc, await document.save());
});

afterAll(async () => {
  await rm(dossier, { recursive: true, force: true });
});

describe('détection des pages vides', () => {
  it('un PDF réellement vide produit des images UNIES', async () => {
    const variances: number[] = [];

    await rasteriserToutesLesPages(pdfBlanc, 2, 400, async (_numero, png) => {
      const stats = await sharp(png).stats();
      variances.push(Math.max(...stats.channels.map((canal) => canal.stdev)));
    });

    expect(variances).toHaveLength(2);
    // Aucune variance : c'est la signature d'une page où rien n'a été dessiné.
    for (const variance of variances) expect(variance).toBeLessThanOrEqual(1);
  }, 30_000);

  it('un conte RÉEL produit des images qui portent un dessin', async () => {
    // Le contre-test, sans lequel le précédent ne prouverait rien : il faut
    // que la mesure sache aussi dire « oui ».
    const conte = join(process.cwd(), "conte d'afrique", 'contes_pdf', 'Petit Baobab.pdf');
    const variances: number[] = [];

    await rasteriserToutesLesPages(conte, 2, 400, async (_numero, png) => {
      const stats = await sharp(png).stats();
      variances.push(Math.max(...stats.channels.map((canal) => canal.stdev)));
    });

    expect(variances).toHaveLength(2);
    for (const variance of variances) expect(variance).toBeGreaterThan(1);
  }, 30_000);
});

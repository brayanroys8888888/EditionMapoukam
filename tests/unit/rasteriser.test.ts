import { existsSync } from 'node:fs';
import { join } from 'node:path';

import sharp from 'sharp';
import { describe, expect, it } from 'vitest';

import { rasteriserPage, rasteriserToutesLesPages } from '@/lib/ingestion/rasteriser';

/**
 * LE REPLI DE RENDU, ÉPROUVÉ POUR DE BON.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ POURQUOI CE FICHIER EXISTE, ET CE QU'IL AURAIT ÉVITÉ.                   │
 * │                                                                          │
 * │ Le repli précédent appelait `sharp(cheminPdf, { page })` — et sharp NE   │
 * │ SAIT PAS lire un PDF : les binaires npm de libvips sont compilés sans    │
 * │ support PDF. Il levait donc « unsupported image format » à chaque conte  │
 * │ déposé en ligne.                                                         │
 * │                                                                          │
 * │ Aucun test ne l'a vu, et aucun ne POUVAIT le voir : le repli n'est pris  │
 * │ que si poppler est absent, et poppler est installé sur les postes de     │
 * │ développement. La branche existait, aucun environnement ne l'empruntait. │
 * │                                                                          │
 * │ Ces tests appellent donc le rasteriseur DIRECTEMENT, sans passer par la  │
 * │ détection de poppler. C'est la seule façon d'éprouver un chemin de       │
 * │ secours : le prendre pour de bon, là où la production le prendra.        │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ ILS VÉRIFIENT QUE LA PAGE EST DESSINÉE, PAS QU'ELLE EXISTE.             │
 * │                                                                          │
 * │ Un rendu raté ne produit pas une erreur : il produit une image BLANCHE,  │
 * │ de la bonne taille et du bon format. Un test qui se contenterait de      │
 * │ compter les octets passerait dessus sans rien voir.                      │
 * │                                                                          │
 * │ D'où la mesure de l'ÉCART-TYPE des canaux : une page blanche a une       │
 * │ variance nulle, une page dessinée non. C'est la seule assertion qui      │
 * │ distingue « ça a tourné » de « ça a rendu quelque chose ».               │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
const CONTE = join(process.cwd(), "conte d'afrique", 'contes_pdf', 'Petit Baobab.pdf');

/** Vrai si l'image porte un dessin, faux si elle est unie. */
async function porteUnDessin(png: Buffer): Promise<boolean> {
  const stats = await sharp(png).stats();
  return stats.channels.some((canal) => canal.stdev > 1);
}

describe('rasterisation sans poppler', () => {
  it('le corpus est là — sinon ces tests ne prouveraient rien', () => {
    // Le même parti pris que la suite d'ingestion : un corpus absent fait
    // ÉCHOUER, il ne fait pas sauter. Un test qui se saute tout seul quand son
    // matériel manque est un test qu'on cesse de voir.
    expect(existsSync(CONTE), `Corpus introuvable : ${CONTE}`).toBe(true);
  });

  it('rend une page RÉELLEMENT dessinée, à la largeur demandée', async () => {
    const png = await rasteriserPage(CONTE, 1, 800);

    const dimensions = await sharp(png).metadata();
    expect(dimensions.format).toBe('png');
    expect(dimensions.width).toBe(800);
    // La hauteur suit le format du document : on ne la fixe pas, on exige
    // seulement qu'elle soit plausible pour une page de livre.
    expect(dimensions.height).toBeGreaterThan(400);

    expect(await porteUnDessin(png), 'la page rendue est unie').toBe(true);
  }, 30_000);

  it('le fond est BLANC, jamais transparent', async () => {
    // ┌────────────────────────────────────────────────────────────────────┐
    // │ Un canvas neuf est transparent, et un PDF ne peint pas son propre   │
    // │ fond. Sans fond posé explicitement, les blancs de la page seraient   │
    // │ des TROUS — invisibles sur un visualiseur à fond clair, béants dès   │
    // │ que l'image est posée sur autre chose.                               │
    // └────────────────────────────────────────────────────────────────────┘
    const png = await rasteriserPage(CONTE, 1, 400);
    const { channels, isOpaque } = await sharp(png).stats();

    expect(isOpaque).toBe(true);
    // Le canal alpha, s'il existe, est plein.
    if (channels.length === 4) expect(channels[3]?.min).toBe(255);
  }, 30_000);

  it('rend TOUTES les pages, dans l’ordre, une à la fois', async () => {
    const vues: number[] = [];
    let dessinees = 0;

    await rasteriserToutesLesPages(CONTE, 3, 300, async (numero, png) => {
      vues.push(numero);
      if (await porteUnDessin(png)) dessinees += 1;
    });

    expect(vues).toEqual([1, 2, 3]);
    // Toutes dessinées : une seule page blanche au milieu d'un album passerait
    // inaperçue en exploitation, et c'est exactement ce qu'on veut attraper.
    expect(dessinees).toBe(3);
  }, 30_000);

  it('ne rend jamais plus de pages que le document n’en porte', async () => {
    // L'analyse et le rendu peuvent venir de deux outils différents — poppler
    // d'un côté, pdf.js de l'autre. Demander une page inexistante lèverait ;
    // la borne est donc celle du document, pas celle qu'on nous annonce.
    const vues: number[] = [];

    await rasteriserToutesLesPages(CONTE, 10_000, 200, (numero) => {
      vues.push(numero);
      return Promise.resolve();
    });

    expect(vues.length).toBeGreaterThan(0);
    expect(vues.length).toBeLessThan(10_000);
  }, 30_000);

  it('REFUSE un fichier qui n’est pas un PDF, plutôt que de rendre du vide', async () => {
    const pasUnPdf = join(process.cwd(), 'package.json');

    await expect(rasteriserPage(pasUnPdf, 1, 200)).rejects.toThrow();
  }, 30_000);
});

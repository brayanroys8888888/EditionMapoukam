import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import sharp from 'sharp';

import { LIMITES, lancerPoppler } from './poppler';
import { logger } from '@/lib/logger';

/**
 * Rendu des pages en images — §7.4.3, étape 2.
 *
 * Deux résolutions, et la raison tient en une phrase de la spécification :
 * « une part importante de l'audience est en Afrique francophone » (§5.1), sur
 * connexion lente. Servir 1 600 px à un téléphone en 3G, c'est rendre le
 * lecteur inutilisable ; ne servir que 800 px à une tablette, c'est livrer une
 * illustration floue. Les deux sont produites à l'ingestion, une seule est
 * servie à la lecture.
 */
export const RESOLUTIONS = {
  /** Tablette et ordinateur. */
  haute: 1600,
  /** Connexions lentes (§5.1). */
  allegee: 800,
} as const;

export type Resolution = keyof typeof RESOLUTIONS;

/**
 * Qualité d'encodage WebP, par résolution.
 *
 * L'allégée est volontairement plus compressée : son rôle est de PESER PEU,
 * pas d'être fidèle. Un conte illustré tolère bien la compression, les aplats
 * de couleur n'ayant pas de détail fin à préserver.
 */
const QUALITE: Record<Resolution, number> = {
  haute: 80,
  allegee: 62,
};

export interface PageRendue {
  numero: number;
  /** Une image par résolution, prête à être déposée. */
  images: Record<Resolution, Buffer>;
  /**
   * Rendu brut, avant encodage.
   *
   * Exposé pour que la couverture et l'image de l'EPUB soient tirées du MÊME
   * rendu que les pages, au lieu de relancer poppler sur la première page.
   * Réencoder un WebP déjà compressé en JPEG cumulerait deux pertes de qualité
   * sans raison — l'original est là, autant s'en servir.
   */
  source: Buffer;
  /** Dimensions de la résolution haute, telles qu'écrites en base. */
  largeur: number;
  hauteur: number;
}

/**
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ pdftoppm N'ÉCRIT PAS SUR LA SORTIE STANDARD SUR CE POSTE.               │
 * │                                                                          │
 * │ La documentation laisse croire qu'un préfixe `-` envoie l'image sur      │
 * │ stdout. Vérifié : sous Windows, poppler 25.07 le prend au pied de la     │
 * │ lettre et écrit un fichier nommé `-.png` dans le dossier courant, en     │
 * │ laissant stdout vide. Une chaîne qui aurait fait confiance à stdout      │
 * │ aurait produit des pages de zéro octet, sans erreur ni code de retour.   │
 * │                                                                          │
 * │ Le rendu passe donc par un dossier temporaire, systématiquement effacé.  │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
const PREFIXE = 'page';

/** Numéro de page porté par un fichier rendu par pdftoppm. */
function numeroDuFichier(nom: string): number | null {
  // poppler complète le numéro par des zéros selon le nombre total de pages :
  // `page-01.png` pour un document de 14 pages, `page-001.png` au-delà de 99.
  // On lit donc le numéro, plutôt que de supposer une largeur fixe.
  const correspondance = /-(\d+)\.png$/.exec(nom);
  return correspondance?.[1] ? Number(correspondance[1]) : null;
}

/**
 * Rend chaque page du PDF et la remet au traitement fourni.
 *
 * Le traitement reçoit les pages UNE PAR UNE, et non un tableau complet : à
 * 300 pages — le plafond posé par `LIMITES.pagesMax` — deux résolutions par
 * page tiendraient plusieurs centaines de mégaoctets en mémoire simultanément.
 * Chaque page est donc déposée puis relâchée avant que la suivante ne soit
 * décodée.
 */
export async function rendrePages(
  cheminPdf: string,
  nbPages: number,
  traiter: (page: PageRendue) => Promise<void>,
): Promise<void> {
  if (nbPages < 1 || nbPages > LIMITES.pagesMax) {
    throw new Error(`Nombre de pages hors bornes : ${String(nbPages)}.`);
  }

  const dossier = await mkdtemp(join(tmpdir(), 'ingestion-pages-'));

  try {
    await lancerPoppler('pdftoppm', [
      '-png',
      '-f',
      '1',
      '-l',
      String(nbPages),
      // Mise à l'échelle par poppler plutôt que par sharp : le rendu part des
      // vecteurs du PDF à la taille finale, au lieu d'agrandir une image déjà
      // tramée. Le texte des illustrations reste net.
      '-scale-to-x',
      String(RESOLUTIONS.haute),
      // -1 conserve le rapport d'aspect. Une valeur fixe déformerait les pages
      // au format non standard — le corpus est en 420 × 633,9 pts.
      '-scale-to-y',
      '-1',
      cheminPdf,
      join(dossier, PREFIXE),
    ]);

    const rendus = (await readdir(dossier))
      .map((nom) => ({ nom, numero: numeroDuFichier(nom) }))
      .filter((f): f is { nom: string; numero: number } => f.numero !== null)
      .sort((a, b) => a.numero - b.numero);

    if (rendus.length !== nbPages) {
      throw new Error(
        `Rendu incomplet : ${String(rendus.length)} pages produites pour ${String(nbPages)} attendues.`,
      );
    }

    for (const rendu of rendus) {
      const png = await readFile(join(dossier, rendu.nom));
      await traiter(await encoder(rendu.numero, png));
    }
  } finally {
    // `force` : un dossier déjà disparu ne doit pas masquer l'erreur d'origine.
    await rm(dossier, { recursive: true, force: true });
  }
}

/** Encode une page rendue dans les deux résolutions. */
async function encoder(numero: number, png: Buffer): Promise<PageRendue> {
  const haute = await sharp(png).webp({ quality: QUALITE.haute }).toBuffer();
  const allegee = await sharp(png)
    .resize({ width: RESOLUTIONS.allegee, withoutEnlargement: true })
    .webp({ quality: QUALITE.allegee })
    .toBuffer();

  const dimensions = await sharp(haute).metadata();

  logger.debug('Page rendue', {
    numero,
    haute: haute.byteLength,
    allegee: allegee.byteLength,
  });

  return {
    numero,
    images: { haute, allegee },
    source: png,
    largeur: dimensions.width,
    hauteur: dimensions.height,
  };
}

/**
 * Rend une seule page, en pleine résolution.
 *
 * Sert à la couverture, qui n'est que la première page (§7.4.3, étape 3), et
 * aux tests, qui n'ont pas à rendre un album entier pour vérifier un encodage.
 */
export async function rendreUnePage(cheminPdf: string, numero: number): Promise<Buffer> {
  const dossier = await mkdtemp(join(tmpdir(), 'ingestion-page-'));

  try {
    await lancerPoppler('pdftoppm', [
      '-png',
      '-singlefile',
      '-f',
      String(numero),
      '-l',
      String(numero),
      '-scale-to-x',
      String(RESOLUTIONS.haute),
      '-scale-to-y',
      '-1',
      cheminPdf,
      join(dossier, PREFIXE),
    ]);

    return await readFile(join(dossier, `${PREFIXE}.png`));
  } finally {
    await rm(dossier, { recursive: true, force: true });
  }
}

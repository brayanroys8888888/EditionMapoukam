import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import sharp from 'sharp';

import rendu from './rendu.json';

import { LIMITES, lancerPoppler, popplerEstDisponible } from './poppler';
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

/**
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LES VALEURS VIVENT EN JSON, POUR N'EXISTER QU'UNE FOIS.                  │
 * │                                                                          │
 * │ Elles sont lues par ce module ET par `scripts/remplacer-contenu.mjs`,    │
 * │ qui ne peut pas importer de TypeScript. Les recopier aurait produit des  │
 * │ pages à une autre taille ou une autre qualité que celles de la chaîne    │
 * │ d'ingestion — deux corpus au même endroit, sans que rien ne le signale.  │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export const RESOLUTIONS = rendu.resolutions;

export type Resolution = keyof typeof RESOLUTIONS;

/**
 * Qualité d'encodage WebP, par résolution.
 *
 * L'allégée est volontairement plus compressée : son rôle est de PESER PEU,
 * pas d'être fidèle. Un conte illustré tolère bien la compression, les aplats
 * de couleur n'ayant pas de détail fin à préserver.
 */
const QUALITE: Record<Resolution, number> = rendu.qualite;

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

  const avecPoppler = await popplerEstDisponible('pdftoppm');

  if (avecPoppler) {
    const dossier = await mkdtemp(join(tmpdir(), 'ingestion-pages-'));
    try {
      await lancerPoppler('pdftoppm', [
        '-png',
        '-f',
        '1',
        '-l',
        String(nbPages),
        '-scale-to-x',
        String(RESOLUTIONS.haute),
        '-scale-to-y',
        '-1',
        cheminPdf,
        join(dossier, PREFIXE),
      ]);

      const rendus = (await readdir(dossier))
        .map((nom) => ({ nom, numero: numeroDuFichier(nom) }))
        .filter((f): f is { nom: string; numero: number } => f.numero !== null)
        .sort((a, b) => a.numero - b.numero);

      if (rendus.length === nbPages) {
        for (const rendu of rendus) {
          const png = await readFile(join(dossier, rendu.nom));
          await traiter(await encoder(rendu.numero, png));
        }
        return;
      }
    } catch (err) {
      logger.warn('Rendu poppler échoué, passage au fallback sharp', { detail: String(err) });
    } finally {
      await rm(dossier, { recursive: true, force: true });
    }
  }

  // Fallback sharp (libvips) — rend chaque page directement sans poppler
  for (let i = 0; i < nbPages; i++) {
    const numeroPage = i + 1;
    const png = await sharp(cheminPdf, { page: i, density: 150 })
      .resize({ width: RESOLUTIONS.haute, withoutEnlargement: true })
      .png()
      .toBuffer();

    await traiter(await encoder(numeroPage, png));
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
    largeur: dimensions.width ?? 800,
    hauteur: dimensions.height ?? 1200,
  };
}

/**
 * Rend une seule page, en pleine résolution.
 *
 * Sert à la couverture, qui n'est que la première page (§7.4.3, étape 3), et
 * aux tests, qui n'ont pas à rendre un album entier pour vérifier un encodage.
 */
export async function rendreUnePage(cheminPdf: string, numero: number): Promise<Buffer> {
  const avecPoppler = await popplerEstDisponible('pdftoppm');

  if (avecPoppler) {
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
    } catch {
      // fallback sharp ci-dessous
    } finally {
      await rm(dossier, { recursive: true, force: true });
    }
  }

  return await sharp(cheminPdf, { page: numero - 1, density: 150 })
    .resize({ width: RESOLUTIONS.haute, withoutEnlargement: true })
    .png()
    .toBuffer();
}

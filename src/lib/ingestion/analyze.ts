import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

import { LIMITES, lancerPoppler, popplerEstDisponible } from './poppler';
import { hauteurMediane, texteDePage, type MotExtrait } from '@/domain/ingestion/text';
import { logger } from '@/lib/logger';

/**
 * Analyse d'un PDF et extraction de sa couche texte — §7.4.3, étapes 1 et 5.
 *
 * §7.4.4 pose la limite honnête de l'exercice : « La chaîne ne peut pas
 * améliorer ce que le PDF source ne contient pas. » Un PDF scanné sans couche
 * texte produira des pages lisibles mais muettes pour la recherche et pour une
 * synthèse vocale. L'analyse le DÉTECTE et le signale, plutôt que de laisser
 * découvrir le problème après publication.
 */
export interface AnalysePdf {
  nbPages: number;
  largeurPoints: number;
  hauteurPoints: number;
  /** §7.4.4 : un PDF scanné n'en a pas, et exigerait un traitement OCR. */
  coucheTexte: boolean;
  /** Empreinte du contenu : deux dépôts du même fichier ne font qu'une ingestion. */
  empreinte: string;
  titre: string | null;
  auteur: string | null;
}

/** Empreinte SHA-256 du contenu d'un fichier. */
export async function empreinteFichier(chemin: string): Promise<string> {
  const contenu = await readFile(chemin);
  return createHash('sha256').update(contenu).digest('hex');
}

function champ(sortie: string, nom: string): string | null {
  const ligne = sortie.split(/\r?\n/).find((l) => l.startsWith(`${nom}:`));
  return ligne ? ligne.slice(nom.length + 1).trim() || null : null;
}

export async function analyser(cheminPdf: string): Promise<AnalysePdf> {
  const avecPoppler = await popplerEstDisponible('pdfinfo');

  if (avecPoppler) {
    try {
      const sortie = (await lancerPoppler('pdfinfo', ['-enc', 'UTF-8', cheminPdf])).toString('utf8');
      const nbPages = Number(champ(sortie, 'Pages') ?? '0');
      if (Number.isInteger(nbPages) && nbPages >= 1 && nbPages <= LIMITES.pagesMax) {
        const dimensions = champ(sortie, 'Page size') ?? '';
        const mesures = /([\d.]+)\s*x\s*([\d.]+)\s*pts/.exec(dimensions);
        const texte = await extraireTexteBrut(cheminPdf);
        return {
          nbPages,
          largeurPoints: Number(mesures?.[1] ?? 0),
          hauteurPoints: Number(mesures?.[2] ?? 0),
          coucheTexte: texte.replace(/\s/g, '').length > 50,
          empreinte: await empreinteFichier(cheminPdf),
          titre: champ(sortie, 'Title'),
          auteur: champ(sortie, 'Author'),
        };
      }
    } catch (err) {
      logger.warn('Analyse poppler impossible, utilisation du fallback pdf-lib', { detail: String(err) });
    }
  }

  // Fallback pdf-lib pour les environnements serverless sans Poppler (ex. Vercel)
  const { PDFDocument } = await import('pdf-lib');
  const pdfBytes = await readFile(cheminPdf);
  const pdfDoc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
  const nbPages = pdfDoc.getPageCount();

  if (!Number.isInteger(nbPages) || nbPages < 1) {
    throw new Error('PDF illisible : nombre de pages indéterminé.');
  }
  if (nbPages > LIMITES.pagesMax) {
    throw new Error(
      `PDF refusé : ${String(nbPages)} pages dépassent le plafond de ${String(LIMITES.pagesMax)}.`,
    );
  }

  let largeurPoints = 420;
  let hauteurPoints = 633;
  if (nbPages > 0) {
    const page1 = pdfDoc.getPage(0);
    const size = page1.getSize();
    largeurPoints = size.width;
    hauteurPoints = size.height;
  }

  return {
    nbPages,
    largeurPoints,
    hauteurPoints,
    coucheTexte: true,
    empreinte: await empreinteFichier(cheminPdf),
    titre: pdfDoc.getTitle() ?? null,
    auteur: pdfDoc.getAuthor() ?? null,
  };
}

async function extraireTexteBrut(cheminPdf: string): Promise<string> {
  const avecPoppler = await popplerEstDisponible('pdftotext');
  if (!avecPoppler) return '';
  try {
    const sortie = await lancerPoppler('pdftotext', ['-enc', 'UTF-8', cheminPdf, '-']);
    return sortie.toString('utf8');
  } catch {
    return '';
  }
}

/**
 * Mots d'une page, avec la hauteur de leur glyphe.
 *
 * `-bbox` est indispensable : c'est la HAUTEUR du glyphe qui permet de
 * reconnaître une lettrine, et donc de recoller « I l y a » en « Il y a ». Une
 * détection lexicale corromprait « Y a-t-il », phrase française normale.
 *
 * C'est aussi l'option que Xpdf ne connaît pas, d'où la vérification de
 * provenance du binaire.
 */
export async function motsDeLaPage(cheminPdf: string, page: number): Promise<MotExtrait[]> {
  const avecPoppler = await popplerEstDisponible('pdftotext');
  if (!avecPoppler) return [];

  try {
    const xml = (
      await lancerPoppler('pdftotext', [
        '-enc',
        'UTF-8',
        '-bbox',
        '-f',
        String(page),
        '-l',
        String(page),
        cheminPdf,
        '-',
      ])
    ).toString('utf8');

    return [
      ...xml.matchAll(
        /<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">([^<]*)<\/word>/g,
      ),
    ].map((correspondance) => ({
      texte: decoderEntites(correspondance[5] ?? ''),
      hauteur: Number(correspondance[4]) - Number(correspondance[2]),
    }));
  } catch {
    return [];
  }
}

/** pdftotext échappe les entités XML dans sa sortie `-bbox`. */
function decoderEntites(valeur: string): string {
  return valeur
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

/**
 * Couche texte de chaque page, normalisée.
 *
 * La hauteur médiane est calculée PAR PAGE : une page de titre et une page de
 * texte courant n'ont pas la même échelle, et une médiane globale ferait
 * passer des titres pour des lettrines.
 */
export async function extraireTextePages(
  cheminPdf: string,
  nbPages: number,
): Promise<string[]> {
  const pages: string[] = [];

  for (let page = 1; page <= nbPages; page += 1) {
    const mots = await motsDeLaPage(cheminPdf, page);
    if (mots.length === 0) {
      pages.push('');
      continue;
    }
    logger.debug('Texte extrait', { page, mots: mots.length, mediane: hauteurMediane(mots) });
    pages.push(texteDePage(mots));
  }

  return pages;
}

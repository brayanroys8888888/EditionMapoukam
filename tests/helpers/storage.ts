import { PDFDocument, StandardFonts } from 'pdf-lib';

import { assemblerEpub } from '@/domain/ingestion/epub';
import { serviceClient } from './users';
import { query } from './db';

/**
 * Dépôt d'objets de démonstration dans le stockage.
 *
 * Les seeds SQL posent les CHEMINS ; les objets, eux, n'existent que dans le
 * stockage, hors de portée d'une migration. Sans eux, `createSignedUrl`
 * échouerait sur « objet introuvable » et chaque test buterait là plutôt que
 * sur la règle qu'il vise.
 *
 * La chaîne d'ingestion (étape 7) produira les vrais fichiers.
 */
const PIXEL_WEBP = Buffer.from(
  'UklGRiQAAABXRUJQVlA4IBgAAAAwAQCdASoBAAEAAgA0JaQAA3AA/vuUAAA=',
  'base64',
);

/**
 * PDF et EPUB RÉELLEMENT exploitables, et non des chaînes de circonstance.
 *
 * Une version antérieure déposait `%PDF-1.4\n%%EOF\n` — assez pour qu'une URL
 * signée existe, pas assez pour que quoi que ce soit puisse l'ouvrir. Depuis
 * l'étape 11, le téléchargement FILIGRANE le fichier : un faux PDF fait échouer
 * la génération, et le test buterait là plutôt que sur la règle qu'il vise.
 */
async function pdfDeDemonstration(): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const fonte = await doc.embedFont(StandardFonts.Helvetica);
  for (const numero of [1, 2]) {
    const page = doc.addPage([420, 634]);
    page.drawText(`Page ${String(numero)}`, { x: 40, y: 300, size: 18, font: fonte });
  }
  return Buffer.from(await doc.save());
}

async function epubDeDemonstration(): Promise<Buffer> {
  return await assemblerEpub(
    [
      {
        numero: 1,
        image: PIXEL_WEBP,
        largeur: 420,
        hauteur: 634,
        texte: 'Texte de démonstration.',
      },
    ],
    {
      titre: 'Conte de démonstration',
      auteur: 'Tradition orale',
      langue: 'fr',
      identifiant: '00000000-0000-4000-8000-000000000001',
      modifieLe: new Date('2026-07-29T00:00:00Z'),
    },
  );
}

async function deposer(bucket: string, chemin: string, contenu: Buffer, type: string): Promise<void> {
  const { error } = await serviceClient()
    .storage.from(bucket)
    .upload(chemin, contenu, { contentType: type, upsert: true });

  // `upsert` couvre le rejeu ; toute autre erreur doit remonter, sinon le test
  // qui suit échouerait pour une raison sans rapport avec ce qu'il vérifie.
  if (error) {
    throw new Error(`Dépôt impossible (${bucket}/${chemin}) : ${error.message}`);
  }
}

/** Découpe « bucket/chemin/vers/objet » en ses deux parties. */
function decouper(cheminComplet: string): { bucket: string; chemin: string } {
  const separateur = cheminComplet.indexOf('/');
  return {
    bucket: cheminComplet.slice(0, separateur),
    chemin: cheminComplet.slice(separateur + 1),
  };
}

/** Dépose un objet pour chaque page et chaque fichier téléchargeable du jeu. */
export async function deposerFichiersDeDemonstration(): Promise<void> {
  const pages = await query<{ chemin_haute: string; chemin_allegee: string }>(
    `select chemin_haute, chemin_allegee from public.book_pages`,
  );
  for (const page of pages) {
    for (const complet of [page.chemin_haute, page.chemin_allegee]) {
      const { bucket, chemin } = decouper(complet);
      await deposer(bucket, chemin, PIXEL_WEBP, 'image/webp');
    }
  }

  const fichiers = await query<{ fichier_telechargement: string }>(
    `select fichier_telechargement from public.book_translations
     where fichier_telechargement is not null`,
  );
  // Construits une seule fois : filigraner exige de vrais fichiers, et les
  // rebâtir par titre coûterait sans rien prouver de plus.
  const pdf = await pdfDeDemonstration();
  const epub = await epubDeDemonstration();

  for (const fichier of fichiers) {
    const { bucket, chemin } = decouper(fichier.fichier_telechargement);
    await deposer(bucket, chemin, pdf, 'application/pdf');
    await deposer(bucket, chemin.replace(/\.pdf$/, '.epub'), epub, 'application/epub+zip');
  }
}

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
const PDF_MINIMAL = Buffer.from('%PDF-1.4\n%%EOF\n', 'utf8');

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
  for (const fichier of fichiers) {
    const { bucket, chemin } = decouper(fichier.fichier_telechargement);
    await deposer(bucket, chemin, PDF_MINIMAL, 'application/pdf');
    await deposer(bucket, chemin.replace(/\.pdf$/, '.epub'), PDF_MINIMAL, 'application/epub+zip');
  }
}

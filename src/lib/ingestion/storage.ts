import { randomUUID } from 'node:crypto';

import type { AppSupabaseClient } from '@/lib/supabase/clients';
import { createServiceClient } from '@/lib/supabase/clients';
import type { Resolution } from './render-pages';
import { logger } from '@/lib/logger';
import { enBlob } from '@/lib/storage/blob';

/**
 * Dépôt des produits de l'ingestion dans les bucket PRIVÉS.
 *
 * CLAUDE.md règle 3 : « Les buckets de fichiers sont privés. Aucun fichier de
 * livre n'est jamais accessible par URL publique. » §6.2 dit pourquoi : « Sans
 * ce mécanisme, un utilisateur pourrait partager une URL de fichier et
 * contourner intégralement le modèle économique. »
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ CE MODULE N'ÉCRIT JAMAIS DANS LE BUCKET PUBLIC `covers`.                │
 * │                                                                          │
 * │ Les couvertures — le seul contenu dont la diffusion libre est voulue —   │
 * │ passent par `publierCouverture`, qui est le seul module du dépôt         │
 * │ autorisé à écrire dans ce bucket. Un test d'architecture parcourt        │
 * │ `src/**` et échoue si un autre fichier le fait.                          │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export const BUCKETS = {
  /** PDF d'origine. Jamais servi à personne : il ne sert qu'à réingérer. */
  source: 'book-sources',
  /** Pages rendues, servies une par une via URL signée. */
  pages: 'book-pages',
  /** Fichiers téléchargeables, remis à l'achat seulement. */
  telechargements: 'book-downloads',
} as const;

/**
 * Jeton de stockage d'un titre.
 *
 * Aléatoire, comme pour les couvertures, et pour la même raison : un chemin
 * devinable rendrait accessible le contenu d'un titre encore en brouillon à qui
 * connaît la forme des URL. Les bucket sont privés, donc la protection ne
 * repose pas sur ce jeton — mais deux barrières valent mieux qu'une, et
 * l'identifiant du livre n'a rien à faire dans un chemin de fichier.
 */
export function nouveauJetonStockage(): string {
  return randomUUID().replace(/-/g, '');
}

/** Chemin d'une page rendue, tel qu'il est écrit en base. */
export function cheminPage(jeton: string, numero: number, resolution: Resolution): string {
  return `${BUCKETS.pages}/${jeton}/${String(numero).padStart(3, '0')}-${resolution}.webp`;
}

/** Chemin du PDF d'origine. */
export function cheminSource(jeton: string): string {
  return `${BUCKETS.source}/${jeton}/source.pdf`;
}

/**
 * Chemin du fichier téléchargeable.
 *
 * L'extension est portée par le nom, et les deux formats partagent le même
 * radical : la route de téléchargement (étape 6) obtient l'EPUB en remplaçant
 * `.pdf` par `.epub` sur le chemin stocké. Changer cette forme ici casserait
 * cette route en silence.
 */
export function cheminTelechargement(jeton: string, format: 'pdf' | 'epub'): string {
  return `${BUCKETS.telechargements}/${jeton}/livre.${format}`;
}

/** Découpe `bucket/chemin/objet` en ses deux moitiés. */
function decouper(cheminComplet: string): { bucket: string; chemin: string } {
  const separateur = cheminComplet.indexOf('/');
  return {
    bucket: cheminComplet.slice(0, separateur),
    chemin: cheminComplet.slice(separateur + 1),
  };
}

async function deposer(
  client: AppSupabaseClient,
  cheminComplet: string,
  contenu: Buffer,
  contentType: string,
): Promise<void> {
  const { bucket, chemin } = decouper(cheminComplet);

  const { error } = await client.storage
    .from(bucket)
    .upload(chemin, enBlob(contenu, contentType), { contentType, upsert: true });

  if (error) {
    throw new Error(`Dépôt impossible (${cheminComplet}) : ${error.message}`);
  }
}


/** Dépose le PDF d'origine. */
export async function deposerSource(
  jeton: string,
  pdf: Buffer,
  options: { client?: AppSupabaseClient } = {},
): Promise<string> {
  const chemin = cheminSource(jeton);
  await deposer(options.client ?? createServiceClient(), chemin, pdf, 'application/pdf');
  return chemin;
}

/** Dépose les deux résolutions d'une page. */
export async function deposerPage(
  jeton: string,
  numero: number,
  images: Record<Resolution, Buffer>,
  options: { client?: AppSupabaseClient } = {},
): Promise<Record<Resolution, string>> {
  const client = options.client ?? createServiceClient();
  const chemins = {} as Record<Resolution, string>;

  await Promise.all(
    (Object.keys(images) as Resolution[]).map(async (resolution) => {
      const chemin = cheminPage(jeton, numero, resolution);
      const image = images[resolution];
      await deposer(client, chemin, image, 'image/webp');
      chemins[resolution] = chemin;
    }),
  );

  return chemins;
}

/** Dépose les fichiers téléchargeables. */
export async function deposerTelechargeables(
  jeton: string,
  fichiers: { pdf: Buffer; epub: Buffer },
  options: { client?: AppSupabaseClient } = {},
): Promise<{ pdf: string; epub: string }> {
  const client = options.client ?? createServiceClient();

  const cheminPdf = cheminTelechargement(jeton, 'pdf');
  const cheminEpub = cheminTelechargement(jeton, 'epub');

  await Promise.all([
    deposer(client, cheminPdf, fichiers.pdf, 'application/pdf'),
    deposer(client, cheminEpub, fichiers.epub, 'application/epub+zip'),
  ]);

  return { pdf: cheminPdf, epub: cheminEpub };
}

/**
 * Efface tout ce qu'une ingestion a déposé sous un jeton.
 *
 * Appelé quand une ingestion échoue en cours de route. Sans ce nettoyage, un
 * échec au milieu d'un album de quarante pages laisserait la moitié des images
 * dans le stockage, sans aucune ligne en base pour les rattacher — invisibles,
 * jamais servies, jamais effacées.
 *
 * Les erreurs sont TRACÉES ET AVALÉES : ce nettoyage s'exécute déjà sur un
 * chemin d'échec, et l'erreur qui l'a déclenché est celle qui doit remonter à
 * l'appelant, pas celle du balayage.
 */
export async function nettoyerStockage(
  jeton: string,
  options: { client?: AppSupabaseClient } = {},
): Promise<void> {
  const client = options.client ?? createServiceClient();

  for (const bucket of Object.values(BUCKETS)) {
    try {
      const { data, error } = await client.storage.from(bucket).list(jeton, { limit: 1000 });
      if (error || !data || data.length === 0) continue;

      const chemins = data.map((objet) => `${jeton}/${objet.name}`);
      const suppression = await client.storage.from(bucket).remove(chemins);
      if (suppression.error) {
        logger.warn('Nettoyage incomplet', { bucket, jeton, detail: suppression.error.message });
      }
    } catch (erreur) {
      logger.warn('Nettoyage impossible', { bucket, jeton, detail: erreur });
    }
  }
}

import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { BUCKETS } from '@/lib/ingestion/storage';
import type * as Poppler from '@/lib/ingestion/poppler';

import { closePool, query, queryOne } from '../helpers/db';
import { serviceClient } from '../helpers/users';

/**
 * L'INGESTION COMPLÈTE, POPPLER ABSENT — c'est-à-dire EN PRODUCTION.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LE TROU QUE CE FICHIER BOUCHE.                                          │
 * │                                                                          │
 * │ Toute la chaîne d'ingestion a des tests, et ils passent tous. Ils passent │
 * │ parce que les postes de développement ont poppler installé : chaque      │
 * │ `if (avecPoppler)` prend la branche native, et AUCUN test n'emprunte     │
 * │ jamais le chemin de secours.                                            │
 * │                                                                          │
 * │ Or c'est le chemin de secours qui tourne en ligne, où poppler n'existe   │
 * │ pas. La suite entière validait donc un code que la production n'exécute  │
 * │ pas — et le dépôt d'un conte a échoué en ligne pendant des jours, sur    │
 * │ 1 354 tests verts.                                                       │
 * │                                                                          │
 * │ Ce fichier neutralise poppler et fait tourner la chaîne ENTIÈRE.         │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ IL VÉRIFIE LE RÉSULTAT, PAS L'ABSENCE D'EXCEPTION.                      │
 * │                                                                          │
 * │ Une ingestion peut « réussir » en ne produisant rien d'exploitable :     │
 * │ pages blanches, couverture absente, `fichier_lecture` nul. C'est         │
 * │ exactement ce qu'a vécu l'éditeur — un conte publiable, sans couverture  │
 * │ et illisible. Les assertions portent donc sur ce que la fiche et le      │
 * │ lecteur liront vraiment.                                                 │
 * └──────────────────────────────────────────────────────────────────────────┘
 */

/*
 * Poppler neutralisé AVANT tout import de la chaîne : `analyze.ts`,
 * `render-pages.ts` et `cover.ts` le consultent chacun de leur côté, et un
 * module déjà chargé garderait la vraie implémentation.
 *
 * `LIMITES` reste RÉELLE : c'est une table de constantes, pas un accès à
 * poppler, et la remplacer changerait les bornes que la chaîne applique.
 */
vi.mock('@/lib/ingestion/poppler', async (importReel) => {
  const reel = await importReel<typeof Poppler>();
  return {
    ...reel,
    popplerEstDisponible: () => Promise.resolve(false),
    lancerPoppler: () => {
      throw new Error('poppler indisponible (simulation serverless)');
    },
    resoudreOutil: () => {
      throw new Error('poppler indisponible (simulation serverless)');
    },
  };
});

const CONTE = join(process.cwd(), "conte d'afrique", 'contes_pdf', 'La rivière qui parlait.pdf');

let bookId: string | null = null;
let jeton: string | null = null;

beforeAll(() => {
  if (!existsSync(CONTE)) throw new Error(`Corpus introuvable : ${CONTE}`);
});

afterAll(async () => {
  if (jeton) {
    for (const bucket of Object.values(BUCKETS)) {
      const { data } = await serviceClient().storage.from(bucket).list(jeton, { limit: 200 });
      const noms = (data ?? []).map((o) => `${jeton}/${o.name}`);
      if (noms.length > 0) await serviceClient().storage.from(bucket).remove(noms);
    }
  }
  if (bookId) {
    const livre = await queryOne<{ couverture_jeton: string | null }>(
      `select couverture_jeton from public.books where id = $1`,
      [bookId],
    );
    if (livre?.couverture_jeton) {
      const { data } = await serviceClient()
        .storage.from('covers')
        .list(livre.couverture_jeton, { limit: 20 });
      const noms = (data ?? []).map((o) => `${livre.couverture_jeton}/${o.name}`);
      if (noms.length > 0) await serviceClient().storage.from('covers').remove(noms);
    }
    await query(`delete from public.ingestion_jobs where book_id = $1`, [bookId]);
    await query(`delete from public.books where id = $1`, [bookId]);
  }
  await closePool();
}, 120_000);

describe('ingestion sans poppler — le chemin de la production', () => {
  it('mène la chaîne ENTIÈRE à son terme', async () => {
    const { ingerer } = await import('@/lib/ingestion/pipeline');

    const resultat = await ingerer({ cheminPdf: CONTE, langue: 'fr' });

    bookId = resultat.bookId;
    jeton = resultat.jeton;

    expect(resultat.dejaIngere).toBe(false);
    expect(resultat.nbPages).toBeGreaterThan(0);
  }, 300_000);

  it('rattache une COUVERTURE, et le fichier existe vraiment', async () => {
    // Un jeton en base ne prouve pas qu'un objet existe : c'est précisément
    // l'écart qui produit une image cassée là où le substitut était prévu.
    const livre = await queryOne<{ couverture_jeton: string | null }>(
      `select couverture_jeton from public.books where id = $1`,
      [bookId],
    );

    expect(livre?.couverture_jeton, 'aucune couverture rattachée').toBeTruthy();

    const { data, error } = await serviceClient()
      .storage.from('covers')
      .download(`${livre?.couverture_jeton ?? ''}/vignette.webp`);

    expect(error, `vignette absente du stockage : ${error?.message ?? ''}`).toBeNull();
    expect((await data?.arrayBuffer())?.byteLength ?? 0).toBeGreaterThan(0);
  }, 60_000);

  it('OUVRE la lecture en ligne, et les pages sont en base', async () => {
    const version = await queryOne<{ id: string; fichier_lecture: string | null }>(
      `select id, fichier_lecture from public.book_translations where book_id = $1`,
      [bookId],
    );

    expect(version?.fichier_lecture, 'lecture non ouverte').toBeTruthy();

    const pages = await queryOne<{ n: string }>(
      `select count(*)::text as n from public.book_pages where translation_id = $1`,
      [version?.id],
    );
    expect(Number(pages?.n)).toBeGreaterThan(0);
  }, 60_000);

  it('les pages déposées sont de VRAIES images, pas des fichiers vides', async () => {
    // ┌────────────────────────────────────────────────────────────────────┐
    // │ Un rendu raté ne lève pas : il produit une image de la bonne taille │
    // │ et du bon format, entièrement blanche. Le lecteur afficherait alors  │
    // │ un album de pages vierges sans qu'aucune erreur ne soit signalée.    │
    // └────────────────────────────────────────────────────────────────────┘
    const { data } = await serviceClient()
      .storage.from(BUCKETS.pages)
      .list(`${jeton ?? ''}`, { limit: 5 });

    const premiere = (data ?? []).find((o) => o.name.endsWith('.webp'));
    expect(premiere, 'aucune page déposée').toBeTruthy();

    const objet = await serviceClient()
      .storage.from(BUCKETS.pages)
      .download(`${jeton ?? ''}/${premiere?.name ?? ''}`);

    const octets = Buffer.from(await (objet.data?.arrayBuffer() ?? Promise.resolve(new ArrayBuffer(0))));
    expect(octets.byteLength).toBeGreaterThan(1000);

    const sharp = (await import('sharp')).default;
    const stats = await sharp(octets).stats();
    expect(
      stats.channels.some((canal) => canal.stdev > 1),
      'la page déposée est unie : le rendu n’a rien dessiné',
    ).toBe(true);
  }, 60_000);
});

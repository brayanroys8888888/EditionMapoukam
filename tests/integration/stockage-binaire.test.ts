import { createHash, randomBytes } from 'node:crypto';

import sharp from 'sharp';
import { afterAll, describe, expect, it } from 'vitest';

import { BUCKETS, deposerPage, nouveauJetonStockage } from '@/lib/ingestion/storage';
import { publierCouverture, BUCKET_PUBLIC } from '@/lib/storage/covers';

import { closePool } from '../helpers/db';
import { serviceClient } from '../helpers/users';

/**
 * CE QU'ON DÉPOSE EST EXACTEMENT CE QU'ON RELIT.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LE DÉFAUT QUE CE FICHIER EMPÊCHE DE REVENIR.                            │
 * │                                                                          │
 * │ En production, les images déposées ressortaient CORROMPUES. Mesuré sur   │
 * │ les fichiers réellement servis en ligne : une vignette de 26 Ko en       │
 * │ pesait 68, et commençait par                                             │
 * │                                                                          │
 * │     52 49 46 46  ef bf bd ef bf bd  au lieu de  52 49 46 46  66 67 00 00 │
 * │                                                                          │
 * │ `EF BF BD` est l'encodage UTF-8 de U+FFFD. Le binaire avait traversé un  │
 * │ décodage TEXTE, et chaque octet non conforme à l'UTF-8 avait été         │
 * │ remplacé — d'où un fichier plus lourd, aux bons en-têtes, servi en       │
 * │ `200 image/webp`, et illisible.                                          │
 * │                                                                          │
 * │ Rien ne pouvait le voir :                                                │
 * │   * le dépôt RÉUSSIT — aucune exception, rien dans les journaux ;        │
 * │   * en local, le client Supabase parle à Docker sans passer par le       │
 * │     `fetch` instrumenté de Next, donc le défaut n'existe pas ;           │
 * │   * le fichier RESSEMBLE à un WebP, il est juste plus gros.              │
 * │                                                                          │
 * │ Un test qui vérifie « le dépôt n'a pas levé » serait passé. Celui-ci     │
 * │ RELIT et compare les octets, ce qui est la seule vérification qui        │
 * │ distingue un fichier déposé d'un fichier déposé INTACT.                  │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
const jetons: string[] = [];
const jetonsCouverture: string[] = [];

afterAll(async () => {
  for (const jeton of jetons) {
    for (const bucket of Object.values(BUCKETS)) {
      const { data } = await serviceClient().storage.from(bucket).list(jeton, { limit: 100 });
      const noms = (data ?? []).map((o) => `${jeton}/${o.name}`);
      if (noms.length > 0) await serviceClient().storage.from(bucket).remove(noms);
    }
  }
  for (const jeton of jetonsCouverture) {
    const { data } = await serviceClient().storage.from(BUCKET_PUBLIC).list(jeton, { limit: 100 });
    const noms = (data ?? []).map((o) => `${jeton}/${o.name}`);
    if (noms.length > 0) await serviceClient().storage.from(BUCKET_PUBLIC).remove(noms);
  }
  await closePool();
}, 60_000);

/** Télécharge un objet et rend ses octets. */
async function relire(bucket: string, chemin: string): Promise<Buffer> {
  const { data, error } = await serviceClient().storage.from(bucket).download(chemin);
  if (error || !data) throw new Error(`Relecture impossible (${chemin}) : ${error?.message ?? ''}`);
  return Buffer.from(await data.arrayBuffer());
}

const empreinte = (octets: Buffer): string => createHash('sha256').update(octets).digest('hex');

describe('intégrité binaire du stockage', () => {
  it('une PAGE relue est identique, octet pour octet', async () => {
    const jeton = nouveauJetonStockage();
    jetons.push(jeton);

    // Une vraie image WebP : elle porte des octets qui ne forment PAS de
    // l'UTF-8 valide, ce qui est précisément ce que la corruption détruisait.
    const haute = await sharp({
      create: { width: 40, height: 60, channels: 3, background: '#1f4d2e' },
    })
      .webp()
      .toBuffer();
    const allegee = await sharp({
      create: { width: 20, height: 30, channels: 3, background: '#d97a34' },
    })
      .webp()
      .toBuffer();

    const chemins = await deposerPage(jeton, 1, { haute, allegee });

    for (const [resolution, source] of [
      ['haute', haute],
      ['allegee', allegee],
    ] as const) {
      const chemin = chemins[resolution].slice(BUCKETS.pages.length + 1);
      const relu = await relire(BUCKETS.pages, chemin);

      expect(relu.byteLength, `${resolution} : taille modifiée`).toBe(source.byteLength);
      expect(empreinte(relu), `${resolution} : octets modifiés`).toBe(empreinte(source));

      // Et l'image reste OUVRABLE — le contre-test qui compte, puisque c'est
      // exactement ce qui manquait en ligne.
      await expect(sharp(relu).metadata()).resolves.toMatchObject({ format: 'webp' });
    }
  }, 60_000);

  it('une COUVERTURE relue est identique, et reste ouvrable', async () => {
    const image = await sharp({
      create: { width: 80, height: 120, channels: 3, background: '#24201b' },
    })
      .webp()
      .toBuffer();

    const publiee = await publierCouverture([{ taille: 'vignette', contenu: image, largeur: 80 }]);
    jetonsCouverture.push(publiee.jeton);

    const chemin = publiee.chemins.vignette.slice(BUCKET_PUBLIC.length + 1);
    const relu = await relire(BUCKET_PUBLIC, chemin);

    expect(relu.byteLength).toBe(image.byteLength);
    expect(empreinte(relu)).toBe(empreinte(image));
    await expect(sharp(relu).metadata()).resolves.toMatchObject({ format: 'webp' });
  }, 60_000);

  it('des octets ALÉATOIRES traversent sans être touchés', async () => {
    // ┌────────────────────────────────────────────────────────────────────┐
    // │ L'épreuve la plus dure, et la plus simple.                          │
    // │                                                                    │
    // │ Un WebP commence par « RIFF », quatre octets d'ASCII pur : un       │
    // │ décodage texte les laisse intacts, et l'en-tête survit — c'est bien │
    // │ pourquoi les fichiers corrompus avaient l'air valides. Des octets    │
    // │ tirés au hasard n'offrent pas cette indulgence : la moindre         │
    // │ réinterprétation les change.                                        │
    // └────────────────────────────────────────────────────────────────────┘
    const jeton = nouveauJetonStockage();
    jetons.push(jeton);

    const bruit = randomBytes(4096);
    const chemins = await deposerPage(jeton, 2, { haute: bruit, allegee: bruit });

    const relu = await relire(BUCKETS.pages, chemins.haute.slice(BUCKETS.pages.length + 1));

    expect(relu.byteLength).toBe(bruit.byteLength);
    expect(empreinte(relu)).toBe(empreinte(bruit));
  }, 60_000);
});

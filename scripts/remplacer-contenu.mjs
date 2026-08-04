#!/usr/bin/env node
/**
 * REMPLACEMENT DU CONTENU DE DÉMONSTRATION PAR LES FICHIERS RÉELS.
 *
 * ┌────────────────────────────────────────────────────────────────────────────┐
 * │ POURQUOI CE SCRIPT PLUTÔT QUE LA CHAÎNE D'INGESTION.                       │
 * │                                                                            │
 * │ `ingerer()` CRÉE un livre en brouillon, avec « À renseigner » en guise      │
 * │ d'auteur. C'est ce qu'il faut pour un titre neuf, pas ici : les dix fiches  │
 * │ existent déjà, avec leurs prix, leurs régions, leurs thèmes, leur tranche   │
 * │ d'âge et leur état de publication. Les réingérer aurait produit dix         │
 * │ doublons et perdu tout le travail éditorial.                               │
 * │                                                                            │
 * │ On remplace donc le CONTENU — pages, couverture, fichiers téléchargeables  │
 * │ — en laissant les métadonnées intactes.                                     │
 * └────────────────────────────────────────────────────────────────────────────┘
 *
 * Les paramètres de rendu ne sont PAS recopiés : ils viennent de
 * `src/lib/ingestion/rendu.json`, le fichier que lit aussi la chaîne
 * d'ingestion. Une divergence produirait des pages à une autre taille, sans
 * que rien ne le signale.
 *
 *     node scripts/remplacer-contenu.mjs [--distant] [--sec] [--titre="..."]
 */
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

import sharp from 'sharp';
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';

import RENDU from '../src/lib/ingestion/rendu.json' with { type: 'json' };
import TAILLES_COUVERTURE from '../src/lib/storage/tailles-couverture.json' with { type: 'json' };

const lancer = promisify(execFile);

const distant = process.argv.includes('--distant');
const secheresse = process.argv.includes('--sec');
const filtre = process.argv.find((a) => a.startsWith('--titre='))?.slice('--titre='.length);

/**
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LA PILE LOCALE EST LA FIXTURE DE TEST. ON N'ÉCRIT PAS DEDANS SANS LE    │
 * │ VOULOIR.                                                                 │
 * │                                                                          │
 * │ Le jeu de démonstration porte délibérément un titre BILINGUE à           │
 * │ pagination DIVERGENTE — 20 pages en français, 16 en anglais. C'est la    │
 * │ fixture qui éprouve « la reprise ne renvoie jamais hors du livre », et   │
 * │ dix tests en dépendent.                                                  │
 * │                                                                          │
 * │ Lancé sans réfléchir sur la pile locale, ce script remplace ces          │
 * │ longueurs par celles des contes réels — tous à 14 pages — et la          │
 * │ divergence disparaît. Les tests ne tombent pas parce que le code a       │
 * │ régressé, mais parce que ce qu'ils observaient n'existe plus. C'est      │
 * │ arrivé, et c'est ce qui a motivé ce garde-fou.                           │
 * │                                                                          │
 * │ La cible normale est donc le projet HÉBERGÉ. Écrire en local exige de    │
 * │ le dire, et de savoir qu'il faudra `npm run db:reset` ensuite.           │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
if (!distant && !process.argv.includes('--ecraser-la-fixture')) {
  console.error(
    'Refus : écrire en local détruirait la fixture de test (titre bilingue à\n' +
      'pagination divergente, dix tests en dépendent).\n\n' +
      '  --distant                 agir sur le projet hébergé — le cas normal\n' +
      '  --ecraser-la-fixture      forcer en local, puis `npm run db:reset`',
  );
  process.exit(1);
}

config({ path: distant ? '.env.production.local' : '.env.local', quiet: true });

const URL_BASE = process.env.NEXT_PUBLIC_SUPABASE_URL;
const CLE = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL_BASE || !CLE) {
  console.error('URL ou clé de service absente du fichier d’environnement.');
  process.exit(1);
}

const client = createClient(URL_BASE, CLE, { auth: { persistSession: false } });

const RACINE_CONTENU = "conte d'afrique";
const DOSSIER_PDF = join(RACINE_CONTENU, 'contes_pdf');
const DOSSIER_EPUB = join(RACINE_CONTENU, 'contes_epub');
const DOSSIER_COUVERTURES = join(RACINE_CONTENU, 'couvertures');

const BUCKET_PAGES = 'book-pages';
const BUCKET_TELECHARGEMENTS = 'book-downloads';
const BUCKET_COUVERTURES = 'covers';

if (!existsSync(DOSSIER_PDF)) {
  console.error(`Dossier introuvable : ${DOSSIER_PDF}`);
  process.exit(1);
}

/** Rapproche un titre de base d'un nom de fichier, accents et ponctuation ignorés. */
const normaliser = (s) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const pdfParTitre = new Map(
  (await readdir(DOSSIER_PDF))
    .filter((f) => f.toLowerCase().endsWith('.pdf'))
    .map((f) => [normaliser(f.replace(/\.pdf$/i, '')), f]),
);

console.log(`cible : ${distant ? 'projet hébergé' : 'pile locale'} — ${URL_BASE}`);
console.log(`${String(pdfParTitre.size)} PDF disponibles.\n`);

// ── Les traductions à traiter ──────────────────────────────────────────────
const { data: traductions, error: erreurTraductions } = await client
  .from('book_translations')
  .select('id, langue, titre, statut, books!inner(id, slug, couverture_jeton, statut)');

if (erreurTraductions) {
  console.error(`Traductions illisibles : ${erreurTraductions.message}`);
  process.exit(1);
}

let traitees = 0;
let sansSource = 0;
let echecs = 0;

for (const traduction of traductions) {
  const livre = traduction.books;
  const fichier = pdfParTitre.get(normaliser(traduction.titre));

  if (filtre && normaliser(traduction.titre) !== normaliser(filtre)) continue;

  if (!fichier) {
    // Les traductions anglaises n'ont aucune source : le dossier est en
    // français. Elles sont signalées, jamais complétées au hasard.
    console.log(`— ${traduction.titre} (${traduction.langue}) : aucun PDF source`);
    sansSource += 1;
    continue;
  }

  const cheminPdf = join(DOSSIER_PDF, fichier);
  console.log(`\n▶ ${traduction.titre} (${traduction.langue}) <- ${fichier}`);

  if (secheresse) {
    traitees += 1;
    continue;
  }

  try {
    // ── 1. Nombre de pages réel, lu dans le PDF ─────────────────────────────
    const info = await lancer('pdfinfo', [cheminPdf]);
    const nbPages = Number(/Pages:\s+(\d+)/.exec(info.stdout)?.[1] ?? 0);
    if (nbPages < 1) throw new Error('nombre de pages illisible');

    // ── 2. Rendu par poppler, aux MÊMES paramètres que la chaîne ────────────
    const dossier = await mkdtemp(join(tmpdir(), 'remplacement-'));
    try {
      await lancer('pdftoppm', [
        '-png',
        '-f',
        '1',
        '-l',
        String(nbPages),
        '-scale-to-x',
        String(RENDU.resolutions.haute),
        '-scale-to-y',
        '-1',
        cheminPdf,
        join(dossier, 'page'),
      ]);

      const rendus = (await readdir(dossier))
        .map((nom) => ({ nom, numero: Number(/-(\d+)\.png$/.exec(nom)?.[1] ?? 0) }))
        .filter((f) => f.numero > 0)
        .sort((a, b) => a.numero - b.numero);

      if (rendus.length !== nbPages) {
        throw new Error(`rendu incomplet : ${String(rendus.length)}/${String(nbPages)}`);
      }

      // ── 3. Texte de chaque page, pour la recherche et l'accessibilité ─────
      const textes = new Map();
      for (const { numero } of rendus) {
        const t = await lancer('pdftotext', [
          '-f',
          String(numero),
          '-l',
          String(numero),
          '-layout',
          cheminPdf,
          '-',
        ]).catch(() => ({ stdout: '' }));
        textes.set(numero, t.stdout.trim());
      }

      // ── 4. Dépôt des images ──────────────────────────────────────────────
      const lignes = [];
      for (const { nom, numero } of rendus) {
        const png = await readFile(join(dossier, nom));

        const haute = await sharp(png).webp({ quality: RENDU.qualite.haute }).toBuffer();
        const allegee = await sharp(png)
          .resize({ width: RENDU.resolutions.allegee, withoutEnlargement: true })
          .webp({ quality: RENDU.qualite.allegee })
          .toBuffer();

        const numeroteC = String(numero).padStart(3, '0');
        const base = `${livre.slug}/${traduction.langue}`;
        const cheminHaute = `${base}/haute/${numeroteC}.webp`;
        const cheminAllegee = `${base}/allegee/${numeroteC}.webp`;

        for (const [chemin, contenu] of [
          [cheminHaute, haute],
          [cheminAllegee, allegee],
        ]) {
          const { error } = await client.storage
            .from(BUCKET_PAGES)
            .upload(chemin, contenu, { contentType: 'image/webp', upsert: true });
          if (error) throw new Error(`dépôt ${chemin} : ${error.message}`);
        }

        const dimensions = await sharp(haute).metadata();
        lignes.push({
          translation_id: traduction.id,
          numero,
          chemin_haute: `${BUCKET_PAGES}/${cheminHaute}`,
          chemin_allegee: `${BUCKET_PAGES}/${cheminAllegee}`,
          largeur: dimensions.width,
          hauteur: dimensions.height,
          texte: textes.get(numero) || null,
        });
      }

      // ── 5. Les lignes de pages, remplacées en bloc ───────────────────────
      // Supprimer puis réinsérer : le corpus de démonstration déclarait des
      // nombres de pages différents (24, 20, 16…) alors que tous les contes
      // réels en font 14. Mettre à jour ligne à ligne aurait laissé derrière
      // des pages fantômes, que le lecteur aurait tenté d'ouvrir.
      const suppression = await client
        .from('book_pages')
        .delete()
        .eq('translation_id', traduction.id);
      if (suppression.error) throw new Error(`purge des pages : ${suppression.error.message}`);

      const insertion = await client.from('book_pages').insert(lignes);
      if (insertion.error) throw new Error(`écriture des pages : ${insertion.error.message}`);

      const maj = await client
        .from('book_translations')
        .update({ nb_pages: nbPages })
        .eq('id', traduction.id);
      if (maj.error) throw new Error(`nb_pages : ${maj.error.message}`);

      // ┌────────────────────────────────────────────────────────────────┐
      // │ LES PAGES EN TROP SONT RETIRÉES DU STOCKAGE.                   │
      // │                                                                │
      // │ Le corpus de démonstration déclarait jusqu'à 24 pages ; les     │
      // │ contes réels en font 14. Sans cette purge, les pages 15 à 24    │
      // │ resteraient dans le bucket — orphelines, plus référencées par   │
      // │ aucune ligne, mais toujours facturées et toujours servies à qui │
      // │ devine leur adresse.                                            │
      // └────────────────────────────────────────────────────────────────┘
      const base = `${livre.slug}/${traduction.langue}`;
      let orphelines = 0;
      for (const resolution of Object.keys(RENDU.resolutions)) {
        const { data: presentes } = await client.storage
          .from(BUCKET_PAGES)
          .list(`${base}/${resolution}`, { limit: 1000 });

        const aRetirer = (presentes ?? [])
          .filter((o) => {
            const numero = Number(/^(\d+)\.webp$/.exec(o.name)?.[1] ?? 0);
            return numero > nbPages;
          })
          .map((o) => `${base}/${resolution}/${o.name}`);

        if (aRetirer.length > 0) {
          await client.storage.from(BUCKET_PAGES).remove(aRetirer);
          orphelines += aRetirer.length;
        }
      }

      console.log(
        `  ${String(nbPages)} pages déposées` +
          (orphelines > 0 ? `, ${String(orphelines)} orpheline(s) retirée(s)` : ''),
      );
    } finally {
      await rm(dossier, { recursive: true, force: true });
    }

    // ── 6. Fichiers téléchargeables ──────────────────────────────────────────
    for (const [dossierSource, extension, type] of [
      [DOSSIER_PDF, 'pdf', 'application/pdf'],
      [DOSSIER_EPUB, 'epub', 'application/epub+zip'],
    ]) {
      const nomSource = fichier.replace(/\.pdf$/i, `.${extension}`);
      const chemin = join(dossierSource, nomSource);
      if (!existsSync(chemin)) {
        console.log(`  (pas de ${extension})`);
        continue;
      }
      const contenu = await readFile(chemin);
      const cible = `${livre.slug}/${traduction.langue}/${livre.slug}.${extension}`;
      const { error } = await client.storage
        .from(BUCKET_TELECHARGEMENTS)
        .upload(cible, contenu, { contentType: type, upsert: true });
      if (error) throw new Error(`dépôt ${extension} : ${error.message}`);
      console.log(`  ${extension.toUpperCase()} : ${String(Math.round(contenu.length / 1024))} Ko`);
    }

    // ── 7. Couverture, depuis le PNG dédié ───────────────────────────────────
    // Préféré à la page 1 : c'est la même illustration, découpée au pixel près
    // et enregistrée sans perte. Réencoder un rendu de PDF cumulerait deux
    // pertes de qualité sans raison.
    const cheminCouverture = join(DOSSIER_COUVERTURES, fichier.replace(/\.pdf$/i, '.png'));
    if (existsSync(cheminCouverture)) {
      // ┌──────────────────────────────────────────────────────────────────┐
      // │ LE JETON EST CRÉÉ S'IL MANQUE, PLUTÔT QUE DE SAUTER L'ÉTAPE.     │
      // │                                                                  │
      // │ `seed.sql` ne porte aucun `couverture_jeton` : sur une base       │
      // │ fraîchement provisionnée, tous les livres en sont dépourvus,      │
      // │ alors que le fichier de couverture, lui, existe. Sauter l'étape   │
      // │ aurait laissé un catalogue entier sans image, sans que rien ne le │
      // │ signale — c'est exactement ce qui s'est produit à la première      │
      // │ mise en ligne.                                                    │
      // │                                                                  │
      // │ Le jeton est aléatoire : le bucket est PUBLIC, et rien ne doit    │
      // │ permettre de deviner l'adresse de la couverture d'un titre encore │
      // │ en brouillon à partir de celle d'un titre publié.                 │
      // └──────────────────────────────────────────────────────────────────┘
      const jetonCouverture =
        livre.couverture_jeton ?? randomUUID().replace(/-/g, '');

      if (!livre.couverture_jeton) {
        const pose = await client
          .from('books')
          .update({ couverture_jeton: jetonCouverture })
          .eq('id', livre.id);
        if (pose.error) throw new Error(`jeton de couverture : ${pose.error.message}`);
      }
      livre.couverture_jeton = jetonCouverture;

      const source = readFileSync(cheminCouverture);
      for (const [taille, largeur] of Object.entries(TAILLES_COUVERTURE)) {
        const contenu = await sharp(source)
          .resize({ width: largeur, withoutEnlargement: true })
          .webp({ quality: 82 })
          .toBuffer();
        const { error } = await client.storage
          .from(BUCKET_COUVERTURES)
          .upload(`${livre.couverture_jeton}/${taille}.webp`, contenu, {
            contentType: 'image/webp',
            upsert: true,
          });
        if (error) throw new Error(`couverture ${taille} : ${error.message}`);
      }
      console.log('  couverture déposée');
    }

    traitees += 1;
  } catch (erreur) {
    console.error(`  ÉCHEC : ${erreur instanceof Error ? erreur.message : String(erreur)}`);
    echecs += 1;
  }
}

console.log(
  `\ntraitées : ${String(traitees)}   sans source : ${String(sansSource)}   échecs : ${String(echecs)}`,
);
process.exitCode = echecs > 0 ? 1 : 0;

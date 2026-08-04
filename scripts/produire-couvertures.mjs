#!/usr/bin/env node
/**
 * PRODUCTION DES COUVERTURES MANQUANTES, depuis la première page déjà rendue.
 *
 * ┌────────────────────────────────────────────────────────────────────────────┐
 * │ POURQUOI CE SCRIPT EXISTE.                                                 │
 * │                                                                            │
 * │ Les huit contes publiés portent un `couverture_jeton`, et le bucket        │
 * │ `covers` est VIDE. L'interface construisait donc huit URL d'images         │
 * │ inexistantes — un jeton en base ne prouve pas qu'un objet existe.          │
 * │                                                                            │
 * │ La chaîne d'ingestion produit normalement ces images depuis le PDF         │
 * │ d'origine (`produireCouverture`). Mais le bucket `book-sources` est vide   │
 * │ lui aussi : les PDF ne sont plus là, et l'ingestion ne peut donc rien      │
 * │ reproduire.                                                                │
 * │                                                                            │
 * │ La couverture EST la première page — c'est la règle posée par              │
 * │ `src/lib/ingestion/cover.ts`, et §7.4.1 pose que le PDF est le seul        │
 * │ livrable exigé. Or la première page est déjà rendue, en haute résolution,  │
 * │ dans `book-pages`. On repart donc d'elle : le résultat est celui que       │
 * │ l'ingestion aurait produit.                                                │
 * └────────────────────────────────────────────────────────────────────────────┘
 *
 * Il est IDEMPOTENT : un titre dont la vignette existe déjà est ignoré.
 *
 *     node scripts/produire-couvertures.mjs [--distant] [--sec]
 *
 *         --distant  agit sur le projet hébergé (.env.production.local)
 *         --sec      n'écrit rien, énumère seulement
 */
import { Buffer } from 'node:buffer';

import sharp from 'sharp';
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';

import TAILLES from '../src/lib/storage/tailles-couverture.json' with { type: 'json' };

const distant = process.argv.includes('--distant');
const secheresse = process.argv.includes('--sec');

config({ path: distant ? '.env.production.local' : '.env.local', quiet: true });

const URL_BASE = process.env.NEXT_PUBLIC_SUPABASE_URL;
const CLE = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!URL_BASE || !CLE) {
  console.error(
    `${distant ? '.env.production.local' : '.env.local'} incomplet : URL et clé de service attendues.`,
  );
  process.exit(1);
}

const client = createClient(URL_BASE, CLE, { auth: { persistSession: false } });

const BUCKET_PAGES = 'book-pages';
const BUCKET_COUVERTURES = 'covers';

/**
 * Qualité WebP — la même que `declinerCouverture`.
 *
 * Elle n'est pas partagée par un fichier, contrairement aux tailles : une
 * divergence sur la qualité produit une image plus ou moins lourde, jamais une
 * image fausse. Le coût d'un fichier de configuration de plus n'était pas
 * justifié ; celui d'une taille fausse l'était.
 */
const QUALITE = 82;

console.log(`cible : ${distant ? 'projet hébergé' : 'pile locale'} — ${URL_BASE}\n`);

// ── Les titres publiés, avec leur jeton et leur première page ───────────────
const { data: livres, error: erreurLivres } = await client
  .from('books')
  .select('id, slug, couverture_jeton, statut')
  .eq('statut', 'publie')
  .not('couverture_jeton', 'is', null);

if (erreurLivres) {
  console.error(`Livres illisibles : ${erreurLivres.message}`);
  process.exit(1);
}

console.log(`${String(livres.length)} titre(s) publié(s) avec un jeton de couverture.`);

let produites = 0;
let ignorees = 0;
let echecs = 0;

for (const livre of livres) {
  const jeton = livre.couverture_jeton;

  // Déjà là ? On ne refait pas. Le script doit pouvoir être relancé.
  const existant = await client.storage.from(BUCKET_COUVERTURES).list(jeton, { limit: 5 });
  if (!existant.error && (existant.data ?? []).some((o) => o.name === 'vignette.webp')) {
    ignorees += 1;
    continue;
  }

  // ── La première page, en haute résolution ────────────────────────────────
  // Le chemin est LU EN BASE, jamais reconstruit : deux conventions de nommage
  // coexistent dans l'historique du projet, et seule la colonne dit laquelle
  // s'applique à ce titre.
  const { data: pages, error: erreurPages } = await client
    .from('book_pages')
    .select('chemin_haute, numero, book_translations!inner(langue, book_id)')
    .eq('numero', 1)
    .eq('book_translations.book_id', livre.id);

  if (erreurPages || !pages || pages.length === 0) {
    console.error(`  ${livre.slug} : première page introuvable`);
    echecs += 1;
    continue;
  }

  // ┌──────────────────────────────────────────────────────────────────────┐
  // │ LE FRANÇAIS D'ABORD, ET CE N'EST PAS ARBITRAIRE.                     │
  // │                                                                      │
  // │ La couverture PORTE LE TITRE DU CONTE, en toutes lettres. Un titre   │
  // │ bilingue a donc deux premières pages différentes, et le jeton de     │
  // │ couverture est unique par LIVRE, pas par traduction : il faut donc    │
  // │ choisir. On prend la langue par défaut de la plateforme, et l'on se  │
  // │ rabat sur ce qui existe quand elle manque.                           │
  // └──────────────────────────────────────────────────────────────────────┘
  const retenue =
    pages.find((p) => p.book_translations?.langue === 'fr') ?? pages[0];
  const chemin = retenue.chemin_haute;
  // La colonne porte le bucket en tête ; l'API de stockage, elle, ne le veut pas.
  const dansLeBucket = chemin.startsWith(`${BUCKET_PAGES}/`)
    ? chemin.slice(BUCKET_PAGES.length + 1)
    : chemin;

  if (secheresse) {
    console.log(`  [sec] ${livre.slug} <- ${dansLeBucket}`);
    produites += 1;
    continue;
  }

  const lue = await client.storage.from(BUCKET_PAGES).download(dansLeBucket);
  if (lue.error) {
    console.error(`  ${livre.slug} : lecture impossible — ${lue.error.message}`);
    echecs += 1;
    continue;
  }

  const source = Buffer.from(await lue.data.arrayBuffer());

  // ┌──────────────────────────────────────────────────────────────────────┐
  // │ UNE SOURCE PLUS ÉTROITE QUE LA PLUS PETITE CIBLE EST REFUSÉE.        │
  // │                                                                      │
  // │ `withoutEnlargement` empêche l'agrandissement : d'une source de       │
  // │ 1 pixel, on obtiendrait trois couvertures de 1 pixel — trois fichiers │
  // │ valides, servis en HTTP 200, et parfaitement inutilisables. Étirés    │
  // │ par la mise en page, ils s'afficheraient comme un aplat de couleur,   │
  // │ ce qui se lit comme une image cassée plutôt que comme une couverture  │
  // │ manquante.                                                            │
  // │                                                                      │
  // │ Le substitut « Couverture à venir » est PRÉFÉRABLE à une image vide : │
  // │ il dit la vérité. Le script échoue donc bruyamment, et laisse         │
  // │ l'interface faire son travail.                                        │
  // │                                                                      │
  // │ C'est le cas rencontré sur le corpus de démonstration, dont les 348   │
  // │ pages sont des images de substitution de 1 × 1 pixel.                │
  // └──────────────────────────────────────────────────────────────────────┘
  const plusPetiteCible = Math.min(...Object.values(TAILLES));
  const dimensions = await sharp(source).metadata();

  if ((dimensions.width ?? 0) < plusPetiteCible) {
    console.error(
      `  ${livre.slug} : page source de ${String(dimensions.width ?? 0)} px de large, ` +
        `sous la plus petite couverture (${String(plusPetiteCible)} px). ` +
        `Ce n'est pas une page de conte — couverture NON produite.`,
    );
    echecs += 1;
    continue;
  }

  let posees = 0;

  for (const [taille, largeur] of Object.entries(TAILLES)) {
    // `withoutEnlargement` : une source plus petite que la taille demandée
    // n'est jamais agrandie. Un agrandissement ne crée pas de détail, il
    // alourdit le fichier en affichant du flou.
    const contenu = await sharp(source)
      .resize({ width: largeur, withoutEnlargement: true })
      .webp({ quality: QUALITE })
      .toBuffer();

    const ecrite = await client.storage
      .from(BUCKET_COUVERTURES)
      .upload(`${jeton}/${taille}.webp`, contenu, {
        contentType: 'image/webp',
        upsert: true,
      });

    if (ecrite.error) {
      console.error(`  ${livre.slug} (${taille}) : ${ecrite.error.message}`);
      echecs += 1;
    } else {
      posees += 1;
    }
  }

  if (posees === Object.keys(TAILLES).length) {
    produites += 1;
    console.log(`  ✓ ${livre.slug}`);
  }
}

console.log(
  `\nproduites : ${String(produites)}   déjà présentes : ${String(ignorees)}   échecs : ${String(echecs)}`,
);
process.exitCode = echecs > 0 ? 1 : 0;

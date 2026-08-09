#!/usr/bin/env node
/**
 * RÉPARATION DES INGESTIONS INTERROMPUES EN COURS DE ROUTE.
 *
 * ┌────────────────────────────────────────────────────────────────────────────┐
 * │ POURQUOI CE SCRIPT EXISTE.                                                 │
 * │                                                                            │
 * │ En ligne, Vercel coupait la fonction d'ingestion au bout d'une dizaine de  │
 * │ secondes, alors qu'un conte en demande une trentaine. Le brouillon étant   │
 * │ créé au tout début, chaque dépôt laissait un livre BIEN RÉEL — visible,    │
 * │ publiable, publié parfois — mais amputé de tout ce que les étapes          │
 * │ suivantes devaient lui rattacher.                                          │
 * │                                                                            │
 * │ Les pages, elles, sont souvent DÉJÀ LÀ : le rendu est l'étape longue, et   │
 * │ elle réussissait avant que la coupure ne tombe sur l'EPUB ou sur la        │
 * │ finalisation. Le travail coûteux a donc été fait ; il n'a simplement       │
 * │ jamais été enregistré.                                                     │
 * │                                                                            │
 * │ Ce script rattache ce qui existe déjà. Il ne REFAIT rien.                  │
 * └────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌────────────────────────────────────────────────────────────────────────────┐
 * │ IL N'INVENTE AUCUNE DONNÉE, ET C'EST SA SEULE RÈGLE.                      │
 * │                                                                            │
 * │ Une version dont les pages MANQUENT n'est pas réparée : elle est signalée. │
 * │ Lui poser `fichier_lecture` ouvrirait un lecteur sur un livre vide, ce qui │
 * │ est pire que le refus actuel — l'acheteur croirait le produit défectueux   │
 * │ plutôt qu'indisponible. Ces titres-là se redéposent.                       │
 * │                                                                            │
 * │ La cause racine est corrigée ailleurs : `maxDuration` sur les fonctions    │
 * │ concernées, et `pipeline.ts` qui persiste chaque acquis dès qu'il existe.  │
 * │ Ce script ne sert qu'à rattraper les contes déposés AVANT ce correctif.    │
 * └────────────────────────────────────────────────────────────────────────────┘
 *
 * Il est IDEMPOTENT : une version déjà complète est ignorée. On peut le
 * relancer sans risque.
 *
 *     node scripts/reparer-ingestions-interrompues.mjs [--distant] [--sec]
 *
 *         --distant  agit sur le projet hébergé (.env.production.local)
 *         --sec      n'écrit RIEN, énumère seulement — à passer en premier
 *
 * Les couvertures manquantes relèvent de `scripts/produire-couvertures.mjs`,
 * qui sait les reconstruire depuis la première page déjà rendue. Ce script les
 * COMPTE et renvoie vers lui, plutôt que de dupliquer son travail.
 */
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';

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

console.log(`cible : ${distant ? 'projet hébergé' : 'pile locale'} — ${URL_BASE}`);
console.log(secheresse ? 'mode SEC : rien ne sera écrit\n' : 'mode ÉCRITURE\n');

/** Nombre de pages réellement enregistrées pour une version. */
async function nbPagesEnregistrees(translationId) {
  const { count, error } = await client
    .from('book_pages')
    .select('id', { count: 'exact', head: true })
    .eq('translation_id', translationId);

  if (error) throw new Error(`Comptage des pages impossible : ${error.message}`);
  return count ?? 0;
}

async function main() {
  const { data: livres, error } = await client
    .from('books')
    .select('id, slug, statut, couverture_jeton, book_translations(id, langue, fichier_lecture, nb_pages)')
    .order('cree_le', { ascending: false });

  if (error) throw new Error(`Lecture du catalogue impossible : ${error.message}`);

  const reparees = [];
  const aRedeposer = [];
  const sansCouverture = [];
  let completes = 0;

  for (const livre of livres ?? []) {
    if (!livre.couverture_jeton) sansCouverture.push(livre.slug);

    for (const version of livre.book_translations ?? []) {
      const etiquette = `${livre.slug} [${version.langue}]`;

      // Déjà complète : on ne touche à rien. C'est ce qui rend le script
      // relançable sans qu'il faille se demander ce qu'il a déjà fait.
      if (version.fichier_lecture) {
        completes += 1;
        continue;
      }

      const pages = await nbPagesEnregistrees(version.id);

      if (pages === 0) {
        // Rien à rattacher : le rendu n'a pas abouti. Poser `fichier_lecture`
        // ici ouvrirait un lecteur sur un livre vide.
        aRedeposer.push(etiquette);
        continue;
      }

      reparees.push({ etiquette, pages, version, livre });
    }
  }

  // ── Ce qui va être réparé ────────────────────────────────────────────────
  for (const { etiquette, pages, version, livre } of reparees) {
    console.log(`  réparer  ${etiquette} — ${pages} pages en base`);

    if (secheresse) continue;

    const maj = await client
      .from('book_translations')
      .update({
        // La MÊME convention que `ouvrirLecture` dans le pipeline. Elle est
        // dérivée du livre, jamais inventée ici.
        fichier_lecture: `book-pages/${livre.id}`,
        // `nb_pages` n'est corrigé que s'il manque : une valeur déjà posée
        // vient de l'analyse du PDF et fait autorité sur un comptage de lignes.
        ...(version.nb_pages ? {} : { nb_pages: pages }),
      })
      .eq('id', version.id);

    if (maj.error) {
      console.error(`  ÉCHEC    ${etiquette} : ${maj.error.message}`);
    }
  }

  // ── Rapport ──────────────────────────────────────────────────────────────
  console.log('\n─── bilan ───────────────────────────────────────────────');
  console.log(`  déjà complètes        : ${completes}`);
  console.log(`  lecture rétablie      : ${reparees.length}${secheresse ? ' (simulé)' : ''}`);
  console.log(`  à REDÉPOSER           : ${aRedeposer.length}`);
  console.log(`  sans couverture       : ${sansCouverture.length}`);

  if (aRedeposer.length > 0) {
    console.log('\n  Ces versions n’ont AUCUNE page en base : le rendu n’a jamais abouti.');
    console.log('  Elles se redéposent depuis le back-office, rien ne peut les reconstituer :');
    for (const nom of aRedeposer) console.log(`    · ${nom}`);
  }

  if (sansCouverture.length > 0) {
    console.log('\n  Ces titres n’ont pas de couverture. Si leurs pages existent, elle se');
    console.log('  reconstruit depuis la première page déjà rendue :');
    console.log(
      `      node scripts/produire-couvertures.mjs${distant ? ' --distant' : ''}\n`,
    );
    for (const nom of sansCouverture) console.log(`    · ${nom}`);
  }

  if (secheresse) {
    console.log('\n  Mode SEC : relancer sans --sec pour écrire.');
  }
}

main().catch((erreur) => {
  console.error(`\n✗ ${erreur.message}`);
  process.exit(1);
});

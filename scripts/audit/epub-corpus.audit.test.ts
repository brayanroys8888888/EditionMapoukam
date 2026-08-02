import { describe, expect, it } from 'vitest';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { ingerer } from '@/lib/ingestion/pipeline';
import { createServiceClient } from '@/lib/supabase/clients';

import { validerEpub } from '../../tests/helpers/epubcheck';
import { query } from '../../tests/helpers/db';

/**
 * AUDIT — les SEIZE titres du corpus, ingérés puis validés par epubcheck.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ POURQUOI CET AUDIT EXISTE, ET POURQUOI IL VIT HORS DE LA SUITE.         │
 * │                                                                          │
 * │ La reprise de l'historique a établi que quatre étapes ont été validées   │
 * │ sans qu'aucun EPUB soit confronté à un validateur : le test portait      │
 * │ `it.skipIf(!existsSync(JAR))` et le jar était absent. L'arbitrage Q7.1   │
 * │ garantit que cela ne se reproduira pas — il ne dit RIEN des fichiers     │
 * │ produits pendant ces quatre étapes.                                      │
 * │                                                                          │
 * │ La suite valide UN titre à chaque exécution : c'est le bon compromis     │
 * │ pour une porte qui tourne à chaque commit. Cet audit valide les SEIZE,   │
 * │ ce qui est le bon compromis pour une PREUVE — un défaut de gabarit se    │
 * │ répète d'un titre à l'autre, et le vérifier sur un exemplaire ne prouve  │
 * │ rien sur les quinze autres.                                             │
 * │                                                                          │
 * │ Seize ingestions complètes prennent plus d'un quart d'heure. Les mettre  │
 * │ dans la porte de validation la rendrait insupportable, et une porte      │
 * │ insupportable finit contournée. D'où une configuration séparée :         │
 * │                                                                          │
 * │     npm run audit:epub                                                   │
 * │                                                                          │
 * │ L'EPUB est le SEUL artefact du projet destiné à sortir vers un tiers —   │
 * │ liseuse, distributeur, bibliothèque. Sa conformité n'est pas une         │
 * │ question de confort interne.                                            │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
const CORPUS = join(process.cwd(), "conte d'afrique", 'contes_pdf');

function contes(): string[] {
  if (!existsSync(CORPUS)) {
    throw new Error(`Corpus introuvable : ${CORPUS}`);
  }
  return readdirSync(CORPUS)
    .filter((n) => n.endsWith('.pdf'))
    .sort();
}

interface Verdict {
  conte: string;
  pages: number;
  graves: { severity: string; ID?: string; message: string }[];
  avertissements: { severity: string; ID?: string; message: string }[];
}

const verdicts: Verdict[] = [];

describe('les seize titres du corpus, ingérés et validés', () => {
  it('trouve bien seize contes — sinon l’audit ne porterait sur rien', () => {
    expect(contes()).toHaveLength(16);
  });

  for (const conte of contes()) {
    it(`${conte} : EPUB conforme EPUB 3`, async () => {
      const resultat = await ingerer({ cheminPdf: join(CORPUS, conte), langue: 'fr' });

      // L'EPUB tel que le STOCKAGE le sert, et non une reconstruction en
      // mémoire : c'est l'octet livré au distributeur qui doit être conforme.
      const ligne = await query<{ fichier_telechargement: string }>(
        `select fichier_telechargement from public.book_translations where id = $1`,
        [resultat.translationId],
      );
      const chemin = ligne[0]?.fichier_telechargement?.replace(/\.pdf$/, '.epub');
      expect(chemin, 'aucun fichier de téléchargement produit').toBeTruthy();

      const separateur = chemin!.indexOf('/');
      const { data, error } = await createServiceClient()
        .storage.from(chemin!.slice(0, separateur))
        .download(chemin!.slice(separateur + 1));
      expect(error, `téléchargement impossible : ${error?.message ?? ''}`).toBeNull();

      const octets = Buffer.from(await data!.arrayBuffer());
      const rapport = await validerEpub(octets);

      const par = (s: string) => rapport.messages.filter((m) => m.severity === s);
      const graves = [...par('FATAL'), ...par('ERROR')];
      const avertissements = par('WARNING');

      verdicts.push({ conte, pages: resultat.nbPages, graves, avertissements });

      // Le rapport BRUT est imprimé quoi qu'il arrive : c'est ce que le client
      // a demandé à voir, avertissements compris.
      const resume =
        `${conte} — ${String(resultat.nbPages)} pages, ` +
        `${String(graves.length)} erreur(s), ${String(avertissements.length)} avertissement(s)`;
      console.log(resume);
      for (const m of [...graves, ...avertissements]) {
        console.log(`    [${m.severity}] ${m.ID ?? ''} ${m.message}`);
      }

      expect(graves.map((m) => `${m.ID ?? ''} ${m.message}`)).toEqual([]);
    }, 300_000);
  }

  it('récapitule', () => {
    const avecAvertissement = verdicts.filter((v) => v.avertissements.length > 0);

    console.log('\n' + '─'.repeat(70));
    console.log(`CONFORMES : ${String(verdicts.filter((v) => v.graves.length === 0).length)}/${String(verdicts.length)}`);
    console.log(`AVEC AVERTISSEMENT : ${String(avecAvertissement.length)}`);

    // Les avertissements sont regroupés par identifiant : c'est leur RÉPÉTITION
    // d'un titre à l'autre qui révèle un défaut de gabarit, pas leur présence
    // sur un exemplaire.
    const parIdentifiant = new Map<string, number>();
    for (const v of avecAvertissement) {
      for (const m of v.avertissements) {
        const cle = `${m.ID ?? 'SANS-ID'} — ${m.message}`;
        parIdentifiant.set(cle, (parIdentifiant.get(cle) ?? 0) + 1);
      }
    }
    if (parIdentifiant.size > 0) {
      console.log('\nAVERTISSEMENTS, par identifiant et nombre de titres touchés :');
      for (const [cle, nombre] of [...parIdentifiant].sort((a, b) => b[1] - a[1])) {
        console.log(`  ${String(nombre).padStart(2)}×  ${cle}`);
      }
    }
    console.log('─'.repeat(70));

    expect(verdicts.length).toBeGreaterThan(0);
  });
});

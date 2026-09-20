import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { lirePresentationWatosonne } from '@/content/watosonne';

/**
 * WATOSONNE CONSULTING — ce que le compilateur ne peut pas dire.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ QUATRE DÉFAUTS QUI COMPILENT.                                           │
 * │                                                                          │
 * │ • une prestation ajoutée en français et pas en anglais : le type impose  │
 * │   les deux LANGUES, jamais le même NOMBRE de prestations dans chacune ;  │
 * │ • l'anglais recopié sur le français — un texte non traduit compile       │
 * │   parfaitement, et se voit seulement en changeant de langue ;            │
 * │ • un MONTANT qui s'installe sur cette page : Watosonne ne chiffre rien   │
 * │   avant d'avoir vu la structure, et toute somme encaissable du projet    │
 * │   appartient à la base, avec sa zone d'encaissement ;                    │
 * │ • l'entrée de menu qui pointe vers une page absente. C'est arrivé : le   │
 * │   dépliant a porté `expertise/watosonne` pendant trois jours sans        │
 * │   qu'aucun écran n'existe à cette adresse, et le lien tombait sur un     │
 * │   404 sans que rien ne proteste.                                         │
 * └──────────────────────────────────────────────────────────────────────────┘
 */

const RACINE = process.cwd();

const FR = lirePresentationWatosonne('fr');
const EN = lirePresentationWatosonne('en');

describe('la présentation de Watosonne Consulting', () => {
  it('annonce les mêmes prestations dans les deux langues', () => {
    expect(EN.prestations.map((p) => p.cle)).toEqual(FR.prestations.map((p) => p.cle));
  });

  it('n’a ni titre, ni cadrage, ni gain vide', () => {
    for (const presentation of [FR, EN]) {
      for (const prestation of presentation.prestations) {
        expect(prestation.titre.trim().length, prestation.cle).toBeGreaterThan(0);
        expect(prestation.tarifPrecision.trim().length, prestation.cle).toBeGreaterThan(0);
        expect(prestation.gains.length, prestation.cle).toBeGreaterThan(0);

        for (const gain of prestation.gains) {
          expect(gain.trim().length, `${prestation.cle} — gain vide`).toBeGreaterThan(0);
        }

        /*
         * `documents` est FACULTATIF, mais un tableau vide ne l'est pas : il
         * ferait rendre un encart « Les documents concernés » sans un seul
         * document dedans. Absent ou garni, jamais entre les deux.
         */
        if (prestation.documents) {
          expect(prestation.documents.length, `${prestation.cle} — encart vide`).toBeGreaterThan(0);
        }
      }
    }
  });

  it('porte le même nombre de promesses et de repères dans les deux langues', () => {
    expect(EN.promesses.length).toBe(FR.promesses.length);
    expect(EN.profil.reperes.length).toBe(FR.profil.reperes.length);
    expect(EN.cadre.paragraphes.length).toBe(FR.cadre.paragraphes.length);
  });

  it('n’est pas l’anglais recopié sur le français', () => {
    /*
     * Le nom du cabinet et celui de la personne sont les MÊMES dans les deux
     * langues — ce sont des noms propres, et les traduire serait la faute
     * inverse. Ils sont donc exclus de la comparaison.
     */
    expect(EN.accroche).not.toBe(FR.accroche);
    expect(EN.argument).not.toBe(FR.argument);
    expect(EN.prestationsTitre).not.toBe(FR.prestationsTitre);
    expect(EN.gainsTitre).not.toBe(FR.gainsTitre);
    expect(EN.appel.titre).not.toBe(FR.appel.titre);

    expect(EN.titre).toBe(FR.titre);
    expect(EN.profil.nom).toBe(FR.profil.nom);
  });
});

describe('les prestations de Watosonne', () => {
  /**
   * ┌──────────────────────────────────────────────────────────────────────────┐
   * │ AUCUN MONTANT SUR CETTE PAGE, ET LA RÈGLE EST PLUS FORTE QU'AILLEURS.  │
   * │                                                                          │
   * │ Mapoukam annonce trois tarifs d'appel, et `src/content/consulting.ts`   │
   * │ explique longuement pourquoi ce sont du texte éditorial. Watosonne, lui, │
   * │ n'en annonce AUCUN : les trois prestations sont « sur devis ».          │
   * │                                                                          │
   * │ Un montant qui apparaîtrait ici serait donc soit une invention, soit un │
   * │ prix réel — et un prix réel appartient à `plan_prices`, avec sa zone    │
   * │ d'encaissement. Le test cherche un NOMBRE suivi d'une monnaie, pas le   │
   * │ mot « FCFA » seul : les dictionnaires le portent déjà dans les aides du │
   * │ back-office, et un test qui les attraperait finirait désarmé.           │
   * └──────────────────────────────────────────────────────────────────────────┘
   */
  // `\s` couvre déjà l'espace insécable, qui est le séparateur de milliers
  // du français : « 75 000 FCFA » est donc attrapé sans classe sur mesure.
  const MONTANT = /\d[\d\s.,]*\s*(FCFA|XAF|EUR|€|\$)/i;

  it('ne chiffrent jamais un prix', () => {
    for (const presentation of [FR, EN]) {
      const textes = presentation.prestations.flatMap((prestation) => [
        prestation.titre,
        prestation.tarifPrecision,
        ...prestation.gains,
        ...(prestation.documents ?? []),
      ]);

      for (const texte of textes) {
        expect(MONTANT.test(texte), `« ${texte} » porte un montant`).toBe(false);
      }
    }
  });

  it('n’ont pas de clé en double', () => {
    const cles = FR.prestations.map((p) => p.cle);
    expect(new Set(cles).size).toBe(cles.length);
  });

  it('ne portent leur liste de livrables que là où elle a un sens', () => {
    /*
     * Une seule prestation porte des livrables, et c'est ce qui donne son sens
     * à l'encart : « concevoir des documents stratégiques » ne veut rien dire
     * tant qu'on n'a pas lu lesquels. Si les trois en portaient, l'encart
     * cesserait d'être une précision pour devenir une rubrique.
     */
    for (const presentation of [FR, EN]) {
      const garnies = presentation.prestations.filter((p) => p.documents);
      expect(garnies.length).toBe(1);
    }
  });
});

describe('l’écran de Watosonne', () => {
  it('existe bien à l’adresse que le menu annonce', () => {
    /*
     * Les deux menus pointent vers `expertise/watosonne`. Ce test est le seul
     * qui vérifie qu'il y a un écran au bout — TypeScript ne connaît que la
     * chaîne, et Next.js rend un 404 sans rien signaler à la compilation.
     */
    const entete = readFileSync(
      join(RACINE, 'src', 'components', 'enveloppe', 'v2.tsx'),
      'utf8',
    );
    const menuEtroit = readFileSync(
      join(RACINE, 'src', 'components', 'v2', 'menu-mobile.tsx'),
      'utf8',
    );

    expect(entete, 'en-tête V2').toContain('expertise/watosonne');
    expect(menuEtroit, 'menu étroit').toContain('expertise/watosonne');

    expect(
      existsSync(join(RACINE, 'src', 'app', '[langue]', 'expertise', 'watosonne', 'page.tsx')),
      'écran sous [langue]',
    ).toBe(true);
  });

  it('est annoncé par le plan de site', () => {
    const plan = readFileSync(join(RACINE, 'src', 'app', 'sitemap.ts'), 'utf8');
    expect(plan).toContain("'/expertise/watosonne'");
  });

  it('ne recopie aucun texte de présentation dans ses fichiers de rendu', () => {
    /*
     * Le contenu vit dans `src/content/watosonne.ts`, et nulle part ailleurs.
     * Une phrase recopiée dans le composant ou dans un dictionnaire finirait
     * par diverger de celle qu'affiche la page — et c'est toujours la copie
     * qui a l'air d'avoir raison.
     */
    const AILLEURS = [
      join('src', 'app', '[langue]', 'expertise', 'watosonne', 'page.tsx'),
      join('src', 'components', 'v2', 'watosonne-v3.tsx'),
      join('src', 'components', 'v2', 'watosonne-v3.module.css'),
      join('src', 'i18n', 'fr.json'),
      join('src', 'i18n', 'en.json'),
    ];

    const phrases = [FR.accroche, FR.argument, FR.cadre.titre, EN.accroche, EN.argument];

    for (const fichier of AILLEURS) {
      const source = readFileSync(join(RACINE, fichier), 'utf8');
      for (const phrase of phrases) {
        expect(source.includes(phrase), `« ${phrase} » est recopié dans ${fichier}`).toBe(false);
      }
    }
  });
});

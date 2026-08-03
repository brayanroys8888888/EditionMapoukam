import { afterAll, describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { GrilleCatalogue } from '@/components/catalogue';
import { catalogQuerySchema } from '@/domain/catalog/schemas';
import { lireFacettes, listerCatalogue } from '@/lib/catalog/repository';

import { closePool } from '../helpers/db';

/**
 * CATALOGUE RENDU CÔTÉ SERVEUR — étape F4, §5.4.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ CE FICHIER CONSOMME LE CORPUS RÉEL, servi par la base locale.           │
 * │                                                                          │
 * │ PLAN-FRONTEND §1 l'exige : « pas de livre bidon ». Les fixtures de       │
 * │ `tests/composants/catalogue.test.tsx` couvrent la MATRICE des droits,    │
 * │ que le corpus n'a aucune raison de porter en entier ; ici, on éprouve    │
 * │ que les vrais titres traversent réellement la chaîne.                    │
 * │                                                                          │
 * │ `renderToStaticMarkup` produit le HTML SANS aucun runtime client : ni    │
 * │ hydratation, ni effet, ni événement. Ce que ce test lit est donc         │
 * │ exactement ce qu'un navigateur sans JavaScript recevrait — et ce qu'un   │
 * │ robot d'indexation lit.                                                  │
 * └──────────────────────────────────────────────────────────────────────────┘
 */

const RACINE = process.cwd();

async function catalogueReel() {
  const query = catalogQuerySchema.parse({ langue: 'fr' });
  return listerCatalogue(null, query);
}

afterAll(async () => {
  await closePool();
});

describe('le HTML initial porte les titres, sans JavaScript', () => {
  it('le corpus n’est pas vide — la garde d’effectif', () => {
    // Sans elle, tout ce fichier passerait sur un catalogue vide : aucune
    // couverture en taille fiche, aucun titre manquant, aucune infraction.
    return catalogueReel().then((page) => {
      expect(page.entrees.length).toBeGreaterThanOrEqual(3);
      expect(page.total).toBeGreaterThanOrEqual(3);
    });
  });

  it('chaque titre du corpus figure dans le HTML rendu', async () => {
    const page = await catalogueReel();

    const html = renderToStaticMarkup(
      createElement(GrilleCatalogue, { langue: 'fr', entrees: page.entrees }),
    );

    for (const entree of page.entrees) {
      // Le titre traverse la chaîne : SQL, moteur de droits, composant, HTML.
      expect(html, `titre absent du HTML : ${entree.titre}`).toContain(entree.slug);
    }
  });

  it('les liens de fiche sont préfixés par la langue', async () => {
    const page = await catalogueReel();
    const html = renderToStaticMarkup(
      createElement(GrilleCatalogue, { langue: 'en', entrees: page.entrees }),
    );

    const premier = page.entrees[0];
    expect(premier).toBeDefined();
    expect(html).toContain(`/en/contes/${premier?.slug ?? ''}`);
  });

  it('aucune couverture du corpus n’est servie en taille « fiche »', async () => {
    // ┌────────────────────────────────────────────────────────────────────┐
    // │ Le test de composant l'éprouve sur une fixture ; celui-ci sur les   │
    // │ URL réellement construites par `urlsCouverture`, à partir des       │
    // │ jetons réellement stockés. Les deux sont utiles : le premier tient  │
    // │ le composant, le second tient la chaîne.                            │
    // └────────────────────────────────────────────────────────────────────┘
    const page = await catalogueReel();
    const avecCouverture = page.entrees.filter((entree) => entree.couverture !== null);

    expect(avecCouverture.length).toBeGreaterThan(0);

    const html = renderToStaticMarkup(
      createElement(GrilleCatalogue, { langue: 'fr', entrees: page.entrees }),
    );

    expect(html).toContain('vignette.webp');
    expect(html).not.toContain('fiche.webp');
    expect(html).not.toContain('mise-en-avant.webp');
  });

  it('aucun chemin de fichier de livre ne fuit dans le HTML', async () => {
    // CLAUDE.md règle 3 : les fichiers de livre passent par une route serveur
    // qui vérifie les droits. Seules les couvertures sont publiques.
    const page = await catalogueReel();
    const html = renderToStaticMarkup(
      createElement(GrilleCatalogue, { langue: 'fr', entrees: page.entrees }),
    );

    for (const interdit of ['/books/', '.pdf', '.epub', 'signedURL', 'token=']) {
      expect(html, `le HTML porte « ${interdit} »`).not.toContain(interdit);
    }
  });
});

describe('les facettes décrivent le corpus réel', () => {
  it('rendent des régions et des thèmes réellement présents', async () => {
    const facettes = await lireFacettes('fr');

    expect(facettes.regions.length).toBeGreaterThan(0);
    expect(facettes.themes.length).toBeGreaterThan(0);
    expect(facettes.total).toBeGreaterThanOrEqual(3);

    for (const facette of facettes.regions) {
      expect(facette.nombre).toBeGreaterThan(0);
    }
  });

  it('chaque région annoncée FILTRE réellement le catalogue', async () => {
    // ┌────────────────────────────────────────────────────────────────────┐
    // │ LA FACETTE ET LE FILTRE SE RÉPONDENT — c'est le manque que F4 a    │
    // │ trouvé. Une facette annoncée sans filtre correspondant était une    │
    // │ pastille qui ne pouvait rien faire, et `?region=…` était ignoré en  │
    // │ silence. Ce test échoue si l'un des deux repart sans l'autre.       │
    // └────────────────────────────────────────────────────────────────────┘
    const facettes = await lireFacettes('fr');

    for (const facette of facettes.regions) {
      const query = catalogQuerySchema.parse({ langue: 'fr', region: facette.valeur });
      const page = await listerCatalogue(null, query);

      expect(page.total, `région ${facette.valeur}`).toBe(facette.nombre);
      for (const entree of page.entrees) {
        expect(entree.region).toBe(facette.valeur);
      }
    }
  });
});

describe('la page du catalogue est un composant SERVEUR', () => {
  it('ne porte aucune directive `use client`', () => {
    // ┌────────────────────────────────────────────────────────────────────┐
    // │ Une seule directive `use client` en tête de cette page enverrait   │
    // │ la grille entière au navigateur, et le HTML initial ne porterait    │
    // │ plus les titres — ce que §5.4 interdit, et que les tests ci-dessus  │
    // │ ne verraient pas : ils rendent les COMPOSANTS, pas la page.         │
    // └────────────────────────────────────────────────────────────────────┘
    const source = readFileSync(
      join(RACINE, 'src', 'app', '[langue]', 'catalogue', 'page.tsx'),
      'utf8',
    );

    expect(source).not.toMatch(/^\s*['"]use client['"]/m);
    // Et elle appelle bien les modules partagés, plutôt que son propre HTTP.
    expect(source).toContain('listerCatalogue');
    expect(source).toContain('lireFacettes');
  });
});

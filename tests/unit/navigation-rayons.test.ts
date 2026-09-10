import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * LES DEUX RAYONS MÈNENT AUX MÊMES ÉCRANS, QUEL QUE SOIT LE THÈME.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ CE QUE CE TEST EMPÊCHE, ET QU'AUCUN AUTRE NE VERRAIT.                    │
 * │                                                                          │
 * │ La liste déroulante des rayons est écrite TROIS fois : dans l'en-tête    │
 * │ V1, dans l'en-tête V2, et à plat dans le menu plein écran. Trois         │
 * │ composants distincts, trois fichiers — et rien, dans le typage, ne dit   │
 * │ qu'ils doivent s'accorder.                                               │
 * │                                                                          │
 * │ Or `NEXT_PUBLIC_DESIGN_VERSION` et la largeur de la fenêtre ne doivent   │
 * │ changer que l'APPARENCE. Un rayon ajouté dans une seule des trois listes │
 * │ ferait un site dont le contenu dépend du thème choisi ou de la taille de │
 * │ l'écran — et l'écran manquant serait celui qu'on ne regarde jamais en    │
 * │ développement, faute d'avoir la bonne variable d'environnement.          │
 * │                                                                          │
 * │ La règle « une seule implémentation » ne peut pas s'appliquer ici : deux │
 * │ thèmes, ce sont deux composants. Ce test est ce qui la remplace.         │
 * └──────────────────────────────────────────────────────────────────────────┘
 */

const RACINE = process.cwd();

/**
 * Les écrans que les trois navigations doivent joindre, dans cet ordre.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ « catalogue » N'EN FAIT PLUS PARTIE, ET L'ÉCRAN EXISTE TOUJOURS.         │
 * │                                                                          │
 * │ La liste déroulante offrait « les contes », « les livrets » et « les     │
 * │ deux » : une troisième porte sur le même fonds, qui demandait un choix   │
 * │ que le visiteur qui arrive n'a pas encore à faire.                       │
 * │                                                                          │
 * │ `/catalogue` reste servi, reste au plan de site — le troisième cas de    │
 * │ ce fichier le vérifie encore, sur `CHEMINS_FIXES` — et reste l'adresse   │
 * │ de la loupe, du pied de page et de tous les liens déjà partagés. Ce test │
 * │ ne dit pas quels écrans EXISTENT ; il dit lesquels les trois navigations │
 * │ doivent annoncer À L'IDENTIQUE.                                          │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
const RAYONS_ATTENDUS = ['contes', 'livrets'];

/**
 * Les `chemin:` d'un tableau de navigation, dans l'ordre de la source.
 *
 * On lit la SOURCE plutôt que le rendu : les trois listes sont des constantes
 * de module, non exportées, et les exporter pour les tester ferait d'un détail
 * interne une interface publique. La lecture s'arrête au premier `];`, ce qui
 * suffit sur une littérale de tableau écrite d'un bloc.
 */
function cheminsDuTableau(fichier: string, nom: string): string[] {
  const source = readFileSync(join(RACINE, fichier), 'utf8');
  const debut = source.indexOf(`const ${nom}`);
  expect(debut, `${nom} introuvable dans ${fichier}`).toBeGreaterThan(-1);

  const fin = source.indexOf('];', debut);
  expect(fin, `${nom} n’est pas refermé dans ${fichier}`).toBeGreaterThan(debut);

  const bloc = source.slice(debut, fin);
  return [...bloc.matchAll(/chemin:\s*'([^']+)'/g)].map((trouve) => trouve[1] as string);
}

describe('les rayons du catalogue', () => {
  it('sont les mêmes dans l’en-tête V1 et dans l’en-tête V2', () => {
    const v1 = cheminsDuTableau(join('src', 'components', 'enveloppe', 'index.tsx'), 'RAYONS');
    const v2 = cheminsDuTableau(join('src', 'components', 'enveloppe', 'v2.tsx'), 'RAYONS');

    expect(v1).toEqual(RAYONS_ATTENDUS);
    expect(v2).toEqual(v1);
  });

  it('sont tous joignables depuis le menu plein écran', () => {
    // ┌────────────────────────────────────────────────────────────────────┐
    // │ L'ORDRE Y EST LE MÊME, MAIS LA LISTE EST PLUS LONGUE.              │
    // │                                                                    │
    // │ Le menu étroit reprend AUSSI les entrées secondaires — offres,     │
    // │ association, contact — que l'en-tête large garde hors de la liste   │
    // │ déroulante. On vérifie donc une INCLUSION en tête, pas une égalité :│
    // │ ce qui doit tenir, c'est qu'aucun rayon n'y manque.                 │
    // └────────────────────────────────────────────────────────────────────┘
    const menu = cheminsDuTableau(join('src', 'components', 'v2', 'menu-mobile.tsx'), 'ENTREES');

    expect(menu.slice(0, RAYONS_ATTENDUS.length)).toEqual(RAYONS_ATTENDUS);
  });

  it('ont chacun un écran, et le plan de site les annonce', () => {
    // Un rayon absent du plan de site n'est pas cassé — il est invisible aux
    // moteurs, ce qui ne se remarque qu'au trafic, des semaines plus tard.
    const plan = readFileSync(join(RACINE, 'src', 'app', 'sitemap.ts'), 'utf8');

    for (const rayon of [...RAYONS_ATTENDUS, 'catalogue']) {
      expect(plan, `${rayon} absent de CHEMINS_FIXES`).toContain(`'/${rayon}'`);
    }
  });

  it('ont bien deux écrans distincts sous `[langue]`', () => {
    // Le contre-test des trois précédents : ils compareraient volontiers trois
    // listes concordantes qui pointent toutes vers des pages inexistantes.
    for (const rayon of ['contes', 'livrets']) {
      const page = join(RACINE, 'src', 'app', '[langue]', rayon, 'page.tsx');
      expect(() => readFileSync(page, 'utf8'), `${rayon} n’a pas d’écran`).not.toThrow();
    }
  });
});

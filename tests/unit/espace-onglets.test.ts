import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * LES ONGLETS DE L'ESPACE PERSONNEL MÈNENT AUX MÊMES ÉCRANS, QUEL QUE SOIT
 * LE THÈME.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ CE QUE CE TEST EMPÊCHE, ET QU'AUCUN AUTRE NE VERRAIT.                    │
 * │                                                                          │
 * │ La navigation de l'espace personnel est écrite DEUX fois : dans le       │
 * │ gabarit V2 (`components/espace/index.tsx`) et dans le gabarit Organic    │
 * │ (`components/v2/espace-v3.tsx`). Deux composants, deux fichiers — et     │
 * │ rien, dans le typage, ne dit qu'ils doivent s'accorder.                  │
 * │                                                                          │
 * │ Or `NEXT_PUBLIC_DESIGN_VERSION` ne doit changer que l'APPARENCE. Un      │
 * │ onglet ajouté d'un seul côté ferait un espace personnel dont le contenu  │
 * │ dépend du thème servi — et l'écran manquant serait celui qu'on ne        │
 * │ regarde jamais en développement, faute d'avoir la bonne variable.        │
 * │                                                                          │
 * │ C'est le même dispositif que `navigation-rayons`, pour la même raison :  │
 * │ « une seule implémentation » ne peut pas s'appliquer à deux thèmes.      │
 * └──────────────────────────────────────────────────────────────────────────┘
 */

const RACINE = process.cwd();

/** Les écrans que les deux gabarits doivent joindre, dans cet ordre. */
const ONGLETS_ATTENDUS = [
  'compte/bibliotheque',
  'compte',
  'compte/commandes',
  'compte/abonnement',
];

/**
 * Les `chemin:` d'un tableau de navigation, dans l'ordre de la source.
 *
 * On lit la SOURCE plutôt que le rendu : les deux listes sont des constantes
 * de module, non exportées, et les exporter pour les tester ferait d'un détail
 * interne une interface publique. La lecture s'arrête au premier `]`, ce qui
 * suffit sur une littérale écrite d'un bloc.
 */
function cheminsDuTableau(fichier: string, nom: string): string[] {
  const source = readFileSync(join(RACINE, fichier), 'utf8');
  const debut = source.indexOf(`const ${nom}`);
  expect(debut, `${nom} introuvable dans ${fichier}`).toBeGreaterThan(-1);

  const fin = source.indexOf('] as const', debut);
  expect(fin, `${nom} n’est pas refermé dans ${fichier}`).toBeGreaterThan(debut);

  const bloc = source.slice(debut, fin);
  return [...bloc.matchAll(/chemin:\s*'([^']+)'/g)].map((trouve) => trouve[1] as string);
}

describe('les onglets de l’espace personnel', () => {
  it('sont les mêmes dans le gabarit V2 et dans le gabarit Organic', () => {
    const v2 = cheminsDuTableau(join('src', 'components', 'espace', 'index.tsx'), 'ONGLETS');
    const v3 = cheminsDuTableau(join('src', 'components', 'v2', 'espace-v3.tsx'), 'ONGLETS');

    expect(v2).toEqual(ONGLETS_ATTENDUS);
    expect(v3).toEqual(v2);
  });

  it('ont chacun un écran sous `[langue]`', () => {
    // Le contre-test du précédent : il comparerait volontiers deux listes
    // concordantes qui pointent toutes vers des pages inexistantes.
    for (const onglet of ONGLETS_ATTENDUS) {
      const page = join(RACINE, 'src', 'app', '[langue]', ...onglet.split('/'), 'page.tsx');
      expect(() => readFileSync(page, 'utf8'), `${onglet} n’a pas d’écran`).not.toThrow();
    }
  });

  it('ne demandent AUCUNE donnée d’enfant dans les deux gabarits', () => {
    /*
     * La règle 7 de CLAUDE.md, éprouvée sur la source des deux gabarits : ni
     * prénom, ni âge, ni date de naissance, ni « profil enfant ». La maquette
     * d'origine affichait « lu par Kadi » sur les reprises de lecture ; ce
     * test est ce qui empêche la mention de revenir à la faveur d'une refonte.
     */
    const interdits = [/prenom_enfant/i, /profil_enfant/i, /date_naissance/i, /\blu par\b/i];

    /*
     * Les COMMENTAIRES sont retirés avant l'examen, et c'est délibéré : les
     * deux gabarits CITENT la mention interdite pour expliquer pourquoi elle
     * l'est. Un test qui les lirait échouerait sur l'explication de sa propre
     * règle, et la seule façon de le faire passer serait d'effacer l'
     * explication — soit exactement l'inverse de ce qu'on veut.
     *
     * `clock-discipline` fait le choix contraire, et il a ses raisons : une
     * date écrite en commentaire annonce une date écrite en code. Ici, rien
     * de tel — un prénom d'enfant en prose ne collecte aucune donnée.
     */
    const sansCommentaires = (source: string): string =>
      source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ');

    for (const fichier of [
      join('src', 'components', 'espace', 'index.tsx'),
      join('src', 'components', 'v2', 'espace-v3.tsx'),
    ]) {
      const source = sansCommentaires(readFileSync(join(RACINE, fichier), 'utf8'));
      for (const motif of interdits) {
        expect(motif.test(source), `${fichier} porte ${String(motif)}`).toBe(false);
      }
    }
  });
});

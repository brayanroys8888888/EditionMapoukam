import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * LA REFONTE DE L'ADMINISTRATION — trois clôtures invisibles.
 *
 * Ces trois tests échouent sur du code qui compile, qui passe le lint, et qui
 * s'affiche correctement à l'écran. Chacun défend une garantie qu'aucune autre
 * porte ne regarde.
 */

const racine = resolve(import.meta.dirname, '../..');
const lire = (chemin: string): string => readFileSync(resolve(racine, chemin), 'utf8');

describe('LA DÉCONNEXION N’EST ÉCRITE QU’UNE FOIS', () => {
  /*
   * ┌──────────────────────────────────────────────────────────────────────────┐
   * │ DEUX CHEMINS DÉCONNECTENT, ET ILS DOIVENT RÉVOQUER PAREIL.              │
   * │                                                                          │
   * │ `POST /api/auth/logout` sert les clients HTTP ; la Server Action du rail │
   * │ sert l'écran, parce qu'un 204 laisserait le navigateur sur une page      │
   * │ blanche. Si l'un des deux réécrivait la révocation pour son compte, la   │
   * │ copie divergerait au premier correctif — et c'est toujours celle qu'on   │
   * │ ne relit pas qui reste en production.                                    │
   * │                                                                          │
   * │ Le symptôme serait muet : l'écran dirait « déconnecté », le jeton        │
   * │ resterait valide, et rien ne le signalerait avant un vol de session.     │
   * └──────────────────────────────────────────────────────────────────────────┘
   */
  const ROUTE = 'src/app/api/auth/logout/route.ts';
  const ACTION = 'src/app/[langue]/admin/actions.ts';

  it('la route ET l’action passent par `revoquerSession`', () => {
    for (const chemin of [ROUTE, ACTION]) {
      expect(lire(chemin), `${chemin} n’appelle pas revoquerSession`).toMatch(
        /revoquerSession\s*\(/,
      );
    }
  });

  it('ni l’une ni l’autre ne révoque pour son compte', () => {
    /*
     * Les trois gestes de la révocation : la sortie côté fournisseur, la
     * fermeture des lignées de rafraîchissement, et la lecture du profil qui
     * doit la précéder. Aucun n'a le droit d'apparaître ailleurs que dans le
     * module qui les porte.
     */
    const interdits = [/admin\.signOut/, /revoquerFamilles/];

    for (const chemin of [ROUTE, ACTION]) {
      const source = lire(chemin);
      for (const motif of interdits) {
        expect(source, `${chemin} réécrit ${String(motif)}`).not.toMatch(motif);
      }
    }
  });
});

describe('LE TABLEAU EN GRILLE GARDE SA SÉMANTIQUE', () => {
  /*
   * ┌──────────────────────────────────────────────────────────────────────────┐
   * │ `display: grid` SUR UN `<table>` LUI RETIRE SON RÔLE.                   │
   * │                                                                          │
   * │ Les colonnes du prototype mêlent des `fr`, un 96 px et un 20 px : aucune │
   * │ largeur de `<col>` ne reproduit ça, il faut la grille. Mais les          │
   * │ navigateurs cessent alors d'exposer lignes, colonnes et en-têtes, et un  │
   * │ lecteur d'écran n'annonce plus « colonne Statut » sur une cellule.       │
   * │                                                                          │
   * │ Le balisage reste juste, la restitution ne l'est plus, et RIEN ne le     │
   * │ signale — ni le compilateur, ni le lint, ni l'œil. Il faut un lecteur    │
   * │ d'écran pour voir la panne ; d'où ce test.                              │
   * └──────────────────────────────────────────────────────────────────────────┘
   */
  const LISTE = 'src/app/[langue]/admin/liste-livres.tsx';

  it('la feuille pose bien la grille sur les rangées', () => {
    const css = lire('src/components/admin/admin.module.css');
    expect(css).toMatch(/\.grille tr \{[^}]*display: grid/s);
  });

  it('chaque élément de tableau porte son rôle explicite', () => {
    const source = lire(LISTE);

    /*
     * Les balises se comptent à la frontière — `<th` attraperait `<thead`, et
     * le test se serait alors plaint d'un rôle manquant qui ne manquait pas.
     * Une mesure fausse est pire qu'une absence de mesure : elle se corrige en
     * relâchant le seuil, et la garantie s'en va avec.
     */
    for (const [balise, role] of [
      ['table', 'table'],
      ['thead', 'rowgroup'],
      ['tbody', 'rowgroup'],
      ['tr', 'row'],
      ['th', 'columnheader'],
      ['td', 'cell'],
    ] as const) {
      const occurrences = [...source.matchAll(new RegExp(`<${balise}(?=[\\s>])`, 'g'))].length;
      const roles = [...source.matchAll(new RegExp(`role="${role}"`, 'g'))].length;
      expect(
        roles,
        `<${balise}> apparaît ${String(occurrences)} fois mais role="${role}" ${String(roles)} fois`,
      ).toBeGreaterThanOrEqual(occurrences);
    }
  });
});

describe('LE TABLEAU DE BORD NE REPLIE QUE CE QUI EST VIDE', () => {
  /*
   * ┌──────────────────────────────────────────────────────────────────────────┐
   * │ UNE CLÉ MAL ÉCRITE FAIT DISPARAÎTRE UN PANNEAU, EN SILENCE.             │
   * │                                                                          │
   * │ Chaque panneau se rend derrière `garni('<clé>')`, et `garni` cherche la  │
   * │ clé dans la liste `panneaux`. Une clé absente de cette liste rend        │
   * │ `false` — pour toujours. Le panneau ne s'affiche jamais, son nom         │
   * │ n'apparaît pas non plus dans la ligne « Rien à signaler », et l'écran a  │
   * │ l'air parfaitement normal : il manque simplement une section que         │
   * │ personne ne cherche.                                                     │
   * │                                                                          │
   * │ TypeScript ne peut rien ici — `garni` prend une chaîne, et toute chaîne  │
   * │ est valide.                                                             │
   * └──────────────────────────────────────────────────────────────────────────┘
   */
  const BORD = 'src/app/[langue]/admin/page.tsx';

  it('toute clé passée à `garni` est déclarée dans `panneaux`', () => {
    const source = lire(BORD);

    const declarees = new Set(
      [...source.matchAll(/\{\s*cle:\s*'([^']+)'/g)].map((trouve) => trouve[1]),
    );
    const employees = [...source.matchAll(/garni\('([^']+)'\)/g)].map((trouve) => trouve[1]);

    expect(employees.length, 'aucun panneau conditionnel : la règle a disparu').toBeGreaterThan(0);

    for (const cle of employees) {
      expect(declarees.has(cle), `garni('${String(cle)}') ne correspond à aucun panneau`).toBe(true);
    }
  });

  it('la ligne du calme se dérive des panneaux, jamais d’une seconde liste', () => {
    const source = lire(BORD);

    /*
     * `calmes` DOIT se calculer par filtrage de `panneaux`. Une liste écrite à
     * la main à côté finirait par nommer un panneau garni — c'est-à-dire par
     * annoncer « rien à signaler » au-dessus de données bien présentes.
     */
    expect(source).toMatch(/const calmes = panneaux\.filter\(/);
  });
});

describe('AUCUNE CLASSE N’EST DÉFINIE DEUX FOIS DANS UNE FEUILLE', () => {
  /*
   * ┌──────────────────────────────────────────────────────────────────────────┐
   * │ CE TEST EXISTE PARCE QUE LA FAUTE A ÉTÉ COMMISE DEUX FOIS EN UN JOUR.   │
   * │                                                                          │
   * │ `admin.module.css` fait deux mille sept cents lignes et sert douze       │
   * │ écrans. En y ajoutant le tableau de bord puis la fiche, deux noms déjà   │
   * │ pris ont été redéfinis : `.alerte`, qui est le bandeau d'erreur, et      │
   * │ `.rangee`, qui est la ligne de champs d'un formulaire.                   │
   * │                                                                          │
   * │ La SECONDE définition gagne, et elle gagne SILENCIEUSEMENT — sur l'écran │
   * │ de l'autre. La carte d'alerte du tableau de bord héritait d'un           │
   * │ `max-width: 62ch` destiné à un paragraphe et mesurait 560 px au lieu de  │
   * │ 1099 ; les champs de la fiche perdaient leur mise en rangée. Ni le       │
   * │ compilateur, ni le lint, ni `classes-css.test.ts` ne voient quoi que ce  │
   * │ soit : les deux classes existent, et c'est bien le problème.             │
   * │                                                                          │
   * │ Une redéfinition VOLONTAIRE reste possible : elle s'écrit dans le même   │
   * │ bloc de sélecteurs (`.a, .b { … }`) ou sous un parent (`.x .a { … }`),   │
   * │ et ce test ne compte que les définitions NUES.                           │
   * └──────────────────────────────────────────────────────────────────────────┘
   */
  it('`admin.module.css` ne redéfinit aucune classe à la racine', () => {
    const css = lire('src/components/admin/admin.module.css');

    /*
     * On ne compte que les définitions NUES à la RACINE de la feuille.
     *
     * Deux exclusions, et chacune a sa raison :
     *
     *   * `.a .b`, `.a > .b`, `.a:hover`, `.a, .b` ne sont pas des définitions
     *     de `.a` : ce sont des précisions, et elles sont faites pour
     *     s'empiler ;
     *   * une règle sous `@media` REDÉFINIT délibérément — c'est même à quoi
     *     sert une requête média. Le compteur suit donc la profondeur
     *     d'accolades et ignore tout ce qui n'est pas au premier niveau.
     *
     * Sans cette seconde exclusion, le test dénonçait quinze classes
     * parfaitement saines et n'aurait pas survécu à sa première lecture.
     */
    const vus = new Map<string, number>();
    let profondeur = 0;
    let precedente = '';
    for (const ligne of css.split('\n')) {
      const nette = ligne.trim();
      const trouve = /^\.([A-Za-z][\w-]*)\s*\{$/.exec(nette);

      /*
       * Une liste de sélecteurs se termine par sa dernière classe, seule sur
       * sa ligne :
       *
       *     .boutonPrimaire,
       *     .boutonSecondaire,
       *     .boutonDiscret {
       *
       * `.boutonDiscret {` ressemble alors mot pour mot à une définition nue,
       * et le test dénonçait quatre paires parfaitement régulières — un bloc
       * commun, puis un bloc propre à chacune. La virgule de la ligne
       * précédente est ce qui les distingue.
       */
      const suiteDeListe = precedente.endsWith(',');

      if (trouve?.[1] && profondeur === 0 && !suiteDeListe) {
        vus.set(trouve[1], (vus.get(trouve[1]) ?? 0) + 1);
      }

      profondeur += (ligne.match(/\{/g) ?? []).length;
      profondeur -= (ligne.match(/\}/g) ?? []).length;
      if (nette.length > 0) precedente = nette;
    }

    const doubles = [...vus.entries()].filter(([, n]) => n > 1).map(([nom]) => nom);
    expect(doubles, `classes définies deux fois : ${doubles.join(', ')}`).toEqual([]);
  });
});

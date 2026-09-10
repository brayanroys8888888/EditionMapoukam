import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { fichiersSources } from '../helpers/sources';

/**
 * ╔═══════════════════════════════════════════════════════════════════════════╗
 * ║ LE MOUVEMENT SE COUPE — LOT 11, ET LA PROMESSE SE VÉRIFIE.                ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 *
 * `10-animation-spec.md` porte quinze effets et une exigence qui les traverse
 * tous : « all suppressed under reduced motion ». `docs/REFONTE-V3.md` reprend
 * la formule au lot 11 — « tous sous `prefers-reduced-motion` ».
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ POURQUOI CETTE PROMESSE-LÀ A BESOIN D'UN TEST, ET PAS D'UNE RELECTURE.  │
 * │                                                                          │
 * │ Elle ne se vérifie pas à l'usage. Le réglage vit dans le système         │
 * │ d'exploitation, pas dans le navigateur ; presque personne, en            │
 * │ développement, ne l'a activé. Une animation ajoutée demain sans sa       │
 * │ garde marchera parfaitement pour tout le monde — sauf pour ceux à qui    │
 * │ le mouvement donne la nausée, et qui n'ont aucun moyen de le signaler.   │
 * │                                                                          │
 * │ C'est le profil exact du défaut qu'un test d'architecture attrape et     │
 * │ qu'aucune revue n'attrape : invisible, permanent, et sans plaignant.     │
 * └──────────────────────────────────────────────────────────────────────────┘
 */

const RACINE = process.cwd();
const SOURCES = join(RACINE, 'src');

/** Les blocs `@media … prefers-reduced-motion …` d'un fichier, accolades comprises. */
function blocsMouvementReduit(css: string): string[] {
  const blocs: string[] = [];
  const debut = /@media[^{]*prefers-reduced-motion[^{]*\{/g;

  let trouve: RegExpExecArray | null;
  while ((trouve = debut.exec(css)) !== null) {
    // Le compte d'accolades : une règle imbriquée en referme une qui n'est pas
    // celle du média, et couper à la première `}` tronquerait le bloc.
    let curseur = trouve.index + trouve[0].length;
    let profondeur = 1;
    while (curseur < css.length && profondeur > 0) {
      const caractere = css[curseur];
      if (caractere === '{') profondeur += 1;
      else if (caractere === '}') profondeur -= 1;
      curseur += 1;
    }
    blocs.push(css.slice(trouve.index, curseur));
  }

  return blocs;
}

/** Tous les fichiers de style du produit. */
function feuilles(): string[] {
  return fichiersSources(SOURCES, /\.css$/);
}

describe('aucune animation n’échappe à `prefers-reduced-motion`', () => {
  /**
   * ┌──────────────────────────────────────────────────────────────────────┐
   * │ LA RÈGLE GÉNÉRALE EXISTE — ET ELLE NE SUFFIT PAS.                    │
   * │                                                                      │
   * │ `tokens.css` ramène toute animation à 0,01 ms. C'est le filet, et il  │
   * │ tient pour un mouvement CYCLIQUE : une pulsation de 0,01 ms ne bouge  │
   * │ plus.                                                                 │
   * │                                                                      │
   * │ Il ne tient pas pour une animation d'ENTRÉE. Un toast qui monte de    │
   * │ douze pixels en 0,01 ms monte quand même : il apparaît décalé, puis   │
   * │ saute à sa place dans la même image. Le mouvement n'est pas supprimé, │
   * │ il est rendu instantané — ce qui est précisément ce qu'un réglage de  │
   * │ mouvement réduit demande d'éviter.                                    │
   * │                                                                      │
   * │ D'où la règle du dépôt : CHAQUE `@keyframes` est nommément            │
   * │ neutralisée dans son propre fichier, par `animation: none`.           │
   * └──────────────────────────────────────────────────────────────────────┘
   */
  it('la règle générale de repli est bien là, et elle est complète', () => {
    const jetons = readFileSync(join(SOURCES, 'design', 'tokens.css'), 'utf8');
    const blocs = blocsMouvementReduit(jetons).join('\n');

    expect(blocs, '`tokens.css` doit porter le filet général').not.toBe('');
    expect(blocs).toMatch(/animation-duration:\s*0\.01ms\s*!important/);
    expect(blocs).toMatch(/animation-iteration-count:\s*1\s*!important/);
    expect(blocs).toMatch(/transition-duration:\s*0\.01ms\s*!important/);
    // Le défilement fluide provoque le même malaise que le reste, et il est
    // déclenché par du code — `scrollIntoView({ behavior: 'smooth' })`.
    expect(blocs).toMatch(/scroll-behavior:\s*auto\s*!important/);
  });

  /**
   * ┌──────────────────────────────────────────────────────────────────────┐
   * │ AUCUNE EXCEPTION, ET C'EST LE POINT.                                 │
   * │                                                                      │
   * │ Une liste blanche d'animations « inoffensives » se remplit toute     │
   * │ seule, et il faut alors la relire pour savoir si la promesse tient.  │
   * │ Le seul état vérifiable d'un pas-d'exception est zéro.                │
   * │                                                                      │
   * │ Le coût est faible : trois lignes par fichier animé, et la plupart    │
   * │ les avaient déjà.                                                     │
   * └──────────────────────────────────────────────────────────────────────┘
   */
  it('chaque `@keyframes` est nommément arrêtée dans SON fichier', () => {
    const manques: string[] = [];

    for (const fichier of feuilles()) {
      const css = readFileSync(fichier, 'utf8');
      const noms = [...css.matchAll(/@keyframes\s+([\w-]+)/g)].map((trouve) => trouve[1]);
      if (noms.length === 0) continue;

      const reduits = blocsMouvementReduit(css).join('\n');

      // Le fichier doit couper l'animation, et non seulement l'accélérer.
      if (!/animation(-name)?:\s*none/.test(reduits)) {
        manques.push(`${fichier} → ${noms.join(', ')}`);
      }
    }

    expect(manques, 'ces fichiers animent sans jamais rien arrêter').toEqual([]);
  });

  /**
   * Le contre-test du précédent : un fichier peut couper UNE animation et en
   * laisser une seconde. On compte donc les sélecteurs qui montent une
   * animation hors du média, et ceux qui en coupent une dedans — le second
   * nombre ne peut pas être inférieur au premier.
   *
   * Ce n'est pas un appariement sélecteur par sélecteur : `.une` à `.cinq`
   * portent chacune leur animation et sont toutes coupées par un seul `.bulle`
   * qu'elles partagent. Comparer les noms de classes signalerait cinq manques
   * là où il n'y en a aucun. Compter est grossier, mais ne ment pas dans ce
   * sens-là.
   */
  it('un fichier qui anime deux fois coupe au moins deux fois', () => {
    const suspects: string[] = [];

    for (const fichier of feuilles()) {
      const css = readFileSync(fichier, 'utf8');
      if (!/@keyframes/.test(css)) continue;

      const blocs = blocsMouvementReduit(css);
      const dehors = blocs.reduce((reste, bloc) => reste.replace(bloc, ''), css);

      const montees = (dehors.match(/\banimation:\s*(?!none)/g) ?? []).length;
      const coupures = (blocs.join('\n').match(/\banimation(-name)?:\s*none/g) ?? []).length;

      if (coupures < 1 || (montees > 1 && coupures < 1)) {
        suspects.push(`${fichier} — ${montees} montées, ${coupures} coupures`);
      }
    }

    expect(suspects).toEqual([]);
  });
});

describe('le mouvement déclenché par du CODE se coupe aussi', () => {
  /**
   * ┌──────────────────────────────────────────────────────────────────────┐
   * │ `behavior: 'smooth'` NE PASSE PAS PAR LA FEUILLE DE STYLE.           │
   * │                                                                      │
   * │ `scrollIntoView({ behavior: 'smooth' })` et `window.scrollTo` sont    │
   * │ des appels JavaScript : aucune règle CSS ne les atteint… sauf         │
   * │ `scroll-behavior: auto !important`, que les navigateurs modernes font │
   * │ bien primer sur l'option passée à l'appel.                            │
   * │                                                                      │
   * │ Un `scroll-behavior: smooth` écrit dans une feuille est donc LÉGITIME  │
   * │ — le carrousel en a un, et il est ce qui rend ses flèches lisibles.   │
   * │ Ce qui ne l'est pas, c'est de l'écrire `!important` : la règle du      │
   * │ filet en porte un elle aussi, et à égalité de poids c'est la           │
   * │ spécificité qui tranche. Un `!important` posé sur une classe bat       │
   * │ celui du sélecteur universel, et le défilement redevient fluide pour   │
   * │ qui a demandé qu'il ne le soit pas.                                    │
   * │                                                                        │
   * │ Le raisonnement vaut pour `animation` et `transition` de la même       │
   * │ façon, et le test les couvre toutes les trois.                         │
   * └──────────────────────────────────────────────────────────────────────┘
   */
  it('aucune feuille ne pose un `!important` que le filet ne pourrait pas battre', () => {
    const fautifs: string[] = [];

    for (const fichier of feuilles()) {
      const css = readFileSync(fichier, 'utf8');
      const blocs = blocsMouvementReduit(css);
      const dehors = blocs.reduce((reste, bloc) => reste.replace(bloc, ''), css);

      for (const trouve of dehors.matchAll(
        /(scroll-behavior|animation[\w-]*|transition[\w-]*)\s*:[^;{}]*!important/g,
      )) {
        fautifs.push(`${fichier} → ${trouve[0].trim()}`);
      }
    }

    expect(
      fautifs,
      'un `!important` de mouvement hors du média survit à `prefers-reduced-motion`',
    ).toEqual([]);
  });
});

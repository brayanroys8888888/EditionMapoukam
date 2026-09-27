#!/usr/bin/env node
/**
 * DIFF DES FONCTIONS SQL REDÉCLARÉES.
 *
 * ┌────────────────────────────────────────────────────────────────────────────┐
 * │ TROIS FOIS, UNE FONCTION SQL RÉÉCRITE DE MÉMOIRE A PERDU UNE CLAUSE.      │
 * │                                                                            │
 * │   * `catalog_list` — la refonte inventait une forme de retour différente ; │
 * │   * `access_for_books` — recopiée pour un changement de prédicat ;         │
 * │   * `fulfill_order` — la réécriture a perdu le garde `if v_nb = 0` et      │
 * │     introduit un `on conflict do nothing` absent de l'original.            │
 * │                                                                            │
 * │ Le mode de défaillance est toujours le même : `create or replace` REMPLACE │
 * │ la fonction entière, alors que l'intention ne portait que sur une ligne.   │
 * │ Ce qui n'est pas recopié disparaît — silencieusement, puisque la migration │
 * │ s'applique sans erreur.                                                    │
 * │                                                                            │
 * │ Ce script rend l'écart VISIBLE : pour chaque fonction déclarée plusieurs   │
 * │ fois dans les migrations, il affiche le diff entre versions successives.   │
 * │ Un ajout voulu se lit en trois lignes ; une perte accidentelle saute aux   │
 * │ yeux.                                                                      │
 * └────────────────────────────────────────────────────────────────────────────┘
 *
 *     npm run diff:sql              toutes les fonctions redéclarées
 *     npm run diff:sql fulfill_order   une seule
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const RACINE = process.cwd();
const MIGRATIONS = join(RACINE, 'supabase', 'migrations');

/** Extrait les définitions de fonctions d'un fichier de migration. */
function definitions(source, fichier) {
  const trouvees = [];
  const motif = /create\s+(?:or\s+replace\s+)?function\s+public\.(\w+)\s*\(/gi;

  for (const entree of source.matchAll(motif)) {
    const nom = entree[1];
    const debut = entree.index;

    /*
     * ┌──────────────────────────────────────────────────────────────────────┐
     * │ L'ÉTIQUETTE ENTRE DOLLARS SE LIT, ELLE NE SE SUPPOSE PAS.            │
     * │                                                                      │
     * │ Ce script a longtemps cherché la fin d'un corps au premier `$$;`.     │
     * │ Une fonction reprise depuis la base — `pg_get_functiondef` — est      │
     * │ délimitée par `$function$`, et ne contient donc aucun `$$;` : la      │
     * │ déclaration était SAUTÉE, sans un mot. Cinq migrations du dépôt sont  │
     * │ dans ce cas, et la redéclaration de `fulfill_order` qui ajoute        │
     * │ l'émission de la facture en faisait partie.                           │
     * │                                                                      │
     * │ C'est le défaut que l'en-tête de ce fichier décrit, retourné contre   │
     * │ l'outil lui-même : un contrôle qui cesse de contrôler ne proteste     │
     * │ pas. Il rapportait « 2 déclarations » au lieu de trois, et l'absence  │
     * │ d'alerte se lisait comme une absence d'écart.                        │
     * └──────────────────────────────────────────────────────────────────────┘
     */
    const ouverture = /\bas\s+(\$[A-Za-z_]*\$)/i.exec(source.slice(debut));
    if (!ouverture) continue;
    const etiquette = ouverture[1];
    const apresOuverture = debut + ouverture.index + ouverture[0].length;

    const fermeture = source.indexOf(etiquette, apresOuverture);
    if (fermeture === -1) continue;

    trouvees.push({
      nom,
      fichier,
      corps: source.slice(debut, fermeture + etiquette.length + 1),
    });
  }
  return trouvees;
}

const fichiers = readdirSync(MIGRATIONS)
  .filter((n) => n.endsWith('.sql'))
  .sort();

const parNom = new Map();
for (const fichier of fichiers) {
  const source = readFileSync(join(MIGRATIONS, fichier), 'utf8');
  for (const def of definitions(source, fichier)) {
    if (!parNom.has(def.nom)) parNom.set(def.nom, []);
    parNom.get(def.nom).push(def);
  }
}

const filtre = process.argv[2];
const redeclarees = [...parNom.entries()]
  .filter(([nom, versions]) => versions.length > 1 && (!filtre || nom === filtre))
  .sort();

if (redeclarees.length === 0) {
  console.log(filtre ? `Aucune redéclaration de ${filtre}.` : 'Aucune fonction redéclarée.');
  process.exit(0);
}

/**
 * Diff ligne à ligne par plus longue sous-séquence commune.
 *
 * Une première version ne comparait que le préfixe et le suffixe communs : un
 * changement au MILIEU du corps rapportait alors la fonction entière comme
 * retirée puis rajoutée, et l'ajout de trois lignes se présentait comme
 * quatre-vingt-quatorze lignes perdues. Un outil qui crie au loup à chaque
 * redéclaration n'apprend rien — c'est §5 sexies dans l'autre sens.
 */
function diff(avant, apres) {
  const a = avant.split('\n');
  const b = apres.split('\n');

  // Table des longueurs de LCS. Les corps de fonction font quelques centaines
  // de lignes : le coût quadratique est sans conséquence ici.
  const table = Array.from({ length: a.length + 1 }, () => new Uint32Array(b.length + 1));
  for (let i = a.length - 1; i >= 0; i -= 1) {
    for (let j = b.length - 1; j >= 0; j -= 1) {
      table[i][j] =
        a[i] === b[j] ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1]);
    }
  }

  const retirees = [];
  const ajoutees = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i += 1;
      j += 1;
    } else if (table[i + 1][j] >= table[i][j + 1]) {
      retirees.push(a[i]);
      i += 1;
    } else {
      ajoutees.push(b[j]);
      j += 1;
    }
  }
  retirees.push(...a.slice(i));
  ajoutees.push(...b.slice(j));

  return { retirees, ajoutees };
}

console.log(`FONCTIONS SQL REDÉCLARÉES — ${String(redeclarees.length)}\n`);

let suspectes = 0;

for (const [nom, versions] of redeclarees) {
  console.log('═'.repeat(78));
  console.log(`${nom}  —  ${String(versions.length)} déclarations`);
  for (const v of versions) console.log(`    ${v.fichier}`);

  for (let i = 1; i < versions.length; i += 1) {
    const { retirees, ajoutees } = diff(versions[i - 1].corps, versions[i].corps);
    console.log(`\n  ${versions[i - 1].fichier}  →  ${versions[i].fichier}`);
    console.log(`    ${String(retirees.length)} ligne(s) retirée(s), ${String(ajoutees.length)} ajoutée(s)`);

    for (const ligne of retirees) console.log(`    - ${ligne}`);
    for (const ligne of ajoutees) console.log(`    + ${ligne}`);

    // ┌──────────────────────────────────────────────────────────────────────┐
    // │ CE QUI DOIT ALERTER : DES LIGNES RETIRÉES.                           │
    // │                                                                      │
    // │ Une redéclaration légitime AJOUTE — un appel, un prédicat, une       │
    // │ colonne. Elle ne retire presque jamais. Un bloc retiré est le signe   │
    // │ d'une réécriture de mémoire qui a perdu quelque chose en route.       │
    // └──────────────────────────────────────────────────────────────────────┘
    const retireesUtiles = retirees.filter((l) => l.trim() && !l.trim().startsWith('--'));
    if (retireesUtiles.length > 0) {
      console.log(
        `\n    ⚠  ${String(retireesUtiles.length)} ligne(s) de CODE retirée(s). Vérifier que la perte est voulue.`,
      );
      suspectes += 1;
    }
  }
  console.log();
}

console.log('═'.repeat(78));
console.log(
  suspectes === 0
    ? 'Aucune redéclaration ne retire de code.'
    : `${String(suspectes)} redéclaration(s) retirent du code — à justifier.`,
);

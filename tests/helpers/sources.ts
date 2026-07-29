import { readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * Parcours des sources, pour les tests d'architecture.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ UN PARCOURS VIDE EST UNE ERREUR, JAMAIS UN SUCCÈS.                      │
 * │                                                                          │
 * │ Les tests d'architecture ont tous la même forme : on parcourt les        │
 * │ sources, on collecte les infractions, on affirme que la liste est vide.  │
 * │ Cette forme a un angle mort — si le parcours ne rend AUCUN fichier, la   │
 * │ liste d'infractions est vide elle aussi, et le test passe au vert sans   │
 * │ avoir rien vérifié.                                                      │
 * │                                                                          │
 * │ Il suffit qu'un dossier soit renommé, ou que ses fichiers migrent sous   │
 * │ une autre extension, pour qu'une règle de sécurité cesse d'être tenue    │
 * │ SANS QU'AUCUN TEST NE DEVIENNE ROUGE. C'est le défaut le plus coûteux    │
 * │ qui soit, parce qu'il est invisible : personne ne va relire un test vert.│
 * │                                                                          │
 * │ D'où le refus explicite ci-dessous. Six copies de cette fonction         │
 * │ vivaient dans six fichiers de test ; l'une d'elles rendait même `[]`     │
 * │ quand la racine n'existait pas, c'est-à-dire exactement le cas qu'il     │
 * │ fallait signaler.                                                        │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
const RACINE = process.cwd();

function parcourir(racine: string): string[] {
  const trouves: string[] = [];
  for (const entree of readdirSync(racine)) {
    const chemin = join(racine, entree);
    if (statSync(chemin).isDirectory()) trouves.push(...parcourir(chemin));
    else if (/\.(ts|tsx)$/.test(chemin)) trouves.push(chemin);
  }
  return trouves;
}

/**
 * Tous les fichiers TypeScript sous `racine`.
 *
 * @throws si la racine n'existe pas — `readdirSync` s'en charge — ou si elle
 *         ne contient aucun fichier TypeScript. Dans les deux cas, la règle
 *         que l'appelant s'apprêtait à vérifier ne porte sur rien.
 */
export function fichiersSources(racine: string): string[] {
  const trouves = parcourir(racine);

  if (trouves.length === 0) {
    throw new Error(
      `Aucun fichier TypeScript sous ${relative(RACINE, racine)} : ` +
        'la règle vérifiée par ce test ne porte sur rien. Le dossier a-t-il été ' +
        'renommé ou déplacé ? Corriger le chemin, jamais retirer le test.',
    );
  }

  return trouves;
}

/** Chemin lisible dans un message d'échec. */
export function chemin(absolu: string): string {
  return relative(RACINE, absolu).replace(/\\/g, '/');
}

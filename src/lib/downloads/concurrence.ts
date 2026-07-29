/**
 * Limitation de concurrence — point de vigilance 7 de l'étape 11.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ UN ALBUM DE QUARANTE-HUIT PAGES EN COULEUR TIENT EN MÉMOIRE PENDANT SA  │
 * │ GÉNÉRATION.                                                              │
 * │                                                                          │
 * │ `pdf-lib` travaille intégralement en mémoire : le document source, le    │
 * │ document reconstruit et le résultat coexistent le temps de l'écriture.   │
 * │ Dix téléchargements simultanés d'un album lourd suffisent à épuiser le   │
 * │ processus — et ce n'est pas la requête coupable qui échoue, ce sont      │
 * │ TOUTES les requêtes en cours, y compris la lecture en ligne.            │
 * │                                                                          │
 * │ Le sémaphore ne rend pas la génération plus rapide. Il fait attendre au  │
 * │ lieu de faire tomber, ce qui n'est pas la même panne.                   │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Il n'y a pas de file d'attente persistante ici : une génération réellement
 * sortie du fil de requête demanderait un ouvrier séparé, hors du périmètre du
 * mode local. Consigné dans QUESTIONS.md.
 */
export class Semaphore {
  #libres: number;
  readonly #attente: (() => void)[] = [];

  constructor(places: number) {
    if (!Number.isInteger(places) || places < 1) {
      throw new Error(`Sémaphore : nombre de places invalide (${String(places)}).`);
    }
    this.#libres = places;
  }

  /** Nombre de demandes en attente. Sert à la surveillance et aux tests. */
  get enAttente(): number {
    return this.#attente.length;
  }

  async acquerir(): Promise<void> {
    if (this.#libres > 0) {
      this.#libres -= 1;
      return;
    }
    await new Promise<void>((resoudre) => this.#attente.push(resoudre));
  }

  liberer(): void {
    const suivant = this.#attente.shift();
    if (suivant) {
      // La place n'est pas rendue puis reprise : elle passe directement au
      // suivant. Repasser par le compteur ouvrirait une fenêtre où un
      // nouvel arrivant double la file.
      suivant();
      return;
    }
    this.#libres += 1;
  }

  /**
   * Exécute en tenant une place, et la rend quoi qu'il arrive.
   *
   * Le `finally` n'est pas une précaution de style : une place non rendue sur
   * un chemin d'erreur réduit définitivement la capacité du processus, et la
   * panne n'apparaît qu'après plusieurs échecs — c'est-à-dire loin de sa cause.
   */
  async tenir<T>(travail: () => Promise<T>): Promise<T> {
    await this.acquerir();
    try {
      return await travail();
    } finally {
      this.liberer();
    }
  }
}

/**
 * Impose un délai maximal à une promesse.
 *
 * Sans délai, un PDF pathologique — profondément imbriqué, ou construit pour
 * nuire — occuperait une place du sémaphore indéfiniment, et la capacité de
 * génération tomberait à zéro sans qu'aucune erreur ne soit levée.
 *
 * Le travail sous-jacent n'est pas interrompu : `pdf-lib` est synchrone par
 * morceaux et ne s'annule pas. Le délai libère l'APPELANT et la place ; le
 * calcul restant sera abandonné par le ramasse-miettes.
 */
export async function avecDelai<T>(
  travail: () => Promise<T>,
  delaiMs: number,
  message: string,
): Promise<T> {
  let minuteur: NodeJS.Timeout | undefined;

  try {
    return await Promise.race([
      travail(),
      new Promise<never>((_, rejeter) => {
        minuteur = setTimeout(() => {
          rejeter(new Error(message));
        }, delaiMs);
      }),
    ]);
  } finally {
    if (minuteur) clearTimeout(minuteur);
  }
}

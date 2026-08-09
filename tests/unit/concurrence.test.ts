import { describe, expect, it } from 'vitest';

import { Semaphore, avecDelai } from '@/lib/http/concurrence';

/**
 * Le sémaphore, éprouvé pour de bon.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ IL PROTÉGEAIT DEUX TRAITEMENTS LOURDS SANS QU'AUCUN TEST NE L'EXERCE.   │
 * │                                                                          │
 * │ Livré à l'étape 11 pour le filigrane, étendu à l'ingestion à l'étape 13, │
 * │ il n'avait jusqu'ici aucun test propre : sa correction se déduisait de    │
 * │ la lecture. C'est exactement la classe de défaut que §5 sexies interdit  │
 * │ — un dispositif de sécurité que rien ne fait échouer.                    │
 * │                                                                          │
 * │ Ce qui compte n'est pas qu'il compte juste, mais qu'il ne laisse JAMAIS  │
 * │ passer plus de places qu'il n'en a, même sous erreur.                    │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
function differer(ms: number): Promise<void> {
  return new Promise((resoudre) => setTimeout(resoudre, ms));
}

describe('places du sémaphore', () => {
  it('refuse une taille absurde', () => {
    // Un sémaphore à zéro place bloquerait tout ; à -1, il n'aurait aucun sens.
    expect(() => new Semaphore(0)).toThrow();
    expect(() => new Semaphore(-1)).toThrow();
  });

  it('NE LAISSE JAMAIS plus de N traitements simultanés', async () => {
    // ┌──────────────────────────────────────────────────────────────────────┐
    // │ LA SEULE ASSERTION QUI COMPTE VRAIMENT.                              │
    // │                                                                      │
    // │ On mesure le PIC de simultanéité observé, et non l'ordre de passage : │
    // │ c'est le pic qui épuise la mémoire du processus, pas la séquence.     │
    // └──────────────────────────────────────────────────────────────────────┘
    const semaphore = new Semaphore(2);
    let enCours = 0;
    let pic = 0;

    await Promise.all(
      Array.from({ length: 12 }, () =>
        semaphore.tenir(async () => {
          enCours += 1;
          pic = Math.max(pic, enCours);
          await differer(5);
          enCours -= 1;
        }),
      ),
    );

    expect(pic).toBe(2);
    expect(enCours).toBe(0);
  });

  it('les laisse TOUS passer — sinon le test précédent passerait sur un blocage', async () => {
    // Un sémaphore qui ne libérerait jamais ses places donnerait un pic de 2 et
    // ne terminerait pas. Compter les traitements achevés le distingue.
    const semaphore = new Semaphore(2);
    let acheves = 0;

    await Promise.all(
      Array.from({ length: 12 }, () =>
        semaphore.tenir(async () => {
          await differer(1);
          acheves += 1;
        }),
      ),
    );

    expect(acheves).toBe(12);
  });

  it('REND la place même quand le traitement échoue', async () => {
    // ┌──────────────────────────────────────────────────────────────────────┐
    // │ LA PANNE LA PLUS SOURNOISE DE CE DISPOSITIF.                         │
    // │                                                                      │
    // │ Une place non rendue après une erreur ne casse rien tout de suite :   │
    // │ le service continue, avec une place de moins. Puis deux. Puis plus    │
    // │ aucune — et le service se fige, longtemps après la cause.             │
    // │                                                                      │
    // │ Un PDF corrompu suffit à déclencher ce chemin.                        │
    // └──────────────────────────────────────────────────────────────────────┘
    const semaphore = new Semaphore(1);

    for (let i = 0; i < 5; i += 1) {
      await expect(
        semaphore.tenir(() => Promise.reject(new Error('PDF illisible'))),
      ).rejects.toThrow('PDF illisible');
    }

    // Si une seule place avait été perdue, cet appel n'aboutirait jamais.
    await expect(
      avecDelai(
        () => semaphore.tenir(() => Promise.resolve('libre')),
        1000,
        'Place jamais rendue',
      ),
    ).resolves.toBe('libre');
  });

  it('fait ATTENDRE plutôt que de refuser', async () => {
    // Le choix de conception : sur connexion lente (§5.1), une attente est
    // préférable à un refus qui obligerait à tout recommencer.
    //
    // ┌────────────────────────────────────────────────────────────────────┐
    // │ AUCUN DÉLAI RÉEL ICI, ET C'EST UNE CORRECTION.                     │
    // │                                                                    │
    // │ Ce test tenait la première place occupée pendant 20 ms, puis        │
    // │ attendait 5 ms avant de mesurer. Les marges étaient assez larges    │
    // │ pour la machine au repos, et trop courtes pour la porte complète :  │
    // │ sous la charge des soixante-quatorze fichiers, l'attente de 5 ms en │
    // │ prenait plus de 20, la première place était donc DÉJÀ rendue, et la │
    // │ file mesurée à zéro au lieu d'un.                                   │
    // │                                                                    │
    // │ Il échouait une fois sur quelques dizaines — et passait toujours en │
    // │ isolation, ce qui est la pire des signatures : on conclut à un      │
    // │ hasard, puis on cesse de lire les échecs de la porte.               │
    // │                                                                    │
    // │ La place est désormais tenue par une promesse qu'on résout à la     │
    // │ main. Il n'y a plus de course : le premier ne peut pas terminer     │
    // │ avant qu'on l'ait décidé, quelle que soit la charge.                │
    // └────────────────────────────────────────────────────────────────────┘
    const semaphore = new Semaphore(1);
    const ordre: string[] = [];

    let libererPremier!: () => void;
    const tenue = new Promise<void>((resoudre) => {
      libererPremier = resoudre;
    });

    const premier = semaphore.tenir(async () => {
      await tenue;
      ordre.push('premier');
    });

    // Laisse la microtâche du premier `tenir` s'exécuter : il prend sa place,
    // puis se bloque sur `tenue`. Aucune horloge n'intervient.
    await Promise.resolve();
    expect(semaphore.enAttente).toBe(0);

    const second = semaphore.tenir(async () => {
      ordre.push('second');
      return Promise.resolve();
    });

    await Promise.resolve();
    // La place unique est prise et non rendue : le second ne peut QUE attendre.
    expect(semaphore.enAttente).toBe(1);

    libererPremier();
    await Promise.all([premier, second]);

    // L'ordre est garanti par la file, pas par le temps qui passe.
    expect(ordre).toEqual(['premier', 'second']);
  });
});

describe('délai d’attente', () => {
  it('rend la valeur quand le traitement aboutit à temps', async () => {
    await expect(avecDelai(() => Promise.resolve(42), 1000, 'trop long')).resolves.toBe(42);
  });

  it('ÉCHOUE quand l’attente dépasse le délai', async () => {
    // Sans délai, une file saturée transforme une lenteur en requêtes
    // suspendues indéfiniment — et un client qui n'obtient jamais de réponse
    // réessaie, ce qui aggrave la saturation.
    await expect(avecDelai(() => differer(5000), 20, 'Ingestion : attente trop longue.')).rejects.toThrow(
      'Ingestion : attente trop longue.',
    );
  });
});

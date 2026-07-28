import type { MutableClock } from './clock';
import { MILLISECONDS_PER_DAY } from './clock';

/**
 * Horloge de test : entièrement déterministe, en mémoire.
 *
 * Tous les scénarios temporels (fin de période d'abonnement, période de grâce,
 * fenêtre de 3 mois des nouveautés) sont testés en avançant cette horloge,
 * jamais en attendant.
 */
export class FixedClock implements MutableClock {
  #current: Date;
  readonly #initial: Date;

  constructor(start: Date | string) {
    const parsed = typeof start === 'string' ? new Date(start) : new Date(start.getTime());
    if (Number.isNaN(parsed.getTime())) {
      throw new TypeError(`FixedClock : date de départ invalide (${String(start)})`);
    }
    this.#current = parsed;
    this.#initial = new Date(parsed.getTime());
  }

  now(): Date {
    // Une copie : un appelant ne doit pas pouvoir muter l'horloge par effet de
    // bord sur l'objet renvoyé.
    return new Date(this.#current.getTime());
  }

  setTo(instant: Date | string): void {
    const parsed = typeof instant === 'string' ? new Date(instant) : instant;
    if (Number.isNaN(parsed.getTime())) {
      throw new TypeError(`FixedClock : date invalide (${String(instant)})`);
    }
    this.#current = new Date(parsed.getTime());
  }

  advanceMs(ms: number): void {
    if (!Number.isFinite(ms)) {
      throw new TypeError('FixedClock : décalage non fini');
    }
    this.#current = new Date(this.#current.getTime() + ms);
  }

  advanceDays(days: number): void {
    this.advanceMs(days * MILLISECONDS_PER_DAY);
  }

  reset(): void {
    this.#current = new Date(this.#initial.getTime());
  }

  offsetMs(): number {
    return this.#current.getTime() - this.#initial.getTime();
  }
}

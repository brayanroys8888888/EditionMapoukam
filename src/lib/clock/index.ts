import type { Clock, MutableClock } from './clock';
import { DevClock } from './dev-clock';
import { SystemClock } from './system-clock';

export type { Clock, MutableClock } from './clock';
export { MILLISECONDS_PER_DAY } from './clock';
export { SystemClock } from './system-clock';
export { FixedClock } from './fixed-clock';
export { DevClock, DEV_CLOCK_FILENAME } from './dev-clock';

let cached: Clock | null = null;

/**
 * Horloge de l'application.
 *
 * En production, l'heure réelle et rien d'autre. Hors production, une horloge
 * déplaçable par la console de simulation.
 */
export function getClock(): Clock {
  cached ??= process.env['NODE_ENV'] === 'production' ? new SystemClock() : new DevClock();
  return cached;
}

/**
 * Horloge déplaçable, réservée à la console de simulation.
 *
 * Renvoie `null` en production : le temps n'y est jamais déplaçable.
 */
export function getMutableClock(): MutableClock | null {
  if (process.env['NODE_ENV'] === 'production') return null;
  const clock = getClock();
  return clock instanceof DevClock ? clock : null;
}

/** Réservé aux tests : oublie l'horloge mémorisée. */
export function resetClockCache(): void {
  cached = null;
}

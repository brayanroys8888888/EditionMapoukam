import type { Clock } from './clock';

/**
 * Horloge de production : l'heure réelle, sans décalage possible.
 */
export class SystemClock implements Clock {
  now(): Date {
    return new Date();
  }
}

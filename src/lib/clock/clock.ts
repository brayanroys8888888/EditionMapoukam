/**
 * Service d'horloge injectable.
 *
 * CLAUDE.md : « Le temps ne se lit jamais avec `new Date()` directement dans la
 * logique métier. Il passe par un service `clock` injectable, pour que la
 * console de simulation puisse avancer le temps et que les tests soient
 * déterministes. »
 *
 * Une règle ESLint interdit `new Date()` et `Date.now()` dans `src/domain/**`.
 */
export interface Clock {
  /** Instant courant, tel que le voit la logique métier. */
  now(): Date;
}

/**
 * Horloge mutable : capable de se déplacer dans le temps.
 *
 * Seuls la console de simulation et les tests manipulent cette interface. La
 * logique métier ne connaît que `Clock`, et ne peut donc pas déplacer le temps.
 */
export interface MutableClock extends Clock {
  /** Avance de `days` jours. Une valeur négative recule. */
  advanceDays(days: number): void;
  /** Avance de `ms` millisecondes. Une valeur négative recule. */
  advanceMs(ms: number): void;
  /** Revient à l'heure réelle. */
  reset(): void;
  /** Décalage courant par rapport à l'heure réelle, en millisecondes. */
  offsetMs(): number;
}

export const MILLISECONDS_PER_DAY = 86_400_000;

import { existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { Clock, MutableClock } from './clock';
import { MILLISECONDS_PER_DAY } from './clock';
import { SystemClock } from './system-clock';

/**
 * Horloge de développement : applique un décalage persisté sur disque à
 * l'heure réelle.
 *
 * Pourquoi un fichier et non la base : la console de simulation n'écrit jamais
 * en base (CLAUDE.md), et le décalage doit survivre au rechargement du serveur
 * Next.js, ce qu'une variable en mémoire ne permet pas.
 *
 * Ce décalage est ensuite transmis à PostgreSQL par `SET LOCAL app.now`, où il
 * n'est honoré que si l'artefact d'activation existe en base — voir
 * docs/PLAN.md §2.5. `DevClock` n'est jamais instancié en production.
 */
export const DEV_CLOCK_FILENAME = '.devclock.json';

interface DevClockState {
  offsetMs: number;
  updatedAt: string;
}

export class DevClock implements MutableClock {
  readonly #filePath: string;
  readonly #base: Clock;
  #cache: { offsetMs: number; mtimeMs: number } | null = null;

  constructor(options: { filePath?: string; base?: Clock; nodeEnv?: string } = {}) {
    const nodeEnv = options.nodeEnv ?? process.env['NODE_ENV'];
    if (nodeEnv === 'production') {
      throw new Error(
        "DevClock est interdite en production : l'heure ne doit jamais être déplaçable sur une base réelle.",
      );
    }
    this.#filePath = options.filePath ?? join(process.cwd(), DEV_CLOCK_FILENAME);
    this.#base = options.base ?? new SystemClock();
  }

  now(): Date {
    return new Date(this.#base.now().getTime() + this.offsetMs());
  }

  offsetMs(): number {
    if (!existsSync(this.#filePath)) {
      this.#cache = null;
      return 0;
    }

    const { mtimeMs } = statSync(this.#filePath);
    if (this.#cache !== null && this.#cache.mtimeMs === mtimeMs) {
      return this.#cache.offsetMs;
    }

    const offsetMs = this.#readOffset();
    this.#cache = { offsetMs, mtimeMs };
    return offsetMs;
  }

  advanceMs(ms: number): void {
    if (!Number.isFinite(ms)) {
      throw new TypeError('DevClock : décalage non fini');
    }
    this.#write(this.offsetMs() + ms);
  }

  advanceDays(days: number): void {
    this.advanceMs(days * MILLISECONDS_PER_DAY);
  }

  reset(): void {
    this.#write(0);
  }

  /** Chemin du fichier de décalage, exposé pour la console et les tests. */
  get filePath(): string {
    return this.#filePath;
  }

  #readOffset(): number {
    try {
      const raw: unknown = JSON.parse(readFileSync(this.#filePath, 'utf8'));
      if (typeof raw !== 'object' || raw === null) return 0;
      const offset = (raw as Partial<DevClockState>).offsetMs;
      return typeof offset === 'number' && Number.isFinite(offset) ? offset : 0;
    } catch {
      // Un fichier illisible ne doit pas empêcher le serveur de démarrer : on
      // retombe sur l'heure réelle, qui est le comportement sûr.
      return 0;
    }
  }

  #write(offsetMs: number): void {
    const state: DevClockState = {
      offsetMs,
      updatedAt: new Date(this.#base.now().getTime() + offsetMs).toISOString(),
    };
    mkdirSync(dirname(this.#filePath), { recursive: true });
    // Écriture atomique : un `now()` concurrent ne doit jamais lire un fichier
    // à moitié écrit.
    const temporary = `${this.#filePath}.${process.pid}.tmp`;
    writeFileSync(temporary, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
    renameSync(temporary, this.#filePath);
    this.#cache = null;
  }
}

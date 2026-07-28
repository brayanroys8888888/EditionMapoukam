import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { DevClock } from '@/lib/clock/dev-clock';
import { FixedClock } from '@/lib/clock/fixed-clock';
import { SystemClock } from '@/lib/clock/system-clock';
import { MILLISECONDS_PER_DAY } from '@/lib/clock/clock';
import type { Clock } from '@/lib/clock/clock';

describe('SystemClock', () => {
  it("renvoie l'heure réelle", () => {
    const before = Date.now();
    const observed = new SystemClock().now().getTime();
    const after = Date.now();

    expect(observed).toBeGreaterThanOrEqual(before);
    expect(observed).toBeLessThanOrEqual(after);
  });
});

describe('FixedClock', () => {
  it('reste immobile tant qu’on ne la déplace pas', () => {
    const clock = new FixedClock('2026-01-15T10:00:00.000Z');

    expect(clock.now().toISOString()).toBe('2026-01-15T10:00:00.000Z');
    expect(clock.now().toISOString()).toBe('2026-01-15T10:00:00.000Z');
  });

  it('avance du nombre de jours demandé', () => {
    const clock = new FixedClock('2026-01-15T10:00:00.000Z');

    clock.advanceDays(90);

    expect(clock.now().toISOString()).toBe('2026-04-15T10:00:00.000Z');
    expect(clock.offsetMs()).toBe(90 * MILLISECONDS_PER_DAY);
  });

  it('accepte un déplacement en arrière', () => {
    const clock = new FixedClock('2026-01-15T10:00:00.000Z');

    clock.advanceDays(-15);

    expect(clock.now().toISOString()).toBe('2025-12-31T10:00:00.000Z');
  });

  it('revient à son point de départ après reset()', () => {
    const clock = new FixedClock('2026-01-15T10:00:00.000Z');

    clock.advanceDays(400);
    clock.reset();

    expect(clock.now().toISOString()).toBe('2026-01-15T10:00:00.000Z');
    expect(clock.offsetMs()).toBe(0);
  });

  it('ne se laisse pas muter par l’objet Date renvoyé', () => {
    const clock = new FixedClock('2026-01-15T10:00:00.000Z');

    const leaked = clock.now();
    leaked.setFullYear(2099);

    expect(clock.now().toISOString()).toBe('2026-01-15T10:00:00.000Z');
  });

  it('refuse une date de départ invalide', () => {
    expect(() => new FixedClock('pas une date')).toThrow(TypeError);
  });

  it('refuse un décalage non fini', () => {
    const clock = new FixedClock('2026-01-15T10:00:00.000Z');

    expect(() => clock.advanceMs(Number.POSITIVE_INFINITY)).toThrow(TypeError);
  });
});

describe('DevClock', () => {
  let directory: string;
  let filePath: string;
  let base: Clock;

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), 'devclock-'));
    filePath = join(directory, '.devclock.json');
    base = new FixedClock('2026-07-28T08:00:00.000Z');
  });

  afterEach(() => {
    rmSync(directory, { recursive: true, force: true });
  });

  it("vaut l'heure de base tant qu'aucun décalage n'est enregistré", () => {
    const clock = new DevClock({ filePath, base, nodeEnv: 'development' });

    expect(clock.now().toISOString()).toBe('2026-07-28T08:00:00.000Z');
    expect(clock.offsetMs()).toBe(0);
  });

  it('applique un décalage persisté sur disque', () => {
    const clock = new DevClock({ filePath, base, nodeEnv: 'development' });

    clock.advanceDays(30);

    expect(clock.now().toISOString()).toBe('2026-08-27T08:00:00.000Z');
  });

  it('relit le décalage écrit par un autre processus', () => {
    const writer = new DevClock({ filePath, base, nodeEnv: 'development' });
    const reader = new DevClock({ filePath, base, nodeEnv: 'development' });

    writer.advanceDays(100);

    // Le serveur Next.js et la console de simulation sont deux appelants
    // distincts : le décalage doit franchir la frontière du processus.
    expect(reader.now().toISOString()).toBe('2026-11-05T08:00:00.000Z');
  });

  it('cumule les avances successives', () => {
    const clock = new DevClock({ filePath, base, nodeEnv: 'development' });

    clock.advanceDays(10);
    clock.advanceDays(20);

    expect(clock.offsetMs()).toBe(30 * MILLISECONDS_PER_DAY);
  });

  it("revient à l'heure réelle après reset()", () => {
    const clock = new DevClock({ filePath, base, nodeEnv: 'development' });

    clock.advanceDays(365);
    clock.reset();

    expect(clock.now().toISOString()).toBe('2026-07-28T08:00:00.000Z');
  });

  it("retombe sur l'heure réelle si le fichier est illisible", () => {
    writeFileSync(filePath, '{ ceci n’est pas du JSON', 'utf8');
    const clock = new DevClock({ filePath, base, nodeEnv: 'development' });

    expect(clock.offsetMs()).toBe(0);
    expect(clock.now().toISOString()).toBe('2026-07-28T08:00:00.000Z');
  });

  it('est interdite en production', () => {
    expect(() => new DevClock({ filePath, base, nodeEnv: 'production' })).toThrow(
      /interdite en production/,
    );
  });
});

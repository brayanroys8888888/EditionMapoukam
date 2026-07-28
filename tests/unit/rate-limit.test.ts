import { describe, expect, it } from 'vitest';

import { RateLimiter, adresseAppelant } from '@/lib/http/rate-limit';
import { FixedClock } from '@/lib/clock/fixed-clock';

/**
 * Limitation des tentatives de connexion (§5.2).
 *
 * L'horloge est injectée : la fenêtre expire en déplaçant le temps, jamais en
 * attendant. Un test qui dormirait quinze minutes ne serait jamais exécuté.
 */
const OPTIONS = { limite: 3, fenetreMs: 60_000 };

describe('RateLimiter', () => {
  it('autorise jusqu’à la limite puis refuse', () => {
    const limiteur = new RateLimiter(new FixedClock('2026-07-28T10:00:00.000Z'));

    expect(limiteur.consommer('a', OPTIONS).autorise).toBe(true);
    expect(limiteur.consommer('a', OPTIONS).autorise).toBe(true);
    expect(limiteur.consommer('a', OPTIONS)).toMatchObject({ autorise: true, restant: 0 });
    expect(limiteur.consommer('a', OPTIONS).autorise).toBe(false);
  });

  it('indique le délai d’attente restant', () => {
    const horloge = new FixedClock('2026-07-28T10:00:00.000Z');
    const limiteur = new RateLimiter(horloge);

    for (let i = 0; i < 3; i += 1) limiteur.consommer('a', OPTIONS);
    horloge.advanceMs(20_000);

    expect(limiteur.consommer('a', OPTIONS).retryAfter).toBe(40);
  });

  it('rouvre l’accès une fois la fenêtre écoulée', () => {
    const horloge = new FixedClock('2026-07-28T10:00:00.000Z');
    const limiteur = new RateLimiter(horloge);

    for (let i = 0; i < 3; i += 1) limiteur.consommer('a', OPTIONS);
    expect(limiteur.consommer('a', OPTIONS).autorise).toBe(false);

    horloge.advanceMs(60_001);

    expect(limiteur.consommer('a', OPTIONS).autorise).toBe(true);
  });

  it('ne compte pas la tentative refusée', () => {
    // Sinon un attaquant qui insiste prolongerait indéfiniment son propre
    // blocage — et punirait avec lui tout utilisateur légitime partageant son
    // adresse.
    const horloge = new FixedClock('2026-07-28T10:00:00.000Z');
    const limiteur = new RateLimiter(horloge);

    for (let i = 0; i < 3; i += 1) limiteur.consommer('a', OPTIONS);
    horloge.advanceMs(30_000);
    for (let i = 0; i < 10; i += 1) limiteur.consommer('a', OPTIONS);

    // La fenêtre part toujours de la première tentative, pas des refus.
    horloge.advanceMs(30_001);
    expect(limiteur.consommer('a', OPTIONS).autorise).toBe(true);
  });

  it('sépare les clés', () => {
    const limiteur = new RateLimiter(new FixedClock('2026-07-28T10:00:00.000Z'));

    for (let i = 0; i < 3; i += 1) limiteur.consommer('a', OPTIONS);

    expect(limiteur.consommer('a', OPTIONS).autorise).toBe(false);
    expect(limiteur.consommer('b', OPTIONS).autorise).toBe(true);
  });

  it('oublie une clé réinitialisée', () => {
    const limiteur = new RateLimiter(new FixedClock('2026-07-28T10:00:00.000Z'));

    for (let i = 0; i < 3; i += 1) limiteur.consommer('a', OPTIONS);
    limiteur.reinitialiser('a');

    expect(limiteur.consommer('a', OPTIONS).autorise).toBe(true);
  });
});

describe('adresseAppelant', () => {
  it('retient le premier maillon de x-forwarded-for', () => {
    const requete = new Request('http://localhost/', {
      headers: { 'x-forwarded-for': '203.0.113.7, 10.0.0.1, 10.0.0.2' },
    });

    expect(adresseAppelant(requete)).toBe('203.0.113.7');
  });

  it('retombe sur x-real-ip', () => {
    const requete = new Request('http://localhost/', { headers: { 'x-real-ip': '198.51.100.4' } });

    expect(adresseAppelant(requete)).toBe('198.51.100.4');
  });

  it('renvoie une valeur constante en l’absence d’en-tête', () => {
    // La limitation s'applique alors globalement : c'est le comportement
    // prudent, et non l'absence de limitation.
    expect(adresseAppelant(new Request('http://localhost/'))).toBe('inconnue');
  });
});

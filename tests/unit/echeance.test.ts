import { describe, expect, it } from 'vitest';

import { doitRafraichir, echeance, MARGE_PREVENTIVE_SECONDES } from '@/lib/auth/echeance';

/**
 * ÉCHÉANCE D'UN JETON — la lecture qui rend le rafraîchissement PRÉVENTIF.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ RÉAGIR AU PREMIER 401 ARRIVE DÉJÀ TROP TARD.                            │
 * │                                                                          │
 * │ La requête est partie, la page est en vol, et l'enfant attend devant un  │
 * │ écran qui ne dit rien. Sur les connexions que §5.1 décrit comme la       │
 * │ condition réelle d'une partie du public, l'aller-retour de              │
 * │ rafraîchissement s'ajoute à celui qui vient d'échouer.                   │
 * └──────────────────────────────────────────────────────────────────────────┘
 */

/** Fabrique un JWT dont seule la charge utile compte. */
function jeton(charge: Record<string, unknown>): string {
  const encoder = (valeur: unknown): string =>
    Buffer.from(JSON.stringify(valeur), 'utf8')
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

  // La signature n'est jamais vérifiée par ce module : elle peut être
  // n'importe quoi, et c'est précisément ce que le dernier test établit.
  return `${encoder({ alg: 'HS256' })}.${encoder(charge)}.signature-quelconque`;
}

describe('lecture de l’échéance', () => {
  it('lit `exp` d’un jeton bien formé', () => {
    expect(echeance(jeton({ exp: 1_800_000_000, sub: 'abc' }))).toBe(1_800_000_000);
  });

  it('rend `null` sur tout ce qui n’est pas lisible', () => {
    // ┌────────────────────────────────────────────────────────────────────┐
    // │ ÉNUMÉRATION DES FORMES CASSÉES, plutôt qu'un seul cas.             │
    // │                                                                    │
    // │ Chacune vient d'un vrai chemin : cookie vide, cookie tronqué par   │
    // │ un proxy, jeton d'un autre format, charge utile non JSON.          │
    // └────────────────────────────────────────────────────────────────────┘
    expect(echeance(null)).toBeNull();
    expect(echeance(undefined)).toBeNull();
    expect(echeance('')).toBeNull();
    expect(echeance('pas-un-jwt')).toBeNull();
    expect(echeance('deux.parties')).toBeNull();
    expect(echeance('a.!!!pas-du-base64!!!.c')).toBeNull();
    expect(echeance(jeton({ sub: 'sans-exp' }))).toBeNull();
    expect(echeance(jeton({ exp: 'bientôt' }))).toBeNull();
  });
});

describe('décision de rafraîchir', () => {
  const maintenant = 1_800_000_000;

  it('ne rafraîchit PAS un jeton encore loin de son échéance', () => {
    // Sans cette assertion, une fonction qui rendrait toujours `true`
    // passerait tous les autres tests — et rafraîchirait à chaque navigation,
    // c'est-à-dire ferait tourner la lignée de jetons en boucle.
    const loin = jeton({ exp: maintenant + MARGE_PREVENTIVE_SECONDES + 60 });
    expect(doitRafraichir(loin, maintenant)).toBe(false);
  });

  it('rafraîchit DANS la marge, avant toute expiration', () => {
    const proche = jeton({ exp: maintenant + MARGE_PREVENTIVE_SECONDES - 60 });
    expect(doitRafraichir(proche, maintenant)).toBe(true);
  });

  it('rafraîchit un jeton déjà expiré', () => {
    expect(doitRafraichir(jeton({ exp: maintenant - 10 }), maintenant)).toBe(true);
  });

  it('rafraîchit exactement AU seuil', () => {
    // La frontière est incluse : à cinq minutes pile, on rafraîchit. Attendre
    // une seconde de plus n'apporte rien et coûte une expiration en vol.
    const pile = jeton({ exp: maintenant + MARGE_PREVENTIVE_SECONDES });
    expect(doitRafraichir(pile, maintenant)).toBe(true);
  });

  it('rafraîchit quand le jeton est ILLISIBLE — le doute ne maintient rien', () => {
    // ┌────────────────────────────────────────────────────────────────────┐
    // │ L'inverse — « illisible, donc on laisse » — donnerait une session   │
    // │ qui semble vivante et que chaque route gardée refuse. L'utilisateur │
    // │ verrait une interface connectée et des erreurs partout.             │
    // └────────────────────────────────────────────────────────────────────┘
    expect(doitRafraichir('cookie-tronque', maintenant)).toBe(true);
    expect(doitRafraichir(null, maintenant)).toBe(true);
  });

  it('la marge est celle d’une connexion lente, pas d’une connexion de bureau', () => {
    // Cinq minutes laissent la place à plusieurs tentatives avant l'échéance.
    // Sur un jeton d'une heure, cela fait un renouvellement par heure — pas un
    // par page.
    expect(MARGE_PREVENTIVE_SECONDES).toBeGreaterThanOrEqual(120);
    expect(MARGE_PREVENTIVE_SECONDES).toBeLessThanOrEqual(900);
  });
});

describe('la signature n’est jamais vérifiée, et c’est sans conséquence', () => {
  it('un jeton falsifié annonçant une échéance lointaine ne gagne RIEN', () => {
    // ┌────────────────────────────────────────────────────────────────────┐
    // │ LIRE N'EST PAS FAIRE CONFIANCE.                                    │
    // │                                                                    │
    // │ Ce module décide QUAND rafraîchir, jamais QUI a le droit de quoi.  │
    // │ Un jeton fabriqué de toutes pièces sera refusé par Supabase Auth à │
    // │ la première route gardée, exactement comme aujourd'hui. Il obtient │
    // │ seulement qu'on ne le rafraîchisse pas — c'est-à-dire rien.        │
    // └────────────────────────────────────────────────────────────────────┘
    const falsifie = jeton({ exp: 9_999_999_999, role: 'admin' });

    expect(echeance(falsifie)).toBe(9_999_999_999);
    expect(doitRafraichir(falsifie, 1_800_000_000)).toBe(false);

    // Et ce module ne rend AUCUNE information de droit : il n'y a rien à
    // usurper. C'est ce qui rend l'absence de vérification acceptable.
    expect(Object.keys({ echeance, doitRafraichir })).toEqual(['echeance', 'doitRafraichir']);
  });
});

import { describe, expect, it } from 'vitest';

import {
  MoneyError,
  applyPercentage,
  formatAmount,
  sumAmounts,
  toMajorUnits,
  toMinorUnits,
} from '@/lib/money/money';
import type { Currency } from '@/lib/money/money';

const EUR: Currency = { code: 'EUR', decimals: 2, symbole: '€' };
const XAF: Currency = { code: 'XAF', decimals: 0, symbole: 'FCFA' };

/**
 * Intl insère des espaces insécables — fine (U+202F) ou normale (U+00A0)
 * selon la version d'ICU. On les normalise pour que les tests ne dépendent
 * pas de la version de Node installée sur la machine.
 */
const normalise = (s: string) => s.replace(/\s+/g, " ");

describe('conversion entre unité principale et sous-unité', () => {
  it('convertit une devise à deux décimales', () => {
    expect(toMajorUnits(499, EUR)).toBe(4.99);
    expect(toMinorUnits(4.99, EUR)).toBe(499);
  });

  it('laisse intacte une devise sans sous-unité', () => {
    // Le piège du projet : 1500 FCFA vaut 1500 francs, pas 15 francs.
    expect(toMajorUnits(1500, XAF)).toBe(1500);
    expect(toMinorUnits(1500, XAF)).toBe(1500);
  });

  it('arrondit explicitement une saisie trop précise', () => {
    expect(toMinorUnits(4.999, EUR)).toBe(500);
    expect(toMinorUnits(1500.4, XAF)).toBe(1500);
  });

  it('refuse un montant non entier en sous-unité', () => {
    expect(() => toMajorUnits(4.99, EUR)).toThrow(MoneyError);
  });

  it('refuse une devise au nombre de décimales aberrant', () => {
    expect(() => toMajorUnits(100, { code: 'XXX', decimals: 9, symbole: 'X' })).toThrow(MoneyError);
  });
});

describe('formatage', () => {
  it('formate un euro avec ses centimes', () => {
    expect(normalise(formatAmount(499, EUR))).toBe('4,99 €');
    expect(normalise(formatAmount(699, EUR))).toBe('6,99 €');
    expect(normalise(formatAmount(6900, EUR))).toBe('69,00 €');
  });

  it('formate un franc CFA sans décimale', () => {
    expect(normalise(formatAmount(1500, XAF))).toBe('1 500 FCFA');
    expect(normalise(formatAmount(22000, XAF))).toBe('22 000 FCFA');
  });

  it('formate un montant nul', () => {
    expect(normalise(formatAmount(0, EUR))).toBe('0,00 €');
    expect(normalise(formatAmount(0, XAF))).toBe('0 FCFA');
  });
});

describe('somme', () => {
  it('additionne des montants de même devise', () => {
    expect(
      sumAmounts([
        { montant: 499, devise: 'EUR' },
        { montant: 699, devise: 'EUR' },
      ]),
    ).toEqual({ montant: 1198, devise: 'EUR' });
  });

  it('refuse d’additionner des devises différentes', () => {
    // docs/PLAN.md D4 point 4 : aucune conversion de taux de change à
    // l'exécution. Un total EUR + XAF n'a aucun sens.
    expect(() =>
      sumAmounts([
        { montant: 499, devise: 'EUR' },
        { montant: 1500, devise: 'XAF' },
      ]),
    ).toThrow(/Devises hétérogènes/);
  });

  it('refuse une somme vide, dont la devise serait indéterminée', () => {
    expect(() => sumAmounts([])).toThrow(MoneyError);
  });
});

describe('remise en pourcentage', () => {
  it('s’applique indépendamment du nombre de décimales', () => {
    expect(applyPercentage(499, 20)).toBe(399);
    expect(applyPercentage(1500, 20)).toBe(1200);
  });

  it('laisse le montant strictement inchangé à 0 %', () => {
    expect(applyPercentage(499, 0)).toBe(499);
  });

  it('ramène à zéro à 100 %', () => {
    expect(applyPercentage(499, 100)).toBe(0);
  });

  it('refuse un pourcentage hors bornes', () => {
    expect(() => applyPercentage(499, 101)).toThrow(MoneyError);
    expect(() => applyPercentage(499, -1)).toThrow(MoneyError);
  });
});

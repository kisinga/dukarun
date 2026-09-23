import { describe, expect, it } from 'vitest';
import {
  formatKes,
  formatKesInput,
  formatUnitCost,
  formatUnitCostInput,
  parseKes,
  parseUnitCost,
  roundUnitCost,
} from './money';

describe('buying-cost rates', () => {
  it.each([
    ['2.50', 2.5],
    ['0.25', 0.25],
    ['0', 0],
    ['1,234.56', 1234.56],
    ['.5', 0.5],
    ['0.01', 0.01],
    ['2.12', 2.12],
  ] as const)('preserves %s', (input, expected) => {
    expect(parseUnitCost(input)).toBe(expected);
  });

  it.each(['', ' ', '-1', 'Infinity', 'NaN', '1e3', '0.001', '2.123', 'invalid'])(
    'rejects invalid rate %s without rounding',
    input => {
      expect(parseUnitCost(input)).toBeNull();
    }
  );

  it('formats cost rates without changing whole-shilling money helpers', () => {
    expect(formatUnitCost(2.5)).toBe('KES 2.5');
    expect(formatUnitCostInput(0.25)).toBe('0.25');
    expect(formatUnitCostInput(100 / 3)).toBe('33.33');
    expect(roundUnitCost(250 / 100)).toBe(2.5);
    expect(roundUnitCost(201 / 200)).toBe(1.01);
    expect(roundUnitCost(2.675)).toBe(2.68);
    expect(roundUnitCost(-1.005)).toBe(-1.01);
    expect(formatUnitCostInput(201 / 200)).toBe('1.01');
    expect(parseKes('2.50')).toBe(3);
    expect(formatKesInput(2.5)).toBe('3');
    expect(formatKes(2.5)).toBe('KES 3');
  });
});

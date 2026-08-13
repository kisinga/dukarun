import { describe, expect, it } from 'vitest';
import { formatKes, parseKes } from './money';

describe('money helpers', () => {
  it('formats whole Kenyan shillings', () => {
    expect(formatKes(2450.4)).toBe('KES 2,450');
  });

  it('parses grouped amounts and rejects invalid input', () => {
    expect(parseKes('2,450')).toBe(2450);
    expect(parseKes('-1')).toBeNull();
    expect(parseKes('nope')).toBeNull();
  });
});

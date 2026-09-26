import { describe, expect, it } from 'vitest';
import { clearSettledAging } from './party-cache.service';

describe('party cache aging projection', () => {
  const stale = { days_outstanding: 45, bucket: '31-60', name: 'Settled party' };

  it('clears persisted aging when the authoritative balance is zero', () => {
    expect(clearSettledAging(stale, 0)).toEqual({
      ...stale,
      days_outstanding: null,
      bucket: null,
    });
  });

  it('preserves aging while a positive balance remains', () => {
    expect(clearSettledAging(stale, 1)).toBe(stale);
  });
});

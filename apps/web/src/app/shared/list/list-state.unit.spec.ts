import { describe, expect, it } from 'vitest';
import { canonicalListUrl, nearestSavedRecord } from './list-state';

describe('list return identity', () => {
  it('canonicalizes view parameters without losing deep links or values', () => {
    expect(canonicalListUrl('/sales?search=tea%20%26%20milk&page=2')).toBe(
      canonicalListUrl('/sales?page=2&search=tea+%26+milk')
    );
    expect(canonicalListUrl('/sales?page=2')).not.toBe(canonicalListUrl('/sales?page=3'));
  });
  it('prefers the saved record and then the nearest surviving saved neighbor', () => {
    const saved = { y: 900, x: [120], anchor: 'b', neighbors: ['b', 'a', 'c'] };
    expect(nearestSavedRecord(saved, new Set(['b', 'c']))).toBe('b');
    expect(nearestSavedRecord(saved, new Set(['c']))).toBe('c');
    expect(nearestSavedRecord(saved, new Set(['d']))).toBeUndefined();
  });
});

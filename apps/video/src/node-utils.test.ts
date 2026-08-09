import { describe, expect, it } from 'vitest';
import { formatSrtTimestamp, formatVttTimestamp, sha256, stableJson } from './node-utils';

describe('delivery helpers', () => {
  it('hashes objects independently of key order', () => {
    expect(sha256(stableJson({ a: 1, b: 2 }))).toBe(sha256(stableJson({ b: 2, a: 1 })));
  });

  it('formats exact caption timestamps', () => {
    expect(formatSrtTimestamp(45, 30)).toBe('00:00:01,500');
    expect(formatVttTimestamp(45, 30)).toBe('00:00:01.500');
  });
});

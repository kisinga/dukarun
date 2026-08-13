import { describe, expect, it } from 'vitest';
import { isRapidScannerBurst, SCANNER_MAX_KEY_GAP_MS } from './keyboard-wedge';

describe('keyboard wedge scanner detection', () => {
  it('accepts fast consecutive keystrokes', () => {
    expect(isRapidScannerBurst([0, 20, 39, 61])).toBe(true);
  });

  it('rejects normal typing gaps', () => {
    expect(isRapidScannerBurst([0, 20, 20 + SCANNER_MAX_KEY_GAP_MS + 1, 150])).toBe(false);
  });

  it('requires enough characters', () => {
    expect(isRapidScannerBurst([0, 10, 20])).toBe(false);
  });
});

import { describe, expect, it } from 'vitest';
import { cashierCountGuidance } from './cashier-count-guidance';

describe('cashierCountGuidance', () => {
  it('treats counts within the configured threshold as close', () => {
    expect(cashierCountGuidance(1_050, 1_000, 100)).toBe('close');
    expect(cashierCountGuidance(900, 1_000, 100)).toBe('close');
  });

  it('requests a recount up to three times the threshold', () => {
    expect(cashierCountGuidance(1_101, 1_000, 100)).toBe('recount');
    expect(cashierCountGuidance(700, 1_000, 100)).toBe('recount');
  });

  it('flags larger differences', () => {
    expect(cashierCountGuidance(1_301, 1_000, 100)).toBe('large-difference');
  });

  it('requires an exact match when the configured threshold is zero', () => {
    expect(cashierCountGuidance(1_000, 1_000, 0)).toBe('close');
    expect(cashierCountGuidance(1_001, 1_000, 0)).toBe('large-difference');
  });
});

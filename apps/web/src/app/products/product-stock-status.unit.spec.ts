import { describe, expect, it } from 'vitest';
import { variantNeedsRestock } from './product-stock-status';

const trackedVariant = {
  kind: 'good',
  track_inventory: true,
  variant_active: true,
  product_active: true,
} as const;

describe('variantNeedsRestock', () => {
  it('includes zero stock and stock exactly at the company threshold', () => {
    expect(variantNeedsRestock(trackedVariant, 0, 5)).toBe(true);
    expect(variantNeedsRestock(trackedVariant, 5, 5)).toBe(true);
    expect(variantNeedsRestock(trackedVariant, 6, 5)).toBe(false);
  });

  it('excludes services, untracked variants, and inactive catalog records', () => {
    expect(variantNeedsRestock({ ...trackedVariant, kind: 'service' }, 0, 5)).toBe(false);
    expect(variantNeedsRestock({ ...trackedVariant, track_inventory: false }, 0, 5)).toBe(false);
    expect(variantNeedsRestock({ ...trackedVariant, variant_active: false }, 0, 5)).toBe(false);
    expect(variantNeedsRestock({ ...trackedVariant, product_active: false }, 0, 5)).toBe(false);
  });
});

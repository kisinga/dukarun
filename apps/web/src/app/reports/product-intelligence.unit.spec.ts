import { describe, expect, it } from 'vitest';
import { selectDashboardSignalCandidates } from './product-intelligence';
import type { DashboardProductSignals, DashboardTopVariant } from './reports.service';

const row = (variant_id: string, quantity = 1): DashboardTopVariant => ({
  variant_id,
  quantity,
  revenue: quantity * 100,
  cogs: quantity * 60,
  margin: quantity * 40,
});

describe('product intelligence', () => {
  it('deduplicates restock, margin, and movement candidates', () => {
    const signals: DashboardProductSignals = {
      restockRisks: [{ variant_id: 'a', quantity: 10, stock: 2, low_stock_threshold: 5 }],
      fastVariants: [row('c', 8)],
    };
    const selected = selectDashboardSignalCandidates([row('b'), row('a')], signals);
    expect(selected.map(item => `${item.kind}:${item.row.variant_id}`)).toEqual([
      'restock:a',
      'margin:b',
      'movement:c',
    ]);
  });

  it('drops duplicate leaders from different variants of the same product', () => {
    const signals: DashboardProductSignals = {
      restockRisks: [{ variant_id: 'a-small', quantity: 10, stock: 2, low_stock_threshold: 5 }],
      fastVariants: [row('a-large', 10), row('c', 8)],
    };
    const products = new Map([
      ['a-small', 'a'],
      ['a-large', 'a'],
      ['b', 'b'],
      ['c', 'c'],
    ]);
    const selected = selectDashboardSignalCandidates(
      [row('a-large'), row('b')],
      signals,
      variantId => products.get(variantId) ?? variantId
    );
    expect(selected.map(item => `${item.kind}:${item.row.variant_id}`)).toEqual([
      'restock:a-small',
    ]);
  });
});

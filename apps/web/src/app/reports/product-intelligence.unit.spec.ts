import { describe, expect, it } from 'vitest';
import {
  selectDashboardPerformanceLeaders,
  selectDashboardSignalCandidates,
} from './product-intelligence';
import type { DashboardProductSignals, DashboardTopVariant } from './reports.service';
import type { ProductPerformanceResponse } from '../core/product-performance.models';

const row = (variant_id: string, quantity = 1): DashboardTopVariant => ({
  variant_id,
  quantity,
  revenue: quantity * 100,
  cogs: quantity * 60,
  margin: quantity * 40,
});

describe('product intelligence', () => {
  it('selects the next eligible unique product for overlapping leader categories', () => {
    const performanceRow = (variant_id: string, product_id: string) => ({
      variant_id,
      product_id,
      product_name: product_id,
      variant_name: 'Default',
      stock_unit: 'pcs',
      current_quantity: 5,
      robust_quantity: 4,
      previous_robust_quantity: 2,
      revenue: 500,
      margin: 200,
      order_count: 4,
      active_days: 3,
      trend_score: 0.8,
      confidence: 'medium' as const,
      outlier_detected: false,
      outlier_share: 0,
      stock: 10,
      planning_daily_demand: 0.5,
      days_of_cover: 20,
    });
    const performance: ProductPerformanceResponse = {
      windowDays: 7,
      generatedAt: '',
      financialsIncluded: true,
      leaders: {
        trending: [performanceRow('a-small', 'a')],
        volume: [performanceRow('a-large', 'a'), performanceRow('b', 'b')],
        margin: [
          performanceRow('a-large', 'a'),
          performanceRow('b', 'b'),
          performanceRow('c', 'c'),
        ],
        consistent: [performanceRow('b', 'b'), performanceRow('d', 'd')],
      },
    };
    expect(
      selectDashboardPerformanceLeaders(performance).map(
        item => `${item.kind}:${item.row.variant_id}`
      )
    ).toEqual(['trending:a-small', 'volume:b', 'margin:c', 'consistent:d']);
  });

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

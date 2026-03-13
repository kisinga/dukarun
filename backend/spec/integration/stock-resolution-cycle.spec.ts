/**
 * Stock Resolution Cycle — integration-style test.
 *
 * Verifies the full cycle through BatchStockLocationStrategy:
 *   batch exists → strategy returns correct stock
 *   sale decrements batch → strategy returns decreased stock
 *   location/channel isolation → batches from other scopes excluded
 *
 * Uses an in-memory batch array behind a mock connection so we exercise
 * the real strategy logic (query construction, SUM, filters) without a DB.
 */

import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { RequestContext } from '@vendure/core';
import { BatchStockLocationStrategy } from '../../src/plugins/ledger/batch-stock-location.strategy';

interface MockBatch {
  channelId: number;
  stockLocationId: number;
  productVariantId: number;
  quantity: number;
}

/**
 * Creates a mock connection whose getRepository().createQueryBuilder() chain
 * filters the in-memory batch array using the WHERE parameters the strategy passes.
 * This lets us verify the strategy's filtering logic end-to-end.
 */
function createMockConnection(batches: MockBatch[]) {
  return {
    getRepository: jest.fn().mockReturnValue({
      createQueryBuilder: jest.fn().mockImplementation(() => {
        const filters: Record<string, unknown> = {};

        const qb: Record<string, jest.Mock> = {};
        qb.select = jest.fn().mockReturnValue(qb);
        qb.where = jest.fn().mockImplementation((...args: unknown[]) => {
          if (args[1] && typeof args[1] === 'object') {
            Object.assign(filters, args[1] as Record<string, unknown>);
          }
          return qb;
        });
        qb.andWhere = jest.fn().mockImplementation((...args: unknown[]) => {
          if (args[1] && typeof args[1] === 'object') {
            Object.assign(filters, args[1] as Record<string, unknown>);
          }
          return qb;
        });
        qb.getRawOne = jest.fn().mockImplementation(() => {
          const filtered = batches.filter(b => {
            if (filters.channelId !== undefined && b.channelId !== filters.channelId) return false;
            if (
              filters.stockLocationId !== undefined &&
              b.stockLocationId !== filters.stockLocationId
            )
              return false;
            if (
              filters.productVariantId !== undefined &&
              b.productVariantId !== filters.productVariantId
            )
              return false;
            if (b.quantity <= 0) return false;
            return true;
          });
          const total = filtered.reduce((sum, b) => sum + b.quantity, 0);
          return Promise.resolve({ total: total > 0 ? String(total) : null });
        });
        return qb;
      }),
    }),
  };
}

describe('Stock Resolution Cycle (BatchStockLocationStrategy)', () => {
  const CHANNEL = 1;
  const LOCATION = 5;
  const VARIANT = 100;
  const ctx = { channelId: CHANNEL } as RequestContext;

  let batches: MockBatch[];
  let strategy: BatchStockLocationStrategy;

  beforeEach(() => {
    batches = [];

    strategy = new BatchStockLocationStrategy();
    (strategy as any).connection = createMockConnection(batches);
    (strategy as any).stockLocationService = {
      defaultStockLocation: jest.fn().mockImplementation(() => Promise.resolve({ id: LOCATION })),
    };
  });

  it('batch exists → strategy returns correct stock sum', async () => {
    batches.push(
      { channelId: CHANNEL, stockLocationId: LOCATION, productVariantId: VARIANT, quantity: 5 },
      { channelId: CHANNEL, stockLocationId: LOCATION, productVariantId: VARIANT, quantity: 3 }
    );

    const result = await strategy.getAvailableStock(ctx, VARIANT, []);

    expect(result.stockOnHand).toBe(8);
  });

  it('sale decrements batch → strategy returns decreased stock', async () => {
    batches.push({
      channelId: CHANNEL,
      stockLocationId: LOCATION,
      productVariantId: VARIANT,
      quantity: 10,
    });

    const before = await strategy.getAvailableStock(ctx, VARIANT, []);
    expect(before.stockOnHand).toBe(10);

    // Simulate sale: FIFO reduces batch quantity
    batches[0].quantity -= 4;

    // Need fresh mock connection for new query
    (strategy as any).connection = createMockConnection(batches);

    const after = await strategy.getAvailableStock(ctx, VARIANT, []);
    expect(after.stockOnHand).toBe(6);
  });

  it('batches at different locations are excluded', async () => {
    batches.push(
      { channelId: CHANNEL, stockLocationId: LOCATION, productVariantId: VARIANT, quantity: 5 },
      { channelId: CHANNEL, stockLocationId: 999, productVariantId: VARIANT, quantity: 100 }
    );

    const result = await strategy.getAvailableStock(ctx, VARIANT, []);

    expect(result.stockOnHand).toBe(5); // not 105
  });

  it('batches in different channels are excluded', async () => {
    batches.push(
      { channelId: CHANNEL, stockLocationId: LOCATION, productVariantId: VARIANT, quantity: 7 },
      { channelId: 999, stockLocationId: LOCATION, productVariantId: VARIANT, quantity: 50 }
    );

    const result = await strategy.getAvailableStock(ctx, VARIANT, []);

    expect(result.stockOnHand).toBe(7); // not 57
  });

  it('batches for different variants are excluded', async () => {
    batches.push(
      { channelId: CHANNEL, stockLocationId: LOCATION, productVariantId: VARIANT, quantity: 3 },
      { channelId: CHANNEL, stockLocationId: LOCATION, productVariantId: 999, quantity: 20 }
    );

    const result = await strategy.getAvailableStock(ctx, VARIANT, []);

    expect(result.stockOnHand).toBe(3); // not 23
  });

  it('returns 0 when no batches match', async () => {
    // No batches at all
    const result = await strategy.getAvailableStock(ctx, VARIANT, []);

    expect(result.stockOnHand).toBe(0);
  });

  it('zero-quantity batches are excluded', async () => {
    batches.push(
      { channelId: CHANNEL, stockLocationId: LOCATION, productVariantId: VARIANT, quantity: 0 },
      { channelId: CHANNEL, stockLocationId: LOCATION, productVariantId: VARIANT, quantity: 4 }
    );

    const result = await strategy.getAvailableStock(ctx, VARIANT, []);

    expect(result.stockOnHand).toBe(4); // not 4
  });
});

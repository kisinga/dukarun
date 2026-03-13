/**
 * BatchStockLocationStrategy tests.
 *
 * This is the GLOBAL stock resolution path — the only code that determines
 * what GraphQL `stockOnHand` returns. If these tests break, stock display
 * is broken for all users.
 *
 * @see BatchAwareStockLevelService for the separate, module-scoped override
 *      (which does NOT affect GraphQL queries due to NestJS module scoping).
 */

import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { RequestContext } from '@vendure/core';
import { BatchStockLocationStrategy } from '../../../src/plugins/ledger/batch-stock-location.strategy';

describe('BatchStockLocationStrategy', () => {
  const CHANNEL_ID = 1;
  const LOCATION_ID = 5;
  const VARIANT_ID = 100;
  const ctx = { channelId: CHANNEL_ID } as RequestContext;

  let strategy: BatchStockLocationStrategy;
  let mockStockLocationService: any;
  let mockQueryBuilder: any;
  let mockRepository: any;
  let mockConnection: any;
  let andWhereCalls: Array<[string, any]>;

  beforeEach(() => {
    andWhereCalls = [];

    mockStockLocationService = {
      defaultStockLocation: jest
        .fn()
        .mockImplementation(() => Promise.resolve({ id: LOCATION_ID })),
    };

    mockQueryBuilder = {
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockImplementation((...args: unknown[]) => {
        andWhereCalls.push([args[0] as string, args[1]]);
        return mockQueryBuilder;
      }),
      getRawOne: jest.fn().mockImplementation(() => Promise.resolve({ total: '8' })),
    };

    mockRepository = {
      createQueryBuilder: jest.fn().mockReturnValue(mockQueryBuilder),
    };

    mockConnection = {
      getRepository: jest.fn().mockReturnValue(mockRepository),
    };

    strategy = new BatchStockLocationStrategy();
    // Bypass init() — set dependencies directly (same pattern as batch-aware-stock-level.service.spec.ts)
    (strategy as any).connection = mockConnection;
    (strategy as any).stockLocationService = mockStockLocationService;
  });

  describe('getAvailableStock', () => {
    it('returns batch sum filtered by channel, location, and variant', async () => {
      const result = await strategy.getAvailableStock(ctx, VARIANT_ID, []);

      expect(result).toEqual({ stockOnHand: 8, stockAllocated: 0 });
      expect(mockStockLocationService.defaultStockLocation).toHaveBeenCalledWith(ctx);
      expect(mockConnection.getRepository).toHaveBeenCalled();
    });

    it('includes stockLocationId in the WHERE clause (regression)', async () => {
      await strategy.getAvailableStock(ctx, VARIANT_ID, []);

      const stockLocationClause = andWhereCalls.find(([clause]) =>
        clause.includes('stockLocationId')
      );
      expect(stockLocationClause).toBeDefined();
      expect(stockLocationClause![1]).toEqual({
        stockLocationId: Number(LOCATION_ID),
      });
    });

    it('includes channelId and productVariantId in the WHERE clause', async () => {
      await strategy.getAvailableStock(ctx, VARIANT_ID, []);

      // channelId is in .where(), not .andWhere()
      expect(mockQueryBuilder.where).toHaveBeenCalledWith(expect.stringContaining('channelId'), {
        channelId: CHANNEL_ID,
      });

      const variantClause = andWhereCalls.find(([clause]) => clause.includes('productVariantId'));
      expect(variantClause).toBeDefined();
      expect(variantClause![1]).toEqual({
        productVariantId: Number(VARIANT_ID),
      });
    });

    it('returns 0 when no batches exist', async () => {
      mockQueryBuilder.getRawOne.mockImplementation(() => Promise.resolve({ total: null }));

      const result = await strategy.getAvailableStock(ctx, VARIANT_ID, []);

      expect(result).toEqual({ stockOnHand: 0, stockAllocated: 0 });
    });

    it('falls back to super when ctx.channelId is falsy', async () => {
      const noChannelCtx = {} as RequestContext;

      // super.getAvailableStock calls stockLocationStrategy internally;
      // we just verify it doesn't query batches
      const result = await strategy.getAvailableStock(noChannelCtx, VARIANT_ID, []);

      expect(mockStockLocationService.defaultStockLocation).not.toHaveBeenCalled();
      expect(mockConnection.getRepository).not.toHaveBeenCalled();
      // Super delegates to parent strategy which returns aggregated stock levels;
      // with empty stockLevels array and no channel, returns 0
      expect(result.stockOnHand).toBe(0);
    });

    it('falls back to super when defaultStockLocation returns null', async () => {
      mockStockLocationService.defaultStockLocation.mockImplementation(() => Promise.resolve(null));

      const result = await strategy.getAvailableStock(ctx, VARIANT_ID, []);

      expect(mockStockLocationService.defaultStockLocation).toHaveBeenCalledWith(ctx);
      expect(mockConnection.getRepository).not.toHaveBeenCalled();
      expect(result.stockOnHand).toBe(0);
    });

    it('falls back to super when defaultStockLocation returns object without id', async () => {
      mockStockLocationService.defaultStockLocation.mockImplementation(() =>
        Promise.resolve({ name: 'Default' })
      );

      const result = await strategy.getAvailableStock(ctx, VARIANT_ID, []);

      expect(mockConnection.getRepository).not.toHaveBeenCalled();
      expect(result.stockOnHand).toBe(0);
    });

    it('falls back to super on query error (bootstrap/migration)', async () => {
      mockQueryBuilder.getRawOne.mockImplementation(() =>
        Promise.reject(new Error('relation "inventory_batch" does not exist'))
      );

      const result = await strategy.getAvailableStock(ctx, VARIANT_ID, []);

      // Should not throw — falls back gracefully
      expect(result.stockOnHand).toBe(0);
    });

    it('always reports stockAllocated as 0', async () => {
      const result = await strategy.getAvailableStock(ctx, VARIANT_ID, []);

      expect(result.stockAllocated).toBe(0);
    });
  });
});

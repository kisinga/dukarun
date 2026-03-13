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
  const VARIANT_ID = 100;
  const ctx = { channelId: CHANNEL_ID } as RequestContext;

  let strategy: BatchStockLocationStrategy;
  let mockQueryBuilder: any;
  let mockRepository: any;
  let mockConnection: any;
  let whereCalls: Array<[string, any]>;
  let andWhereCalls: Array<[string, any]>;

  beforeEach(() => {
    whereCalls = [];
    andWhereCalls = [];

    mockQueryBuilder = {
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockImplementation((...args: unknown[]) => {
        whereCalls.push([args[0] as string, args[1]]);
        return mockQueryBuilder;
      }),
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
    (strategy as any).connection = mockConnection;
  });

  describe('getAvailableStock', () => {
    it('returns batch sum filtered by channel and variant', async () => {
      const result = await strategy.getAvailableStock(ctx, VARIANT_ID, []);

      expect(result).toEqual({ stockOnHand: 8, stockAllocated: 0 });
      expect(mockConnection.getRepository).toHaveBeenCalled();
    });

    it('does NOT filter by stockLocationId — sums across all locations for channel', async () => {
      await strategy.getAvailableStock(ctx, VARIANT_ID, []);

      const stockLocationClause = andWhereCalls.find(([clause]) =>
        clause.includes('stockLocationId')
      );
      expect(stockLocationClause).toBeUndefined();
    });

    it('includes channelId and productVariantId in the WHERE clause', async () => {
      await strategy.getAvailableStock(ctx, VARIANT_ID, []);

      const channelClause = whereCalls.find(([clause]) => clause.includes('channelId'));
      expect(channelClause).toBeDefined();
      expect(channelClause![1]).toEqual({ channelId: CHANNEL_ID });

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

      const result = await strategy.getAvailableStock(noChannelCtx, VARIANT_ID, []);

      expect(mockConnection.getRepository).not.toHaveBeenCalled();
      expect(result.stockOnHand).toBe(0);
    });

    it('falls back to super on query error (bootstrap/migration)', async () => {
      mockQueryBuilder.getRawOne.mockImplementation(() =>
        Promise.reject(new Error('relation "inventory_batch" does not exist'))
      );

      const result = await strategy.getAvailableStock(ctx, VARIANT_ID, []);

      expect(result.stockOnHand).toBe(0);
    });

    it('always reports stockAllocated as 0', async () => {
      const result = await strategy.getAvailableStock(ctx, VARIANT_ID, []);

      expect(result.stockAllocated).toBe(0);
    });
  });
});

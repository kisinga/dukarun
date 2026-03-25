/**
 * BatchAwareStockLevelService tests.
 *
 * NOTE: This service is module-scoped to LedgerPlugin. The global stock resolution
 * for GraphQL queries (stockOnHand) goes through BatchStockLocationStrategy, which
 * has its own tests in spec/plugins/ledger/batch-stock-location.strategy.spec.ts.
 * These tests verify the secondary path within LedgerPlugin's module scope
 * (used by getSaleableStockLevel, getFulfillableStockLevel for add-item/fulfillment).
 */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import {
  ConfigService,
  RequestContext,
  StockLocationService,
  TransactionalConnection,
} from '@vendure/core';
import { BatchAwareStockLevelService } from '../../../src/services/stock/batch-aware-stock-level.service';

describe('BatchAwareStockLevelService', () => {
  const ctx = { channelId: 1 } as RequestContext;
  let connection: any;
  let stockLocationService: any;
  let configService: any;
  let inventoryStore: any;

  beforeEach(() => {
    connection = {};
    stockLocationService = {
      defaultStockLocation: jest.fn().mockImplementation(() => Promise.resolve({ id: 'loc_1' })),
    };
    configService = {
      catalogOptions: {
        stockLocationStrategy: {
          getAvailableStock: jest
            .fn()
            .mockImplementation(() => Promise.resolve({ stockOnHand: 0, stockAllocated: 0 })),
        },
      },
    };
    inventoryStore = {
      getOpenBatches: jest.fn().mockImplementation(() =>
        Promise.resolve([
          { id: 'b1', quantity: 4, productVariantId: 100 },
          { id: 'b2', quantity: 2, productVariantId: 100 },
        ])
      ),
    };
  });

  describe('getAvailableStock with InventoryStore', () => {
    it('returns sum of batch quantities and zero allocated', async () => {
      const service = new BatchAwareStockLevelService(
        connection,
        stockLocationService,
        configService,
        inventoryStore
      );

      const result = await service.getAvailableStock(ctx, 'variant_100');

      expect(stockLocationService.defaultStockLocation).toHaveBeenCalledWith(ctx);
      expect(inventoryStore.getOpenBatches).toHaveBeenCalledWith(ctx, {
        channelId: 1,
        stockLocationId: 'loc_1',
        productVariantId: 'variant_100',
      });
      expect(result).toEqual({ stockOnHand: 6, stockAllocated: 0 });
    });

    it('returns zero when no batches', async () => {
      inventoryStore.getOpenBatches.mockImplementation(() => Promise.resolve([]));
      const service = new BatchAwareStockLevelService(
        connection,
        stockLocationService,
        configService,
        inventoryStore
      );

      const result = await service.getAvailableStock(ctx, 'variant_100');

      expect(result).toEqual({ stockOnHand: 0, stockAllocated: 0 });
    });

    it('returns zero when defaultStockLocation returns no id', async () => {
      stockLocationService.defaultStockLocation.mockImplementation(() => Promise.resolve(null));
      const service = new BatchAwareStockLevelService(
        connection,
        stockLocationService,
        configService,
        inventoryStore
      );

      const result = await service.getAvailableStock(ctx, 'variant_100');

      expect(inventoryStore.getOpenBatches).not.toHaveBeenCalled();
      expect(result).toEqual({ stockOnHand: 0, stockAllocated: 0 });
    });

    it('returns zero when defaultStockLocation returns object without id', async () => {
      stockLocationService.defaultStockLocation.mockImplementation(() =>
        Promise.resolve({ name: 'Loc' })
      );
      const service = new BatchAwareStockLevelService(
        connection,
        stockLocationService,
        configService,
        inventoryStore
      );

      const result = await service.getAvailableStock(ctx, 'variant_100');

      expect(inventoryStore.getOpenBatches).not.toHaveBeenCalled();
      expect(result).toEqual({ stockOnHand: 0, stockAllocated: 0 });
    });

    it('returns correct sum and zero allocated for single batch', async () => {
      inventoryStore.getOpenBatches.mockImplementation(() =>
        Promise.resolve([{ id: 'b1', quantity: 10, productVariantId: 100 }])
      );
      const service = new BatchAwareStockLevelService(
        connection,
        stockLocationService,
        configService,
        inventoryStore
      );

      const result = await service.getAvailableStock(ctx, 'variant_100');

      expect(result).toEqual({ stockOnHand: 10, stockAllocated: 0 });
    });

    it('returns fractional batch quantity as stockOnHand with zero allocated', async () => {
      inventoryStore.getOpenBatches.mockImplementation(() =>
        Promise.resolve([{ id: 'b1', quantity: 2.5, productVariantId: 100 }])
      );
      const service = new BatchAwareStockLevelService(
        connection,
        stockLocationService,
        configService,
        inventoryStore
      );

      const result = await service.getAvailableStock(ctx, 'variant_100');

      expect(result.stockOnHand).toBe(2.5);
      expect(result.stockAllocated).toBe(0);
    });
  });

  describe('getAvailableStock without InventoryStore', () => {
    it('returns zero when InventoryStore is undefined (no fallback)', async () => {
      const service = new BatchAwareStockLevelService(
        connection,
        stockLocationService,
        configService,
        undefined
      );

      const result = await service.getAvailableStock(ctx, 'variant_100');

      expect(stockLocationService.defaultStockLocation).not.toHaveBeenCalled();
      expect(result).toEqual({ stockOnHand: 0, stockAllocated: 0 });
    });

    it('returns zero when ctx.channelId is missing (no fallback)', async () => {
      const noChannelCtx = {} as RequestContext;
      const service = new BatchAwareStockLevelService(
        connection,
        stockLocationService,
        configService,
        inventoryStore
      );

      const result = await service.getAvailableStock(noChannelCtx, 'variant_100');

      expect(inventoryStore.getOpenBatches).not.toHaveBeenCalled();
      expect(result).toEqual({ stockOnHand: 0, stockAllocated: 0 });
    });
  });
});

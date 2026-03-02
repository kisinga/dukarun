/**
 * BatchAwareStockLevelService tests.
 *
 * Ensures getAvailableStock returns batch-based stock when InventoryStore is
 * available, and falls back to default Vendure behavior when it is not.
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

    it('falls back to super when defaultStockLocation returns no id', async () => {
      stockLocationService.defaultStockLocation.mockImplementation(() => Promise.resolve(null));
      connection.getRepository = jest.fn().mockReturnValue({
        find: jest.fn().mockImplementation(() => Promise.resolve([])),
      });
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
  });

  describe('getAvailableStock without InventoryStore (fallback)', () => {
    it('calls parent getAvailableStock when InventoryStore is undefined', async () => {
      connection.getRepository = jest.fn().mockReturnValue({
        find: jest.fn().mockImplementation(() => Promise.resolve([])),
      });
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

    it('falls back when ctx.channelId is missing', async () => {
      const noChannelCtx = {} as RequestContext;
      connection.getRepository = jest.fn().mockReturnValue({
        find: jest.fn().mockImplementation(() => Promise.resolve([])),
      });
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

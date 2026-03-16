/**
 * InventoryService — opening stock batch tests
 *
 * Covers:
 * - createOpeningStockBatches: creates batches and movements with correct sourceId
 * - createOpeningStockBatches: skips lines with quantity <= 0
 * - ensureOpeningStockBatchIfNeeded: creates batch when none exist
 * - ensureOpeningStockBatchIfNeeded: no-op when batches already exist
 * - ensureOpeningStockBatchIfNeeded: no-op when quantity <= 0
 */

import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { RequestContext, TransactionalConnection } from '@vendure/core';
import { InventoryService } from '../../../src/services/inventory/inventory.service';
import { InventoryStoreService } from '../../../src/services/inventory/inventory-store.service';
import { InventoryStore } from '../../../src/services/inventory/interfaces/inventory-store.interface';
import { CostingStrategy } from '../../../src/services/inventory/interfaces/costing-strategy.interface';
import { ExpiryPolicy } from '../../../src/services/inventory/interfaces/expiry-policy.interface';
import { LedgerPostingService } from '../../../src/services/financial/ledger-posting.service';
import { StockValuationService } from '../../../src/services/financial/stock-valuation.service';
import { MovementType } from '../../../src/services/inventory/entities/inventory-movement.entity';

describe('InventoryService — opening stock batches', () => {
  const ctx = { channelId: 1 } as RequestContext;

  const buildService = () => {
    const inventoryStore: InventoryStore = {
      createBatch: jest.fn() as any,
      getOpenBatches: jest.fn() as any,
      getOpenBatchesForConsumption: jest.fn() as any,
      updateBatchQuantity: jest.fn() as any,
      createMovement: jest.fn() as any,
      getMovements: jest.fn() as any,
      verifyBatchExists: jest.fn() as any,
      verifyStockLevel: jest.fn() as any,
      getValuationSnapshot: jest.fn() as any,
    };

    const costingStrategy: CostingStrategy = {
      allocateCost: jest.fn() as any,
      getName: jest.fn().mockReturnValue('FIFO') as any,
    };

    const expiryPolicy: ExpiryPolicy = {
      validateBeforeConsume: jest.fn() as any,
      onBatchCreated: jest.fn() as any,
      onBatchExpired: jest.fn() as any,
      getName: jest.fn().mockReturnValue('DEFAULT') as any,
    };

    const ledgerPostingService = {
      postInventoryPurchase: jest.fn(),
      postInventorySaleCogs: jest.fn(),
      postInventoryWriteOff: jest.fn(),
    } as unknown as LedgerPostingService;

    const stockValuationService = {
      invalidateCache: jest.fn(),
    } as unknown as StockValuationService;

    const mockRepo = {
      create: jest.fn((dto: any) => dto),
      save: jest.fn((entity: any) => Promise.resolve(entity)),
    };
    const connection = {
      withTransaction: jest.fn((_ctx: any, fn: any) => fn(_ctx)),
      getRepository: jest.fn(() => mockRepo),
    } as unknown as TransactionalConnection;

    const service = new InventoryService(
      connection,
      inventoryStore as unknown as InventoryStoreService,
      costingStrategy as any,
      expiryPolicy as any,
      ledgerPostingService,
      stockValuationService
    );

    return { service, inventoryStore };
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('createOpeningStockBatches', () => {
    it('creates batch and movement with correct sourceId and sourceType', async () => {
      const { service, inventoryStore } = buildService();
      const mockBatch = { id: 'batch-1' };
      const mockMovement = { id: 'movement-1' };

      (inventoryStore.createBatch as any).mockResolvedValue(mockBatch);
      (inventoryStore.createMovement as any).mockResolvedValue(mockMovement);

      const result = await service.createOpeningStockBatches(ctx, {
        channelId: 1,
        stockLocationId: 2,
        lines: [{ productVariantId: 3, quantity: 50 }],
      });

      expect(result.batches).toHaveLength(1);
      expect(result.movements).toHaveLength(1);

      expect(inventoryStore.createBatch).toHaveBeenCalledWith(
        ctx,
        expect.objectContaining({
          channelId: 1,
          stockLocationId: 2,
          productVariantId: 3,
          quantity: 50,
          unitCost: 0,
          sourceType: 'OpeningStock',
          sourceId: 'OpeningStock:3:2',
        })
      );

      expect(inventoryStore.createMovement).toHaveBeenCalledWith(
        ctx,
        expect.objectContaining({
          movementType: MovementType.PURCHASE,
          quantity: 50,
          batchId: 'batch-1',
          sourceType: 'OpeningStock',
          sourceId: 'OpeningStock:3:2',
          metadata: { openingStock: true },
        })
      );
    });

    it('skips lines with quantity <= 0', async () => {
      const { service, inventoryStore } = buildService();

      const result = await service.createOpeningStockBatches(ctx, {
        channelId: 1,
        stockLocationId: 2,
        lines: [
          { productVariantId: 3, quantity: 0 },
          { productVariantId: 4, quantity: -5 },
        ],
      });

      expect(result.batches).toHaveLength(0);
      expect(result.movements).toHaveLength(0);
      expect(inventoryStore.createBatch).not.toHaveBeenCalled();
    });

    it('creates batches for multiple lines', async () => {
      const { service, inventoryStore } = buildService();

      (inventoryStore.createBatch as any)
        .mockResolvedValueOnce({ id: 'batch-1' })
        .mockResolvedValueOnce({ id: 'batch-2' });
      (inventoryStore.createMovement as any).mockResolvedValue({ id: 'mov-1' });

      const result = await service.createOpeningStockBatches(ctx, {
        channelId: 1,
        stockLocationId: 2,
        lines: [
          { productVariantId: 3, quantity: 50 },
          { productVariantId: 4, quantity: 100 },
        ],
      });

      expect(result.batches).toHaveLength(2);
      expect(result.movements).toHaveLength(2);
      expect(inventoryStore.createBatch).toHaveBeenCalledTimes(2);
    });
  });

  describe('ensureOpeningStockBatchIfNeeded', () => {
    it('creates batch when no batches exist for the variant', async () => {
      const { service, inventoryStore } = buildService();

      (inventoryStore.getOpenBatches as any).mockResolvedValue([]);
      (inventoryStore.createBatch as any).mockResolvedValue({ id: 'batch-1' });
      (inventoryStore.createMovement as any).mockResolvedValue({ id: 'mov-1' });

      const result = await service.ensureOpeningStockBatchIfNeeded(ctx, 3, 2, 50);

      expect(result).not.toBeNull();
      expect(inventoryStore.getOpenBatches).toHaveBeenCalledWith(
        ctx,
        expect.objectContaining({
          channelId: 1,
          stockLocationId: 2,
          productVariantId: 3,
        })
      );
      expect(inventoryStore.createBatch).toHaveBeenCalledWith(
        ctx,
        expect.objectContaining({
          quantity: 50,
          unitCost: 0,
          sourceType: 'OpeningStock',
        })
      );
    });

    it('returns null when batches already exist (no-op)', async () => {
      const { service, inventoryStore } = buildService();
      const existingBatch = { id: 'batch-existing', quantity: 30 };

      (inventoryStore.getOpenBatches as any).mockResolvedValue([existingBatch]);

      const result = await service.ensureOpeningStockBatchIfNeeded(ctx, 3, 2, 50);

      expect(result).toBeNull();
      expect(inventoryStore.createBatch).not.toHaveBeenCalled();
    });

    it('returns null when quantity <= 0', async () => {
      const { service, inventoryStore } = buildService();

      const result = await service.ensureOpeningStockBatchIfNeeded(ctx, 3, 2, 0);

      expect(result).toBeNull();
      expect(inventoryStore.getOpenBatches).not.toHaveBeenCalled();
    });
  });
});

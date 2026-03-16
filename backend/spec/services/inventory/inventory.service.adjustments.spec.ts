/**
 * InventoryService — applyAdjustmentToBatches tests
 *
 * Covers:
 * - Single batch: increase applied to it
 * - Single batch: decrease applied to it
 * - Multiple batches + explicit batchId: targets the specified batch
 * - Multiple batches + no batchId + increase: auto-selects most recent batch
 * - Multiple batches + no batchId + decrease: FIFO across batches
 * - No batches + increase: creates zero-cost batch
 * - Insufficient stock: throws UserInputError
 */

import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { RequestContext, TransactionalConnection, UserInputError } from '@vendure/core';
import { InventoryService } from '../../../src/services/inventory/inventory.service';
import { InventoryStoreService } from '../../../src/services/inventory/inventory-store.service';
import { InventoryStore } from '../../../src/services/inventory/interfaces/inventory-store.interface';
import { CostingStrategy } from '../../../src/services/inventory/interfaces/costing-strategy.interface';
import { ExpiryPolicy } from '../../../src/services/inventory/interfaces/expiry-policy.interface';
import { LedgerPostingService } from '../../../src/services/financial/ledger-posting.service';
import { StockValuationService } from '../../../src/services/financial/stock-valuation.service';

describe('InventoryService — applyAdjustmentToBatches', () => {
  const ctx = { channelId: 1 } as RequestContext;

  const makeBatch = (overrides: Record<string, any> = {}) => ({
    id: 'batch-1',
    channelId: 1,
    stockLocationId: 2,
    productVariantId: 3,
    quantity: 50,
    unitCost: 1000,
    expiryDate: null,
    sourceType: 'Purchase',
    sourceId: 'purchase-1',
    metadata: null,
    createdAt: new Date('2025-01-01'),
    updatedAt: new Date('2025-01-01'),
    ...overrides,
  });

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

    return { service, inventoryStore, connection };
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  const baseInput = {
    channelId: 1,
    stockLocationId: 2,
    productVariantId: 3,
    adjustmentId: 'adj-1',
  };

  describe('single batch', () => {
    it('increase: applies to the single batch', async () => {
      const { service, inventoryStore } = buildService();
      const batch = makeBatch();

      (inventoryStore.getOpenBatchesForConsumption as any).mockResolvedValue([batch]);
      (inventoryStore.updateBatchQuantity as any).mockResolvedValue({ ...batch, quantity: 60 });
      (inventoryStore.createMovement as any).mockResolvedValue({});

      const result = await service.applyAdjustmentToBatches(ctx, {
        ...baseInput,
        quantityChange: 10,
      });

      expect(result.previousStock).toBe(50);
      expect(result.newStock).toBe(60);
      expect(result.batchId).toBe('batch-1');
      expect(inventoryStore.updateBatchQuantity).toHaveBeenCalledWith(ctx, 'batch-1', 10);
      expect(inventoryStore.createMovement).toHaveBeenCalledWith(
        ctx,
        expect.objectContaining({
          movementType: 'ADJUSTMENT',
          quantity: 10,
          batchId: 'batch-1',
        })
      );
    });

    it('decrease: applies to the single batch via FIFO', async () => {
      const { service, inventoryStore } = buildService();
      const batch = makeBatch({ quantity: 50 });

      (inventoryStore.getOpenBatchesForConsumption as any).mockResolvedValue([batch]);
      (inventoryStore.updateBatchQuantity as any).mockResolvedValue({ ...batch, quantity: 40 });
      (inventoryStore.createMovement as any).mockResolvedValue({});

      const result = await service.applyAdjustmentToBatches(ctx, {
        ...baseInput,
        quantityChange: -10,
      });

      expect(result.previousStock).toBe(50);
      expect(result.newStock).toBe(40);
      expect(inventoryStore.updateBatchQuantity).toHaveBeenCalledWith(ctx, 'batch-1', -10);
    });
  });

  describe('multiple batches with explicit batchId', () => {
    it('increase: targets the specified batch', async () => {
      const { service, inventoryStore } = buildService();
      const batch1 = makeBatch({ id: 'batch-1', quantity: 30 });
      const batch2 = makeBatch({ id: 'batch-2', quantity: 20, createdAt: new Date('2025-02-01') });

      (inventoryStore.getOpenBatchesForConsumption as any).mockResolvedValue([batch1, batch2]);
      (inventoryStore.updateBatchQuantity as any).mockResolvedValue({ ...batch1, quantity: 40 });
      (inventoryStore.createMovement as any).mockResolvedValue({});

      const result = await service.applyAdjustmentToBatches(ctx, {
        ...baseInput,
        quantityChange: 10,
        batchId: 'batch-1',
      });

      expect(result.batchId).toBe('batch-1');
      expect(inventoryStore.updateBatchQuantity).toHaveBeenCalledWith(ctx, 'batch-1', 10);
    });

    it('decrease: targets the specified batch', async () => {
      const { service, inventoryStore } = buildService();
      const batch1 = makeBatch({ id: 'batch-1', quantity: 30 });
      const batch2 = makeBatch({ id: 'batch-2', quantity: 20 });

      (inventoryStore.getOpenBatchesForConsumption as any).mockResolvedValue([batch1, batch2]);
      (inventoryStore.updateBatchQuantity as any).mockResolvedValue({ ...batch1, quantity: 25 });
      (inventoryStore.createMovement as any).mockResolvedValue({});

      const result = await service.applyAdjustmentToBatches(ctx, {
        ...baseInput,
        quantityChange: -5,
        batchId: 'batch-1',
      });

      expect(result.batchId).toBe('batch-1');
      expect(inventoryStore.updateBatchQuantity).toHaveBeenCalledWith(ctx, 'batch-1', -5);
    });
  });

  describe('multiple batches without batchId', () => {
    it('increase: auto-selects most recent batch (last in createdAt order)', async () => {
      const { service, inventoryStore } = buildService();
      const batchOlder = makeBatch({
        id: 'batch-old',
        quantity: 30,
        createdAt: new Date('2025-01-01'),
      });
      const batchNewer = makeBatch({
        id: 'batch-new',
        quantity: 20,
        createdAt: new Date('2025-03-01'),
      });

      // getOpenBatchesForConsumption returns ordered by createdAt ASC
      (inventoryStore.getOpenBatchesForConsumption as any).mockResolvedValue([
        batchOlder,
        batchNewer,
      ]);
      (inventoryStore.updateBatchQuantity as any).mockResolvedValue({
        ...batchNewer,
        quantity: 35,
      });
      (inventoryStore.createMovement as any).mockResolvedValue({});

      const result = await service.applyAdjustmentToBatches(ctx, {
        ...baseInput,
        quantityChange: 15,
      });

      expect(result.previousStock).toBe(50);
      expect(result.newStock).toBe(65);
      expect(result.batchId).toBe('batch-new');
      expect(inventoryStore.updateBatchQuantity).toHaveBeenCalledWith(ctx, 'batch-new', 15);
      expect(inventoryStore.createMovement).toHaveBeenCalledWith(
        ctx,
        expect.objectContaining({
          batchId: 'batch-new',
          quantity: 15,
          metadata: { reason: 'adjustment', autoSelectedBatch: true },
        })
      );
    });

    it('decrease: uses FIFO across batches (oldest first)', async () => {
      const { service, inventoryStore } = buildService();
      const batchOlder = makeBatch({
        id: 'batch-old',
        quantity: 10,
        createdAt: new Date('2025-01-01'),
      });
      const batchNewer = makeBatch({
        id: 'batch-new',
        quantity: 40,
        createdAt: new Date('2025-03-01'),
      });

      (inventoryStore.getOpenBatchesForConsumption as any).mockResolvedValue([
        batchOlder,
        batchNewer,
      ]);
      (inventoryStore.updateBatchQuantity as any).mockResolvedValue({});
      (inventoryStore.createMovement as any).mockResolvedValue({});

      const result = await service.applyAdjustmentToBatches(ctx, {
        ...baseInput,
        quantityChange: -25,
      });

      expect(result.previousStock).toBe(50);
      expect(result.newStock).toBe(25);
      // Should deduct 10 from older batch (fully consumed) then 15 from newer
      expect(inventoryStore.updateBatchQuantity).toHaveBeenCalledTimes(2);
      expect(inventoryStore.updateBatchQuantity).toHaveBeenCalledWith(ctx, 'batch-old', -10);
      expect(inventoryStore.updateBatchQuantity).toHaveBeenCalledWith(ctx, 'batch-new', -15);
    });
  });

  describe('no batches', () => {
    it('increase: creates a zero-cost batch', async () => {
      const { service, inventoryStore } = buildService();
      const newBatch = makeBatch({ id: 'new-batch', unitCost: 0, sourceType: 'StockAdjustment' });

      (inventoryStore.getOpenBatchesForConsumption as any).mockResolvedValue([]);
      (inventoryStore.createBatch as any).mockResolvedValue(newBatch);
      (inventoryStore.createMovement as any).mockResolvedValue({});

      const result = await service.applyAdjustmentToBatches(ctx, {
        ...baseInput,
        quantityChange: 20,
      });

      expect(result.previousStock).toBe(0);
      expect(result.newStock).toBe(20);
      expect(inventoryStore.createBatch).toHaveBeenCalledWith(
        ctx,
        expect.objectContaining({
          quantity: 20,
          unitCost: 0,
          sourceType: 'StockAdjustment',
        })
      );
    });
  });

  describe('error cases', () => {
    it('throws when resulting stock would be negative', async () => {
      const { service, inventoryStore } = buildService();
      const batch = makeBatch({ quantity: 5 });

      (inventoryStore.getOpenBatchesForConsumption as any).mockResolvedValue([batch]);

      await expect(
        service.applyAdjustmentToBatches(ctx, {
          ...baseInput,
          quantityChange: -10,
        })
      ).rejects.toThrow(UserInputError);
    });

    it('throws when explicit batchId not found among open batches', async () => {
      const { service, inventoryStore } = buildService();
      const batch = makeBatch({ id: 'batch-1' });

      (inventoryStore.getOpenBatchesForConsumption as any).mockResolvedValue([batch]);

      await expect(
        service.applyAdjustmentToBatches(ctx, {
          ...baseInput,
          quantityChange: 10,
          batchId: 'non-existent',
        })
      ).rejects.toThrow(UserInputError);
    });

    it('throws when explicit batchId has insufficient quantity for decrease', async () => {
      const { service, inventoryStore } = buildService();
      const batch = makeBatch({ id: 'batch-1', quantity: 5 });

      (inventoryStore.getOpenBatchesForConsumption as any).mockResolvedValue([batch]);

      await expect(
        service.applyAdjustmentToBatches(ctx, {
          ...baseInput,
          quantityChange: -10,
          batchId: 'batch-1',
        })
      ).rejects.toThrow(UserInputError);
    });
  });
});

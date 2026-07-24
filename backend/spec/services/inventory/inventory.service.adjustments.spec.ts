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
import {
  InventoryValuationProjection,
  LedgerConsistencyGuard,
} from '../../../src/services/financial/ledger-projection';

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
      postInventoryAdjustment: jest.fn(),
    } as unknown as LedgerPostingService;

    const stockValuationService = {
      invalidateCache: jest.fn(),
    } as unknown as StockValuationService;

    const ledgerConsistencyGuard: LedgerConsistencyGuard = {
      assertInSync: jest.fn<() => Promise<any>>().mockResolvedValue({}),
      findDivergences: jest.fn<() => Promise<any[]>>().mockResolvedValue([]),
    } as unknown as LedgerConsistencyGuard;

    const inventoryValuationProjection: InventoryValuationProjection = {
      loadEntity: jest.fn<() => Promise<any>>().mockResolvedValue({}),
    } as unknown as InventoryValuationProjection;

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
      stockValuationService,
      ledgerConsistencyGuard,
      inventoryValuationProjection
    );

    return { service, inventoryStore, ledgerPostingService, connection };
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
      const { service, inventoryStore, ledgerPostingService } = buildService();
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
          unitCostCents: 1000,
          totalCostCents: 10000,
          batchId: 'batch-1',
        })
      );
      expect(ledgerPostingService.postInventoryAdjustment).toHaveBeenCalledWith(
        ctx,
        'StockAdjustment:adj-1:3:2',
        expect.objectContaining({
          valueChangeCents: 10000,
          reason: 'Stock adjustment',
          adjustmentId: 'adj-1',
          productVariantId: 3,
          stockLocationId: 2,
        })
      );
    });

    it('decrease: applies to the single batch via FIFO', async () => {
      const { service, inventoryStore, ledgerPostingService } = buildService();
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
      expect(ledgerPostingService.postInventoryAdjustment).toHaveBeenCalledWith(
        ctx,
        'StockAdjustment:adj-1:3:2',
        expect.objectContaining({
          valueChangeCents: -10000,
          reason: 'Stock adjustment',
          adjustmentId: 'adj-1',
          productVariantId: 3,
          stockLocationId: 2,
        })
      );
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
      const { service, inventoryStore, ledgerPostingService } = buildService();
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
      expect(ledgerPostingService.postInventoryAdjustment).toHaveBeenCalledWith(
        ctx,
        'StockAdjustment:adj-1:3:2',
        expect.objectContaining({ valueChangeCents: 15000 })
      );
    });

    it('decrease: uses FIFO across batches (oldest first)', async () => {
      const { service, inventoryStore, ledgerPostingService } = buildService();
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
      expect(ledgerPostingService.postInventoryAdjustment).toHaveBeenCalledWith(
        ctx,
        'StockAdjustment:adj-1:3:2',
        expect.objectContaining({ valueChangeCents: -25000 })
      );
    });

    it('decrease: persists one ADJUSTMENT movement per batch under the plain adjustment id', async () => {
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
      (inventoryStore.createMovement as any).mockImplementation((_ctx: any, input: any) =>
        Promise.resolve({ id: `mov-${input.batchId}`, ...input })
      );

      const result = await service.applyAdjustmentToBatches(ctx, {
        ...baseInput,
        quantityChange: -25,
      });

      // Both FIFO deductions persist their own movement — not just the first one.
      // Rows are distinguished by the batchId column, not by the sourceId string.
      expect(inventoryStore.createMovement).toHaveBeenCalledTimes(2);
      expect(inventoryStore.createMovement).toHaveBeenCalledWith(
        ctx,
        expect.objectContaining({
          movementType: 'ADJUSTMENT',
          quantity: -10,
          unitCostCents: 1000,
          totalCostCents: -10000,
          batchId: 'batch-old',
          sourceType: 'StockAdjustment',
          sourceId: 'adj-1',
        })
      );
      expect(inventoryStore.createMovement).toHaveBeenCalledWith(
        ctx,
        expect.objectContaining({
          movementType: 'ADJUSTMENT',
          quantity: -15,
          unitCostCents: 1000,
          totalCostCents: -15000,
          batchId: 'batch-new',
          sourceType: 'StockAdjustment',
          sourceId: 'adj-1',
        })
      );

      // Result carries the per-allocation cost breakdown
      expect(result.valueChangeCents).toBe(-25000);
      expect(result.allocations).toEqual([
        { batchId: 'batch-old', quantity: -10, unitCost: 1000, totalCost: -10000 },
        { batchId: 'batch-new', quantity: -15, unitCost: 1000, totalCost: -15000 },
      ]);
    });
  });

  describe('no batches', () => {
    it('increase: creates a zero-cost batch when allowZeroCost is set', async () => {
      const { service, inventoryStore, ledgerPostingService } = buildService();
      const newBatch = makeBatch({ id: 'new-batch', unitCost: 0, sourceType: 'StockAdjustment' });

      (inventoryStore.getOpenBatchesForConsumption as any).mockResolvedValue([]);
      (inventoryStore.createBatch as any).mockResolvedValue(newBatch);
      (inventoryStore.createMovement as any).mockResolvedValue({});

      const result = await service.applyAdjustmentToBatches(ctx, {
        ...baseInput,
        quantityChange: 20,
        allowZeroCost: true,
      });

      expect(result.previousStock).toBe(0);
      expect(result.newStock).toBe(20);
      expect(inventoryStore.createBatch).toHaveBeenCalledWith(
        ctx,
        expect.objectContaining({
          quantity: 20,
          unitCost: 0,
          sourceType: 'StockAdjustment',
          metadata: { costEstimated: true },
        })
      );
      expect(ledgerPostingService.postInventoryAdjustment).toHaveBeenCalledWith(
        ctx,
        'StockAdjustment:adj-1:3:2',
        expect.objectContaining({ valueChangeCents: 0 })
      );
    });

    it('increase: throws when no unitCost is given and allowZeroCost is not set', async () => {
      const { service, inventoryStore } = buildService();

      (inventoryStore.getOpenBatchesForConsumption as any).mockResolvedValue([]);

      await expect(
        service.applyAdjustmentToBatches(ctx, {
          ...baseInput,
          quantityChange: 20,
        })
      ).rejects.toThrow(UserInputError);
      expect(inventoryStore.createBatch).not.toHaveBeenCalled();
    });

    it('increase: creates a batch at the user-supplied cost', async () => {
      const { service, inventoryStore, ledgerPostingService } = buildService();
      const newBatch = makeBatch({ id: 'new-batch', unitCost: 2500, sourceType: 'StockAdjustment' });

      (inventoryStore.getOpenBatchesForConsumption as any).mockResolvedValue([]);
      (inventoryStore.createBatch as any).mockResolvedValue(newBatch);
      (inventoryStore.createMovement as any).mockResolvedValue({});

      const result = await service.applyAdjustmentToBatches(ctx, {
        ...baseInput,
        quantityChange: 20,
        unitCost: 2500,
      });

      expect(result.newStock).toBe(20);
      expect(result.valueChangeCents).toBe(50000);
      expect(result.allocations).toEqual([
        { batchId: 'new-batch', quantity: 20, unitCost: 2500, totalCost: 50000 },
      ]);
      expect(inventoryStore.createBatch).toHaveBeenCalledWith(
        ctx,
        expect.objectContaining({ quantity: 20, unitCost: 2500, sourceType: 'StockAdjustment' })
      );
      expect(inventoryStore.createMovement).toHaveBeenCalledWith(
        ctx,
        expect.objectContaining({
          movementType: 'ADJUSTMENT',
          quantity: 20,
          unitCostCents: 2500,
          totalCostCents: 50000,
          batchId: 'new-batch',
        })
      );
      expect(ledgerPostingService.postInventoryAdjustment).toHaveBeenCalledWith(
        ctx,
        'StockAdjustment:adj-1:3:2',
        expect.objectContaining({ valueChangeCents: 50000 })
      );
    });
  });

  describe('user-supplied cost', () => {
    it('equal to batch cost: merges into the batch', async () => {
      const { service, inventoryStore } = buildService();
      const batch = makeBatch({ id: 'batch-1', unitCost: 1000 });

      (inventoryStore.getOpenBatchesForConsumption as any).mockResolvedValue([batch]);
      (inventoryStore.updateBatchQuantity as any).mockResolvedValue({ ...batch, quantity: 60 });
      (inventoryStore.createMovement as any).mockResolvedValue({});

      const result = await service.applyAdjustmentToBatches(ctx, {
        ...baseInput,
        quantityChange: 10,
        unitCost: 1000,
      });

      expect(result.batchId).toBe('batch-1');
      expect(result.valueChangeCents).toBe(10000);
      expect(inventoryStore.updateBatchQuantity).toHaveBeenCalledWith(ctx, 'batch-1', 10);
      expect(inventoryStore.createBatch).not.toHaveBeenCalled();
    });

    it('different from batch cost: creates a new batch (never blends)', async () => {
      const { service, inventoryStore } = buildService();
      const batch = makeBatch({ id: 'batch-1', unitCost: 1000 });
      const newBatch = makeBatch({ id: 'new-batch', unitCost: 1500, sourceType: 'StockAdjustment' });

      (inventoryStore.getOpenBatchesForConsumption as any).mockResolvedValue([batch]);
      (inventoryStore.createBatch as any).mockResolvedValue(newBatch);
      (inventoryStore.createMovement as any).mockResolvedValue({});

      const result = await service.applyAdjustmentToBatches(ctx, {
        ...baseInput,
        quantityChange: 10,
        unitCost: 1500,
      });

      expect(result.batchId).toBe('new-batch');
      expect(result.valueChangeCents).toBe(15000);
      expect(inventoryStore.updateBatchQuantity).not.toHaveBeenCalled();
      expect(inventoryStore.createBatch).toHaveBeenCalledWith(
        ctx,
        expect.objectContaining({ unitCost: 1500, sourceType: 'StockAdjustment' })
      );
      expect(inventoryStore.createMovement).toHaveBeenCalledWith(
        ctx,
        expect.objectContaining({
          unitCostCents: 1500,
          totalCostCents: 15000,
          batchId: 'new-batch',
        })
      );
    });

    it('multiple open batches + user cost + no batchId: creates a new batch instead of auto-selecting', async () => {
      const { service, inventoryStore } = buildService();
      const batch1 = makeBatch({ id: 'batch-1', quantity: 30 });
      const batch2 = makeBatch({ id: 'batch-2', quantity: 20, createdAt: new Date('2025-02-01') });
      const newBatch = makeBatch({ id: 'new-batch', unitCost: 1500, sourceType: 'StockAdjustment' });

      (inventoryStore.getOpenBatchesForConsumption as any).mockResolvedValue([batch1, batch2]);
      (inventoryStore.createBatch as any).mockResolvedValue(newBatch);
      (inventoryStore.createMovement as any).mockResolvedValue({});

      const result = await service.applyAdjustmentToBatches(ctx, {
        ...baseInput,
        quantityChange: 10,
        unitCost: 1500,
      });

      expect(result.batchId).toBe('new-batch');
      expect(inventoryStore.updateBatchQuantity).not.toHaveBeenCalled();
      expect(inventoryStore.createBatch).toHaveBeenCalled();
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

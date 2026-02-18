/**
 * FifoCostingStrategy Tests
 *
 * Tests for FIFO (First-In-First-Out) cost allocation strategy.
 */

import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { RequestContext, UserInputError } from '@vendure/core';
import { FifoCostingStrategy } from '../../../src/services/inventory/strategies/fifo-costing.strategy';
import { InventoryStore } from '../../../src/services/inventory/interfaces/inventory-store.interface';
import { CostAllocationRequest } from '../../../src/services/inventory/interfaces/costing-strategy.interface';
import { InventoryBatch } from '../../../src/services/inventory/interfaces/inventory-store.interface';

describe('FifoCostingStrategy', () => {
  const ctx = {} as RequestContext;

  const buildService = () => {
    const inventoryStore: InventoryStore = {
      getOpenBatchesForConsumption: jest.fn() as jest.Mock,
      createBatch: jest.fn() as jest.Mock,
      getOpenBatches: jest.fn() as jest.Mock,
      updateBatchQuantity: jest.fn() as jest.Mock,
      createMovement: jest.fn() as jest.Mock,
      getMovements: jest.fn() as jest.Mock,
      verifyBatchExists: jest.fn() as jest.Mock,
      verifyStockLevel: jest.fn() as jest.Mock,
      getValuationSnapshot: jest.fn() as jest.Mock,
    } as unknown as InventoryStore;

    const strategy = new FifoCostingStrategy(inventoryStore);

    return { strategy, inventoryStore };
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getName', () => {
    it('should return FIFO', () => {
      const { strategy } = buildService();
      expect(strategy.getName()).toBe('FIFO');
    });
  });

  describe('allocateCost', () => {
    it('should request batches with orderBy createdAt for strict FIFO', async () => {
      const { strategy, inventoryStore } = buildService();
      const batches: InventoryBatch[] = [
        {
          id: 'batch-1',
          channelId: 1,
          stockLocationId: 2,
          productVariantId: 3,
          quantity: 100,
          unitCost: 5000,
          expiryDate: null,
          sourceType: 'Purchase',
          sourceId: 'purchase-1',
          metadata: null,
          createdAt: new Date('2024-01-01'),
          updatedAt: new Date('2024-01-01'),
        },
      ];
      (inventoryStore.getOpenBatchesForConsumption as any).mockResolvedValue(batches);

      const request: CostAllocationRequest = {
        channelId: 1,
        stockLocationId: 2,
        productVariantId: 3,
        quantity: 10,
        sourceType: 'Order',
        sourceId: 'order-123',
      };

      await strategy.allocateCost(ctx, request);

      expect(inventoryStore.getOpenBatchesForConsumption).toHaveBeenCalledWith(ctx, {
        channelId: 1,
        stockLocationId: 2,
        productVariantId: 3,
        maxQuantity: 10,
        excludeExpired: false,
        orderBy: 'createdAt',
      });
    });

    it('should allocate from oldest batches first', async () => {
      const { strategy, inventoryStore } = buildService();

      const batches: InventoryBatch[] = [
        {
          id: 'batch-1',
          channelId: 1,
          stockLocationId: 2,
          productVariantId: 3,
          quantity: 50,
          unitCost: 5000, // oldest, cheapest
          expiryDate: null,
          sourceType: 'Purchase',
          sourceId: 'purchase-1',
          metadata: null,
          createdAt: new Date('2024-01-01'),
          updatedAt: new Date('2024-01-01'),
        },
        {
          id: 'batch-2',
          channelId: 1,
          stockLocationId: 2,
          productVariantId: 3,
          quantity: 30,
          unitCost: 6000, // newer, more expensive
          expiryDate: null,
          sourceType: 'Purchase',
          sourceId: 'purchase-2',
          metadata: null,
          createdAt: new Date('2024-01-02'),
          updatedAt: new Date('2024-01-02'),
        },
      ];

      (inventoryStore.getOpenBatchesForConsumption as any).mockResolvedValue(batches);

      const request: CostAllocationRequest = {
        channelId: 1,
        stockLocationId: 2,
        productVariantId: 3,
        quantity: 60,
        sourceType: 'Order',
        sourceId: 'order-123',
      };

      const result = await strategy.allocateCost(ctx, request);

      expect(result.allocations).toHaveLength(2);
      expect(result.allocations[0].batchId).toBe('batch-1');
      expect(result.allocations[0].quantity).toBe(50); // All from batch-1
      expect(result.allocations[1].batchId).toBe('batch-2');
      expect(result.allocations[1].quantity).toBe(10); // Remaining from batch-2
      expect(result.totalCost).toBe(50 * 5000 + 10 * 6000); // 310000 cents
    });

    it('should allocate from single batch if sufficient', async () => {
      const { strategy, inventoryStore } = buildService();

      const batches: InventoryBatch[] = [
        {
          id: 'batch-1',
          channelId: 1,
          stockLocationId: 2,
          productVariantId: 3,
          quantity: 100,
          unitCost: 5000,
          expiryDate: null,
          sourceType: 'Purchase',
          sourceId: 'purchase-1',
          metadata: null,
          createdAt: new Date('2024-01-01'),
          updatedAt: new Date('2024-01-01'),
        },
      ];

      (inventoryStore.getOpenBatchesForConsumption as any).mockResolvedValue(batches);

      const request: CostAllocationRequest = {
        channelId: 1,
        stockLocationId: 2,
        productVariantId: 3,
        quantity: 50,
        sourceType: 'Order',
        sourceId: 'order-123',
      };

      const result = await strategy.allocateCost(ctx, request);

      expect(result.allocations).toHaveLength(1);
      expect(result.allocations[0].batchId).toBe('batch-1');
      expect(result.allocations[0].quantity).toBe(50);
      expect(result.totalCost).toBe(50 * 5000);
    });

    it('should throw error if no batches available', async () => {
      const { strategy, inventoryStore } = buildService();

      (inventoryStore.getOpenBatchesForConsumption as any).mockResolvedValue([]);

      const request: CostAllocationRequest = {
        channelId: 1,
        stockLocationId: 2,
        productVariantId: 3,
        quantity: 50,
        sourceType: 'Order',
        sourceId: 'order-123',
      };

      await expect(strategy.allocateCost(ctx, request)).rejects.toThrow(UserInputError);
    });

    it('should throw error if insufficient stock', async () => {
      const { strategy, inventoryStore } = buildService();

      const batches: InventoryBatch[] = [
        {
          id: 'batch-1',
          channelId: 1,
          stockLocationId: 2,
          productVariantId: 3,
          quantity: 30,
          unitCost: 5000,
          expiryDate: null,
          sourceType: 'Purchase',
          sourceId: 'purchase-1',
          metadata: null,
          createdAt: new Date('2024-01-01'),
          updatedAt: new Date('2024-01-01'),
        },
      ];

      (inventoryStore.getOpenBatchesForConsumption as any).mockResolvedValue(batches);

      const request: CostAllocationRequest = {
        channelId: 1,
        stockLocationId: 2,
        productVariantId: 3,
        quantity: 50,
        sourceType: 'Order',
        sourceId: 'order-123',
      };

      await expect(strategy.allocateCost(ctx, request)).rejects.toThrow(UserInputError);
    });

    it('should verify allocation matches requested quantity', async () => {
      const { strategy, inventoryStore } = buildService();

      const batches: InventoryBatch[] = [
        {
          id: 'batch-1',
          channelId: 1,
          stockLocationId: 2,
          productVariantId: 3,
          quantity: 50,
          unitCost: 5000,
          expiryDate: null,
          sourceType: 'Purchase',
          sourceId: 'purchase-1',
          metadata: null,
          createdAt: new Date('2024-01-01'),
          updatedAt: new Date('2024-01-01'),
        },
      ];

      (inventoryStore.getOpenBatchesForConsumption as any).mockResolvedValue(batches);

      const request: CostAllocationRequest = {
        channelId: 1,
        stockLocationId: 2,
        productVariantId: 3,
        quantity: 50,
        sourceType: 'Order',
        sourceId: 'order-123',
      };

      const result = await strategy.allocateCost(ctx, request);

      const allocatedQuantity = result.allocations.reduce((sum, a) => sum + a.quantity, 0);
      expect(allocatedQuantity).toBe(request.quantity);
    });
  });
});

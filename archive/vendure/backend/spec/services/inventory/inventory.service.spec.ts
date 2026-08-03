/**
 * InventoryService Tests
 *
 * Tests for the main inventory orchestration service.
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
import { MovementType } from '../../../src/services/inventory/entities/inventory-movement.entity';

describe('InventoryService', () => {
  const ctx = {
    channelId: 1,
  } as RequestContext;

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

    const ledgerPostingService: LedgerPostingService = {
      postInventoryPurchase: jest.fn(),
      postInventorySaleCogs: jest.fn(),
      postInventoryWriteOff: jest.fn(),
    } as unknown as LedgerPostingService;

    const stockValuationService: StockValuationService = {
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
      update: jest.fn((_criteria: any, _partial: any) => Promise.resolve({ affected: 1 })),
      findOne: jest.fn((_opts?: any) => Promise.resolve(null)),
    };
    const connection = {
      withTransaction: jest.fn((ctx: any, fn: any) => fn(ctx)),
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

    return {
      service,
      inventoryStore,
      costingStrategy,
      expiryPolicy,
      ledgerPostingService,
      stockValuationService,
      connection,
      ledgerConsistencyGuard,
      inventoryValuationProjection,
      mockRepo,
    };
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('recordPurchase', () => {
    it('should record purchase and create batches', async () => {
      const { service, inventoryStore, expiryPolicy, ledgerPostingService } = buildService();

      const mockBatch = {
        id: 'batch-1',
        channelId: 1,
        stockLocationId: 2,
        productVariantId: 3,
        quantity: 100,
        unitCost: 5000,
        expiryDate: null,
        sourceType: 'Purchase',
        sourceId: 'purchase-123',
        metadata: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const mockMovement = {
        id: 'movement-1',
        channelId: 1,
        stockLocationId: 2,
        productVariantId: 3,
        movementType: MovementType.PURCHASE,
        quantity: 100,
        batchId: 'batch-1',
        sourceType: 'Purchase',
        sourceId: 'purchase-123',
        metadata: null,
        createdAt: new Date(),
      };

      (inventoryStore.createBatch as any).mockResolvedValue(mockBatch);
      (inventoryStore.verifyBatchExists as any).mockResolvedValue(true);
      (inventoryStore.createMovement as any).mockResolvedValue(mockMovement);
      (expiryPolicy.onBatchCreated as any).mockResolvedValue(undefined);
      (ledgerPostingService.postInventoryPurchase as any).mockResolvedValue(undefined);

      const input = {
        purchaseId: 'purchase-123',
        channelId: 1,
        stockLocationId: 2,
        supplierId: 'supplier-456',
        purchaseReference: 'PO-001',
        isCreditPurchase: false,
        lines: [
          {
            productVariantId: 3,
            quantity: 100,
            unitCost: 5000,
            expiryDate: null,
          },
        ],
      };

      const result = await service.recordPurchase(ctx, input);

      expect(result.purchaseId).toBe('purchase-123');
      expect(result.batches).toHaveLength(1);
      expect(result.movements).toHaveLength(1);
      expect(inventoryStore.createBatch).toHaveBeenCalled();
      expect(inventoryStore.verifyBatchExists).toHaveBeenCalled();
      expect(inventoryStore.createMovement).toHaveBeenCalledWith(
        ctx,
        expect.objectContaining({ unitCostCents: 5000, totalCostCents: 500000 })
      );
      expect(expiryPolicy.onBatchCreated).toHaveBeenCalled();
      expect(ledgerPostingService.postInventoryPurchase).toHaveBeenCalled();
    });

    it('should throw error if batch verification fails', async () => {
      const { service, inventoryStore } = buildService();

      const mockBatch = {
        id: 'batch-1',
        channelId: 1,
        stockLocationId: 2,
        productVariantId: 3,
        quantity: 100,
        unitCost: 5000,
        expiryDate: null,
        sourceType: 'Purchase',
        sourceId: 'purchase-123',
        metadata: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      (inventoryStore.createBatch as any).mockResolvedValue(mockBatch);
      (inventoryStore.verifyBatchExists as any).mockResolvedValue(false);

      const input = {
        purchaseId: 'purchase-123',
        channelId: 1,
        stockLocationId: 2,
        supplierId: 'supplier-456',
        purchaseReference: 'PO-001',
        isCreditPurchase: false,
        lines: [
          {
            productVariantId: 3,
            quantity: 100,
            unitCost: 5000,
          },
        ],
      };

      await expect(service.recordPurchase(ctx, input)).rejects.toThrow();
    });
  });

  describe('recordSale', () => {
    it('should record sale and allocate COGS', async () => {
      const { service, inventoryStore, costingStrategy, expiryPolicy, ledgerPostingService } =
        buildService();

      const mockBatch = {
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
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const mockAllocation = {
        allocations: [
          {
            batchId: 'batch-1',
            quantity: 50,
            unitCost: 5000,
            totalCost: 250000,
          },
        ],
        totalCost: 250000,
        metadata: {},
      };

      const mockMovement = {
        id: 'movement-1',
        channelId: 1,
        stockLocationId: 2,
        productVariantId: 3,
        movementType: MovementType.SALE,
        quantity: -50,
        batchId: 'batch-1',
        sourceType: 'Order',
        sourceId: 'order-789',
        metadata: null,
        createdAt: new Date(),
      };

      (inventoryStore.verifyStockLevel as any).mockResolvedValue(true);
      (costingStrategy.allocateCost as any).mockResolvedValue(mockAllocation);
      (inventoryStore.getOpenBatches as any).mockResolvedValue([mockBatch]);
      (expiryPolicy.validateBeforeConsume as any).mockResolvedValue({ allowed: true });
      (inventoryStore.updateBatchQuantity as any).mockResolvedValue({
        ...mockBatch,
        quantity: 50,
      });
      (inventoryStore.createMovement as any).mockResolvedValue(mockMovement);
      (ledgerPostingService.postInventorySaleCogs as any).mockResolvedValue(undefined);

      const input = {
        orderId: 'order-789',
        orderCode: 'ORD-001',
        channelId: 1,
        stockLocationId: 2,
        customerId: 'customer-123',
        lines: [
          {
            productVariantId: 3,
            quantity: 50,
          },
        ],
      };

      const result = await service.recordSale(ctx, input);

      expect(result.orderId).toBe('order-789');
      expect(result.allocations).toHaveLength(1);
      expect(result.totalCogs).toBe(250000);
      expect(inventoryStore.verifyStockLevel).toHaveBeenCalled();
      expect(costingStrategy.allocateCost).toHaveBeenCalled();
      expect(expiryPolicy.validateBeforeConsume).toHaveBeenCalled();
      expect(ledgerPostingService.postInventorySaleCogs).toHaveBeenCalled();
    });

    it('should throw error if stock is insufficient', async () => {
      const { service, inventoryStore } = buildService();

      (inventoryStore.verifyStockLevel as any).mockResolvedValue(false);

      const input = {
        orderId: 'order-789',
        orderCode: 'ORD-001',
        channelId: 1,
        stockLocationId: 2,
        customerId: 'customer-123',
        lines: [
          {
            productVariantId: 3,
            quantity: 50,
          },
        ],
      };

      await expect(service.recordSale(ctx, input)).rejects.toThrow(UserInputError);
    });

    it('should throw error if expiry validation fails', async () => {
      const { service, inventoryStore, costingStrategy, expiryPolicy } = buildService();

      const mockBatch = {
        id: 'batch-1',
        channelId: 1,
        stockLocationId: 2,
        productVariantId: 3,
        quantity: 100,
        unitCost: 5000,
        expiryDate: new Date('2020-01-01'), // Expired
        sourceType: 'Purchase',
        sourceId: 'purchase-1',
        metadata: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const mockAllocation = {
        allocations: [
          {
            batchId: 'batch-1',
            quantity: 50,
            unitCost: 5000,
            totalCost: 250000,
          },
        ],
        totalCost: 250000,
        metadata: {},
      };

      (inventoryStore.verifyStockLevel as any).mockResolvedValue(true);
      (costingStrategy.allocateCost as any).mockResolvedValue(mockAllocation);
      (inventoryStore.getOpenBatches as any).mockResolvedValue([mockBatch]);
      (expiryPolicy.validateBeforeConsume as any).mockResolvedValue({
        allowed: false,
        error: 'Cannot sell expired batch',
      });

      const input = {
        orderId: 'order-789',
        orderCode: 'ORD-001',
        channelId: 1,
        stockLocationId: 2,
        customerId: 'customer-123',
        lines: [
          {
            productVariantId: 3,
            quantity: 50,
          },
        ],
      };

      await expect(service.recordSale(ctx, input)).rejects.toThrow(UserInputError);
    });

    it('single-batch path: uses getOpenBatchesForConsumption and allocates from specified batch', async () => {
      const { service, inventoryStore, costingStrategy, expiryPolicy, ledgerPostingService } =
        buildService();

      const mockBatch = {
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
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const mockMovement = {
        id: 'movement-1',
        channelId: 1,
        stockLocationId: 2,
        productVariantId: 3,
        movementType: MovementType.SALE,
        quantity: -30,
        batchId: 'batch-1',
        sourceType: 'Order',
        sourceId: 'order-789',
        metadata: null,
        createdAt: new Date(),
      };

      (inventoryStore.getOpenBatchesForConsumption as any).mockResolvedValue([mockBatch]);
      (inventoryStore.getOpenBatches as any).mockResolvedValue([mockBatch]);
      (expiryPolicy.validateBeforeConsume as any).mockResolvedValue({ allowed: true });
      (inventoryStore.updateBatchQuantity as any).mockResolvedValue({
        ...mockBatch,
        quantity: 70,
      });
      (inventoryStore.createMovement as any).mockResolvedValue(mockMovement);
      (ledgerPostingService.postInventorySaleCogs as any).mockResolvedValue(undefined);

      const input = {
        orderId: 'order-789',
        orderCode: 'ORD-001',
        channelId: 1,
        stockLocationId: 2,
        customerId: 'customer-123',
        lines: [
          {
            productVariantId: 3,
            quantity: 30,
            batchId: 'batch-1',
          },
        ],
      };

      const result = await service.recordSale(ctx, input);

      expect(result.orderId).toBe('order-789');
      expect(result.allocations).toHaveLength(1);
      expect(result.allocations[0].batchId).toBe('batch-1');
      expect(result.allocations[0].quantity).toBe(30);
      expect(result.totalCogs).toBe(30 * 5000);
      expect(inventoryStore.getOpenBatchesForConsumption).toHaveBeenCalledWith(
        ctx,
        expect.objectContaining({
          channelId: 1,
          stockLocationId: 2,
          productVariantId: 3,
          batchId: 'batch-1',
          maxQuantity: 30,
          orderBy: 'createdAt',
        })
      );
      expect(costingStrategy.allocateCost).not.toHaveBeenCalled();
      expect(inventoryStore.verifyStockLevel).not.toHaveBeenCalled();
      expect(inventoryStore.updateBatchQuantity).toHaveBeenCalledWith(ctx, 'batch-1', -30);
      expect(ledgerPostingService.postInventorySaleCogs).toHaveBeenCalled();
    });

    it('single-batch path: throws when batch not found', async () => {
      const { service, inventoryStore } = buildService();

      (inventoryStore.getOpenBatchesForConsumption as any).mockResolvedValue([]);

      const input = {
        orderId: 'order-789',
        orderCode: 'ORD-001',
        channelId: 1,
        stockLocationId: 2,
        customerId: 'customer-123',
        lines: [
          {
            productVariantId: 3,
            quantity: 10,
            batchId: 'batch-missing',
          },
        ],
      };

      await expect(service.recordSale(ctx, input)).rejects.toThrow(UserInputError);
      await expect(service.recordSale(ctx, input)).rejects.toThrow('not found or not available');
    });

    it('single-batch path: throws when batch quantity insufficient', async () => {
      const { service, inventoryStore } = buildService();

      const mockBatch = {
        id: 'batch-1',
        channelId: 1,
        stockLocationId: 2,
        productVariantId: 3,
        quantity: 5,
        unitCost: 5000,
        expiryDate: null,
        sourceType: 'Purchase',
        sourceId: 'purchase-1',
        metadata: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      (inventoryStore.getOpenBatchesForConsumption as any).mockResolvedValue([mockBatch]);

      const input = {
        orderId: 'order-789',
        orderCode: 'ORD-001',
        channelId: 1,
        stockLocationId: 2,
        customerId: 'customer-123',
        lines: [
          {
            productVariantId: 3,
            quantity: 10,
            batchId: 'batch-1',
          },
        ],
      };

      await expect(service.recordSale(ctx, input)).rejects.toThrow(UserInputError);
      await expect(service.recordSale(ctx, input)).rejects.toThrow(
        /Insufficient quantity in batch/
      );
    });

    it('single-batch path: throws when expiry validation disallows', async () => {
      const { service, inventoryStore, expiryPolicy } = buildService();

      const mockBatch = {
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
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      (inventoryStore.getOpenBatchesForConsumption as any).mockResolvedValue([mockBatch]);
      (expiryPolicy.validateBeforeConsume as any).mockResolvedValue({
        allowed: false,
        error: 'Batch expired',
      });

      const input = {
        orderId: 'order-789',
        orderCode: 'ORD-001',
        channelId: 1,
        stockLocationId: 2,
        customerId: 'customer-123',
        lines: [
          {
            productVariantId: 3,
            quantity: 10,
            batchId: 'batch-1',
          },
        ],
      };

      await expect(service.recordSale(ctx, input)).rejects.toThrow(UserInputError);
      await expect(service.recordSale(ctx, input)).rejects.toThrow(/expiry|Batch expired/);
    });

    it('mixed lines: one with batchId, one strategy path', async () => {
      const { service, inventoryStore, costingStrategy, expiryPolicy, ledgerPostingService } =
        buildService();

      const batch1 = {
        id: 'batch-1',
        channelId: 1,
        stockLocationId: 2,
        productVariantId: 3,
        quantity: 20,
        unitCost: 5000,
        expiryDate: null,
        sourceType: 'Purchase',
        sourceId: 'purchase-1',
        metadata: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const batch2 = {
        id: 'batch-2',
        channelId: 1,
        stockLocationId: 2,
        productVariantId: 4,
        quantity: 15,
        unitCost: 6000,
        expiryDate: null,
        sourceType: 'Purchase',
        sourceId: 'purchase-2',
        metadata: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      (inventoryStore.getOpenBatchesForConsumption as any)
        .mockResolvedValueOnce([batch1])
        .mockResolvedValueOnce([batch2]);
      (inventoryStore.getOpenBatches as any)
        .mockResolvedValueOnce([batch1])
        .mockResolvedValueOnce([batch2]);
      (inventoryStore.verifyStockLevel as any).mockResolvedValue(true);
      (costingStrategy.allocateCost as any).mockResolvedValue({
        allocations: [{ batchId: 'batch-2', quantity: 5, unitCost: 6000, totalCost: 30000 }],
        totalCost: 30000,
        metadata: {},
      });
      (expiryPolicy.validateBeforeConsume as any).mockResolvedValue({ allowed: true });
      (inventoryStore.updateBatchQuantity as any)
        .mockResolvedValueOnce({ ...batch1, quantity: 15 })
        .mockResolvedValueOnce({ ...batch2, quantity: 10 });
      (inventoryStore.createMovement as any).mockResolvedValue({});
      (ledgerPostingService.postInventorySaleCogs as any).mockResolvedValue(undefined);

      const input = {
        orderId: 'order-789',
        orderCode: 'ORD-001',
        channelId: 1,
        stockLocationId: 2,
        customerId: 'customer-123',
        lines: [
          { productVariantId: 3, quantity: 5, batchId: 'batch-1' },
          { productVariantId: 4, quantity: 5 },
        ],
      };

      const result = await service.recordSale(ctx, input);

      expect(result.allocations).toHaveLength(2);
      expect(result.totalCogs).toBe(5 * 5000 + 30000);
      expect(inventoryStore.getOpenBatchesForConsumption).toHaveBeenCalledWith(
        ctx,
        expect.objectContaining({ batchId: 'batch-1', productVariantId: 3 })
      );
      expect(costingStrategy.allocateCost).toHaveBeenCalledWith(
        ctx,
        expect.objectContaining({ productVariantId: 4, quantity: 5 })
      );
    });

    it('processes line with quantity 0 without breaking (strategy path)', async () => {
      const { service, inventoryStore, costingStrategy, expiryPolicy, ledgerPostingService } =
        buildService();

      const batch = {
        id: 'b1',
        channelId: 1,
        stockLocationId: 2,
        productVariantId: 3,
        quantity: 1,
        unitCost: 100,
        expiryDate: null,
        sourceType: 'Purchase',
        sourceId: 'p1',
        metadata: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      (inventoryStore.verifyStockLevel as any).mockResolvedValue(true);
      (costingStrategy.allocateCost as any)
        .mockResolvedValueOnce({
          allocations: [{ batchId: 'b1', quantity: 1, unitCost: 100, totalCost: 100 }],
          totalCost: 100,
          metadata: {},
        })
        .mockResolvedValueOnce({
          allocations: [],
          totalCost: 0,
          metadata: {},
        });
      (inventoryStore.getOpenBatches as any).mockResolvedValue([batch]);
      (expiryPolicy.validateBeforeConsume as any).mockResolvedValue({ allowed: true });
      (inventoryStore.updateBatchQuantity as any).mockResolvedValue({});
      (inventoryStore.createMovement as any).mockResolvedValue({});
      (ledgerPostingService.postInventorySaleCogs as any).mockResolvedValue(undefined);

      const input = {
        orderId: 'order-789',
        orderCode: 'ORD-001',
        channelId: 1,
        stockLocationId: 2,
        customerId: 'customer-123',
        lines: [
          { productVariantId: 3, quantity: 1 },
          { productVariantId: 4, quantity: 0 },
        ],
      };

      const result = await service.recordSale(ctx, input);

      expect(result.orderId).toBe('order-789');
      expect(result.allocations.length).toBe(1);
      expect(costingStrategy.allocateCost).toHaveBeenCalledTimes(2);
    });

    it('strategy path: supports fractional quantity', async () => {
      const { service, inventoryStore, costingStrategy, expiryPolicy, ledgerPostingService } =
        buildService();

      const mockBatch = {
        id: 'batch-1',
        channelId: 1,
        stockLocationId: 2,
        productVariantId: 3,
        quantity: 5,
        unitCost: 100,
        expiryDate: null,
        sourceType: 'Purchase',
        sourceId: 'purchase-1',
        metadata: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const mockAllocation = {
        allocations: [
          {
            batchId: 'batch-1',
            quantity: 1.5,
            unitCost: 100,
            totalCost: 150,
          },
        ],
        totalCost: 150,
        metadata: {},
      };

      (inventoryStore.verifyStockLevel as any).mockResolvedValue(true);
      (costingStrategy.allocateCost as any).mockResolvedValue(mockAllocation);
      (inventoryStore.getOpenBatches as any).mockResolvedValue([mockBatch]);
      (expiryPolicy.validateBeforeConsume as any).mockResolvedValue({ allowed: true });
      (inventoryStore.updateBatchQuantity as any).mockResolvedValue({
        ...mockBatch,
        quantity: 3.5,
      });
      (inventoryStore.createMovement as any).mockResolvedValue({});
      (ledgerPostingService.postInventorySaleCogs as any).mockResolvedValue(undefined);

      const input = {
        orderId: 'order-789',
        orderCode: 'ORD-001',
        channelId: 1,
        stockLocationId: 2,
        customerId: 'customer-123',
        lines: [{ productVariantId: 3, quantity: 1.5 }],
      };

      const result = await service.recordSale(ctx, input);

      expect(result.totalCogs).toBe(150);
      expect(result.allocations[0].quantity).toBe(1.5);
    });

    it('persists one SALE movement per batch allocation, keyed by batch columns', async () => {
      const { service, inventoryStore, costingStrategy, expiryPolicy, ledgerPostingService } =
        buildService();

      const makeBatch = (id: string, unitCost: number) => ({
        id,
        channelId: 1,
        stockLocationId: 2,
        productVariantId: 3,
        quantity: 100,
        unitCost,
        expiryDate: null,
        sourceType: 'Purchase',
        sourceId: 'purchase-1',
        metadata: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      const batch1 = makeBatch('batch-1', 5000);
      const batch2 = makeBatch('batch-2', 6000);

      (inventoryStore.verifyStockLevel as any).mockResolvedValue(true);
      (costingStrategy.allocateCost as any).mockResolvedValue({
        allocations: [
          { batchId: 'batch-1', quantity: 30, unitCost: 5000, totalCost: 150000 },
          { batchId: 'batch-2', quantity: 20, unitCost: 6000, totalCost: 120000 },
        ],
        totalCost: 270000,
        metadata: {},
      });
      (inventoryStore.getOpenBatches as any).mockResolvedValue([batch1, batch2]);
      (expiryPolicy.validateBeforeConsume as any).mockResolvedValue({ allowed: true });
      (inventoryStore.updateBatchQuantity as any).mockResolvedValue({});
      (inventoryStore.createMovement as any).mockImplementation((_ctx: any, input: any) =>
        Promise.resolve({ id: `mov-${input.batchId}`, ...input })
      );
      (ledgerPostingService.postInventorySaleCogs as any).mockResolvedValue(undefined);

      const result = await service.recordSale(ctx, {
        orderId: 'order-789',
        orderCode: 'ORD-001',
        channelId: 1,
        stockLocationId: 2,
        customerId: 'customer-123',
        lines: [{ productVariantId: 3, quantity: 50, orderLineId: 'line-1' }],
      });

      expect(result.movements).toHaveLength(2);
      expect(inventoryStore.createMovement).toHaveBeenCalledTimes(2);
      expect(inventoryStore.createMovement).toHaveBeenCalledWith(
        ctx,
        expect.objectContaining({
          movementType: MovementType.SALE,
          quantity: -30,
          unitCostCents: 5000,
          totalCostCents: -150000,
          batchId: 'batch-1',
          orderLineId: 'line-1',
          sourceType: 'Order',
          sourceId: 'order-789',
        })
      );
      expect(inventoryStore.createMovement).toHaveBeenCalledWith(
        ctx,
        expect.objectContaining({
          movementType: MovementType.SALE,
          quantity: -20,
          unitCostCents: 6000,
          totalCostCents: -120000,
          batchId: 'batch-2',
          orderLineId: 'line-1',
          sourceType: 'Order',
          sourceId: 'order-789',
        })
      );

      // Ledger meta carries the same rounded per-allocation costs
      expect(ledgerPostingService.postInventorySaleCogs).toHaveBeenCalledWith(
        ctx,
        'order-789',
        expect.objectContaining({
          cogsAllocations: [
            { batchId: 'batch-1', quantity: 30, unitCostCents: 5000, totalCostCents: 150000 },
            { batchId: 'batch-2', quantity: 20, unitCostCents: 6000, totalCostCents: 120000 },
          ],
        })
      );
    });

    it('rounds fractional allocation costs cumulatively so movement costs sum to rounded COGS', async () => {
      const { service, inventoryStore, costingStrategy, expiryPolicy, ledgerPostingService } =
        buildService();

      const makeBatch = (id: string) => ({
        id,
        channelId: 1,
        stockLocationId: 2,
        productVariantId: 3,
        quantity: 5,
        unitCost: 333,
        expiryDate: null,
        sourceType: 'Purchase',
        sourceId: 'purchase-1',
        metadata: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      (inventoryStore.verifyStockLevel as any).mockResolvedValue(true);
      (costingStrategy.allocateCost as any).mockResolvedValue({
        allocations: [
          { batchId: 'batch-1', quantity: 1.5, unitCost: 333, totalCost: 499.5 },
          { batchId: 'batch-2', quantity: 1.5, unitCost: 333, totalCost: 499.5 },
        ],
        totalCost: 999,
        metadata: {},
      });
      (inventoryStore.getOpenBatches as any).mockResolvedValue([
        makeBatch('batch-1'),
        makeBatch('batch-2'),
      ]);
      (expiryPolicy.validateBeforeConsume as any).mockResolvedValue({ allowed: true });
      (inventoryStore.updateBatchQuantity as any).mockResolvedValue({});
      (inventoryStore.createMovement as any).mockImplementation((_ctx: any, input: any) =>
        Promise.resolve({ id: `mov-${input.batchId}`, ...input })
      );
      (ledgerPostingService.postInventorySaleCogs as any).mockResolvedValue(undefined);

      await service.recordSale(ctx, {
        orderId: 'order-789',
        orderCode: 'ORD-001',
        channelId: 1,
        stockLocationId: 2,
        customerId: 'customer-123',
        lines: [{ productVariantId: 3, quantity: 3, orderLineId: 'line-1' }],
      });

      // round(499.5)=500 first, remainder lands on the last allocation: 500 + 499 = 999
      const costs = (inventoryStore.createMovement as any).mock.calls.map(
        (c: any[]) => c[1].totalCostCents
      );
      expect(costs).toEqual([-500, -499]);
      expect(costs.reduce((a: number, b: number) => a + b, 0)).toBe(-999);
    });

    it('multi-line order persists one movement per allocation with the line orderLineId', async () => {
      const {
        service,
        inventoryStore,
        costingStrategy,
        expiryPolicy,
        ledgerPostingService,
        mockRepo,
      } = buildService();

      const makeBatch = (id: string, productVariantId: number) => ({
        id,
        channelId: 1,
        stockLocationId: 2,
        productVariantId,
        quantity: 100,
        unitCost: 5000,
        expiryDate: null,
        sourceType: 'Purchase',
        sourceId: 'purchase-1',
        metadata: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      const batch1 = makeBatch('batch-1', 3);
      const batch2 = makeBatch('batch-2', 4);

      (inventoryStore.verifyStockLevel as any).mockResolvedValue(true);
      (costingStrategy.allocateCost as any)
        .mockResolvedValueOnce({
          allocations: [{ batchId: 'batch-1', quantity: 10, unitCost: 5000, totalCost: 50000 }],
          totalCost: 50000,
          metadata: {},
        })
        .mockResolvedValueOnce({
          allocations: [{ batchId: 'batch-2', quantity: 5, unitCost: 5000, totalCost: 25000 }],
          totalCost: 25000,
          metadata: {},
        });
      (inventoryStore.getOpenBatches as any).mockResolvedValue([batch1, batch2]);
      (expiryPolicy.validateBeforeConsume as any).mockResolvedValue({ allowed: true });
      (inventoryStore.updateBatchQuantity as any).mockResolvedValue({});
      (inventoryStore.createMovement as any).mockImplementation((_ctx: any, input: any) =>
        Promise.resolve({ id: `mov-${input.batchId}`, ...input })
      );
      (ledgerPostingService.postInventorySaleCogs as any).mockResolvedValue(undefined);

      const result = await service.recordSale(ctx, {
        orderId: 'order-789',
        orderCode: 'ORD-001',
        channelId: 1,
        stockLocationId: 2,
        customerId: 'customer-123',
        lines: [
          { productVariantId: 3, quantity: 10, orderLineId: 'line-1' },
          { productVariantId: 4, quantity: 5, orderLineId: 'line-2' },
        ],
      });

      expect(result.movements).toHaveLength(2);
      expect(inventoryStore.createMovement).toHaveBeenCalledTimes(2);
      expect(inventoryStore.createMovement).toHaveBeenCalledWith(
        ctx,
        expect.objectContaining({
          sourceType: 'Order',
          sourceId: 'order-789',
          orderLineId: 'line-1',
          batchId: 'batch-1',
        })
      );
      expect(inventoryStore.createMovement).toHaveBeenCalledWith(
        ctx,
        expect.objectContaining({
          sourceType: 'Order',
          sourceId: 'order-789',
          orderLineId: 'line-2',
          batchId: 'batch-2',
        })
      );

      // sale_cogs rows are written per order line, carrying orderLineId
      expect(mockRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ orderId: 'order-789', orderLineId: 'line-1' })
      );
      expect(mockRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ orderId: 'order-789', orderLineId: 'line-2' })
      );
    });
  });

  describe('reverseSale', () => {
    const makeSaleMovement = (
      id: string,
      batchId: string,
      quantity: number,
      orderLineId: string | null = 'line-1',
      productVariantId = 3
    ) => ({
      id,
      channelId: 1,
      stockLocationId: 2,
      productVariantId,
      movementType: MovementType.SALE,
      quantity,
      batchId,
      orderLineId,
      reversesMovementId: null,
      sourceType: 'Order',
      sourceId: 'order-789',
      metadata: null,
      createdAt: new Date(),
    });

    it('restores all batch quantities for a multi-batch order', async () => {
      const { service, inventoryStore, mockRepo } = buildService();

      const saleMovements = [
        makeSaleMovement('mov-1', 'batch-1', -30),
        makeSaleMovement('mov-2', 'batch-2', -20),
      ];

      (inventoryStore.getMovements as any).mockImplementation((_ctx: any, filters: any) => {
        if (filters.sourceType === 'OrderReversal') return Promise.resolve([]);
        if (filters.sourceType === 'Order' && filters.sourceId === 'order-789') {
          return Promise.resolve(saleMovements);
        }
        return Promise.resolve([]);
      });
      (inventoryStore.updateBatchQuantity as any).mockResolvedValue({});
      (inventoryStore.createMovement as any).mockResolvedValue({});
      (mockRepo.findOne as any).mockImplementation((opts: any) =>
        Promise.resolve({ id: opts.where.id, unitCost: 5000 })
      );

      await service.reverseSale(ctx, 'order-789');

      // Both batches restored — not just the first one
      expect(inventoryStore.updateBatchQuantity).toHaveBeenCalledTimes(2);
      expect(inventoryStore.updateBatchQuantity).toHaveBeenCalledWith(ctx, 'batch-1', 30);
      expect(inventoryStore.updateBatchQuantity).toHaveBeenCalledWith(ctx, 'batch-2', 20);

      // One reversal movement per sale movement, linked via reversesMovementId,
      // valued at the restored batch's unit cost
      expect(inventoryStore.createMovement).toHaveBeenCalledTimes(2);
      expect(inventoryStore.createMovement).toHaveBeenCalledWith(
        ctx,
        expect.objectContaining({
          movementType: MovementType.PURCHASE,
          quantity: 30,
          unitCostCents: 5000,
          totalCostCents: 150000,
          batchId: 'batch-1',
          orderLineId: 'line-1',
          reversesMovementId: 'mov-1',
          sourceType: 'OrderReversal',
          sourceId: 'order-789',
        })
      );
      expect(inventoryStore.createMovement).toHaveBeenCalledWith(
        ctx,
        expect.objectContaining({
          movementType: MovementType.PURCHASE,
          quantity: 20,
          unitCostCents: 5000,
          totalCostCents: 100000,
          batchId: 'batch-2',
          orderLineId: 'line-1',
          reversesMovementId: 'mov-2',
          sourceType: 'OrderReversal',
          sourceId: 'order-789',
        })
      );

      // sale_cogs rows are voided (not deleted), only once
      expect(mockRepo.update).toHaveBeenCalledWith(
        expect.objectContaining({ orderId: 'order-789' }),
        expect.objectContaining({ voidedAt: expect.any(Date) })
      );
    });

    it('restores a multi-line order selling the same batch twice', async () => {
      const { service, inventoryStore } = buildService();

      const saleMovements = [
        makeSaleMovement('mov-1', 'batch-1', -5, 'line-1'),
        makeSaleMovement('mov-2', 'batch-1', -3, 'line-2'),
      ];

      (inventoryStore.getMovements as any).mockImplementation((_ctx: any, filters: any) => {
        if (filters.sourceType === 'OrderReversal') return Promise.resolve([]);
        if (filters.sourceType === 'Order' && filters.sourceId === 'order-789') {
          return Promise.resolve(saleMovements);
        }
        return Promise.resolve([]);
      });
      (inventoryStore.updateBatchQuantity as any).mockResolvedValue({});
      (inventoryStore.createMovement as any).mockResolvedValue({});

      await service.reverseSale(ctx, 'order-789');

      // Both line allocations restored against the same batch
      expect(inventoryStore.updateBatchQuantity).toHaveBeenCalledWith(ctx, 'batch-1', 5);
      expect(inventoryStore.updateBatchQuantity).toHaveBeenCalledWith(ctx, 'batch-1', 3);
      // Reversal movements stay distinct via orderLineId + reversesMovementId
      expect(inventoryStore.createMovement).toHaveBeenCalledTimes(2);
      expect(inventoryStore.createMovement).toHaveBeenCalledWith(
        ctx,
        expect.objectContaining({
          batchId: 'batch-1',
          orderLineId: 'line-1',
          reversesMovementId: 'mov-1',
        })
      );
      expect(inventoryStore.createMovement).toHaveBeenCalledWith(
        ctx,
        expect.objectContaining({
          batchId: 'batch-1',
          orderLineId: 'line-2',
          reversesMovementId: 'mov-2',
        })
      );
    });

    it('is a no-op when reversal movements already exist for the order', async () => {
      const { service, inventoryStore } = buildService();

      (inventoryStore.getMovements as any).mockImplementation((_ctx: any, filters: any) => {
        if (filters.sourceType === 'OrderReversal' && filters.sourceId === 'order-789') {
          return Promise.resolve([
            { id: 'rev-1', sourceId: 'order-789', sourceType: 'OrderReversal' },
          ]);
        }
        return Promise.resolve([]);
      });

      await service.reverseSale(ctx, 'order-789');

      expect(inventoryStore.updateBatchQuantity).not.toHaveBeenCalled();
      expect(inventoryStore.createMovement).not.toHaveBeenCalled();
    });
  });

  describe('recordWriteOff', () => {
    it('should record write-off and allocate costs', async () => {
      const { service, inventoryStore, costingStrategy, ledgerPostingService } = buildService();

      const mockAllocation = {
        allocations: [
          {
            batchId: 'batch-1',
            quantity: 10,
            unitCost: 5000,
            totalCost: 50000,
          },
        ],
        totalCost: 50000,
        metadata: {},
      };

      const mockMovement = {
        id: 'movement-1',
        channelId: 1,
        stockLocationId: 2,
        productVariantId: 3,
        movementType: MovementType.WRITE_OFF,
        quantity: -10,
        batchId: 'batch-1',
        sourceType: 'WriteOff',
        sourceId: 'adjustment-456',
        metadata: null,
        createdAt: new Date(),
      };

      (costingStrategy.allocateCost as any).mockResolvedValue(mockAllocation);
      (inventoryStore.updateBatchQuantity as any).mockResolvedValue({
        id: 'batch-1',
        quantity: 90,
      });
      (inventoryStore.createMovement as any).mockResolvedValue(mockMovement);
      (ledgerPostingService.postInventoryWriteOff as any).mockResolvedValue(undefined);

      const input = {
        adjustmentId: 'adjustment-456',
        channelId: 1,
        stockLocationId: 2,
        reason: 'damage',
        lines: [
          {
            productVariantId: 3,
            quantity: 10,
          },
        ],
      };

      const result = await service.recordWriteOff(ctx, input);

      expect(result.adjustmentId).toBe('adjustment-456');
      expect(result.allocations).toHaveLength(1);
      expect(result.totalLoss).toBe(50000);
      expect(costingStrategy.allocateCost).toHaveBeenCalled();
      expect(ledgerPostingService.postInventoryWriteOff).toHaveBeenCalled();
    });
  });
});

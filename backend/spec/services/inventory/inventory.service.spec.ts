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

    const mockRepo = {
      create: jest.fn((dto: any) => dto),
      save: jest.fn((entity: any) => Promise.resolve(entity)),
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
      stockValuationService
    );

    return {
      service,
      inventoryStore,
      costingStrategy,
      expiryPolicy,
      ledgerPostingService,
      stockValuationService,
      connection,
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

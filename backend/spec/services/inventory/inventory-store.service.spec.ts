/**
 * InventoryStoreService Tests
 *
 * Tests for inventory batch and movement operations,
 * verification methods, and concurrency control.
 */

import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { ID, RequestContext, TransactionalConnection, UserInputError } from '@vendure/core';
import { InventoryStoreService } from '../../../src/services/inventory/inventory-store.service';
import { InventoryBatch } from '../../../src/services/inventory/interfaces/inventory-store.interface';
import {
  InventoryMovement,
  MovementType,
} from '../../../src/services/inventory/interfaces/inventory-store.interface';
import { InventoryBatch as InventoryBatchEntity } from '../../../src/services/inventory/entities/inventory-batch.entity';
import { InventoryMovement as InventoryMovementEntity } from '../../../src/services/inventory/entities/inventory-movement.entity';
import {
  CreateBatchInput,
  CreateMovementInput,
  BatchFilters,
  ConsumptionFilters,
  MovementFilters,
} from '../../../src/services/inventory/interfaces/inventory-store.interface';

describe('InventoryStoreService', () => {
  const ctx = {} as RequestContext;

  const buildService = () => {
    const batchRepo = {
      create: jest.fn() as jest.Mock,
      save: jest.fn() as jest.Mock,
      findOne: jest.fn() as jest.Mock,
      createQueryBuilder: jest.fn() as jest.Mock,
    };

    const movementRepo = {
      create: jest.fn() as jest.Mock,
      save: jest.fn() as jest.Mock,
      findOne: jest.fn() as jest.Mock,
      createQueryBuilder: jest.fn() as jest.Mock,
    };

    const connection = {
      getRepository: jest.fn((ctx: RequestContext, entity: any): any => {
        if (entity === InventoryBatchEntity || entity.name === 'InventoryBatch') {
          return batchRepo;
        }
        if (entity === InventoryMovementEntity || entity.name === 'InventoryMovement') {
          return movementRepo;
        }
        throw new Error(`Unexpected entity type: ${entity?.name || entity}`);
      }),
    } as unknown as TransactionalConnection;

    const service = new InventoryStoreService(connection);

    return { service, batchRepo, movementRepo, connection };
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('createBatch', () => {
    it('should create a batch with valid input', async () => {
      const { service, batchRepo, movementRepo } = buildService();

      const input: CreateBatchInput = {
        channelId: 1,
        stockLocationId: 2,
        productVariantId: 3,
        quantity: 100,
        unitCost: 5000, // in cents
        expiryDate: null,
        sourceType: 'Purchase',
        sourceId: 'purchase-123',
        metadata: { test: true },
      };

      const mockBatch: InventoryBatch = {
        id: 'batch-1',
        channelId: 1,
        stockLocationId: 2,
        productVariantId: 3,
        quantity: 100,
        unitCost: 5000,
        expiryDate: null,
        sourceType: 'Purchase',
        sourceId: 'purchase-123',
        metadata: { test: true },
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      (movementRepo.findOne as any).mockResolvedValue(null); // No existing movement
      (batchRepo.create as any).mockReturnValue(mockBatch);
      (batchRepo.save as any).mockResolvedValue(mockBatch);
      (batchRepo.findOne as any).mockResolvedValue(mockBatch); // For verification

      const result = await service.createBatch(ctx, input);

      expect(result).toEqual(mockBatch);
      expect(batchRepo.create).toHaveBeenCalled();
      expect(batchRepo.save).toHaveBeenCalled();
    });

    it('should reject negative quantity', async () => {
      const { service } = buildService();

      const input: CreateBatchInput = {
        channelId: 1,
        stockLocationId: 2,
        productVariantId: 3,
        quantity: -10, // Invalid
        unitCost: 5000,
        sourceType: 'Purchase',
        sourceId: 'purchase-123',
      };

      await expect(service.createBatch(ctx, input)).rejects.toThrow(UserInputError);
    });

    it('should return existing batch for idempotent source', async () => {
      const { service, batchRepo, movementRepo } = buildService();

      const existingBatch: InventoryBatch = {
        id: 'batch-existing',
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

      const existingMovement = {
        id: 'movement-1',
        batchId: 'batch-existing',
      };

      (movementRepo.findOne as any).mockResolvedValue(existingMovement);
      (batchRepo.findOne as any).mockResolvedValue(existingBatch);

      const input: CreateBatchInput = {
        channelId: 1,
        stockLocationId: 2,
        productVariantId: 3,
        quantity: 100,
        unitCost: 5000,
        sourceType: 'Purchase',
        sourceId: 'purchase-123',
      };

      const result = await service.createBatch(ctx, input);

      expect(result).toEqual(existingBatch);
      expect(batchRepo.create).not.toHaveBeenCalled();
    });
  });

  describe('getOpenBatches', () => {
    it('should return open batches matching filters', async () => {
      const { service, batchRepo } = buildService();

      const mockBatches: InventoryBatch[] = [
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
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      const queryBuilder = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getMany: (jest.fn() as any).mockResolvedValue(mockBatches),
      };

      (batchRepo.createQueryBuilder as any).mockReturnValue(queryBuilder);

      const filters: BatchFilters = {
        channelId: 1,
        stockLocationId: 2,
        productVariantId: 3,
      };

      const result = await service.getOpenBatches(ctx, filters);

      expect(result).toEqual(mockBatches);
      expect(queryBuilder.where).toHaveBeenCalled();
      expect(queryBuilder.andWhere).toHaveBeenCalled();
    });
  });

  describe('getOpenBatchesForConsumption', () => {
    const mockBatch = {
      id: 'bid-1',
      channelId: 1,
      stockLocationId: 2,
      productVariantId: 3,
      quantity: 10,
      unitCost: 5000,
      expiryDate: null as Date | null,
      sourceType: 'Purchase',
      sourceId: 'purchase-1',
      metadata: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    it('applies batchId filter and returns matching batch', async () => {
      const { service, batchRepo } = buildService();

      const queryBuilder = {
        setLock: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        getMany: (jest.fn() as any).mockResolvedValue([mockBatch]),
      };

      (batchRepo.createQueryBuilder as any).mockReturnValue(queryBuilder);

      const filters: ConsumptionFilters = {
        channelId: 1,
        stockLocationId: 2,
        productVariantId: 3,
        batchId: 'bid-1',
        orderBy: 'createdAt',
      };

      const result = await service.getOpenBatchesForConsumption(ctx, filters);

      expect(result).toEqual([mockBatch]);
      expect(queryBuilder.andWhere).toHaveBeenCalledWith('batch.id = :batchId', {
        batchId: 'bid-1',
      });
      expect(queryBuilder.orderBy).toHaveBeenCalledWith('batch.createdAt', 'ASC');
    });

    it('applies maxQuantity trimming when provided', async () => {
      const { service, batchRepo } = buildService();

      const batch1 = { ...mockBatch, id: 'b1', quantity: 3 };
      const batch2 = { ...mockBatch, id: 'b2', quantity: 5 };
      const allBatches = [batch1, batch2];

      const queryBuilder = {
        setLock: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        getMany: (jest.fn() as any).mockResolvedValue(allBatches),
      };

      (batchRepo.createQueryBuilder as any).mockReturnValue(queryBuilder);

      const filters: ConsumptionFilters = {
        channelId: 1,
        stockLocationId: 2,
        productVariantId: 3,
        maxQuantity: 4,
        orderBy: 'createdAt',
      };

      const result = await service.getOpenBatchesForConsumption(ctx, filters);

      expect(result).toHaveLength(2);
      expect(result[0].quantity).toBe(3);
      expect(result[1].quantity).toBe(5);
      expect(result.reduce((sum, b) => sum + b.quantity, 0)).toBe(8);
    });

    it('applies both batchId and maxQuantity when provided', async () => {
      const { service, batchRepo } = buildService();

      const singleBatch = [mockBatch];
      const queryBuilder = {
        setLock: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        getMany: (jest.fn() as any).mockResolvedValue(singleBatch),
      };

      (batchRepo.createQueryBuilder as any).mockReturnValue(queryBuilder);

      const filters: ConsumptionFilters = {
        channelId: 1,
        stockLocationId: 2,
        productVariantId: 3,
        batchId: 'bid-1',
        maxQuantity: 5,
        orderBy: 'createdAt',
      };

      const result = await service.getOpenBatchesForConsumption(ctx, filters);

      expect(result).toEqual(singleBatch);
      expect(queryBuilder.andWhere).toHaveBeenCalledWith('batch.id = :batchId', {
        batchId: 'bid-1',
      });
    });

    it('orders by createdAt when orderBy is createdAt', async () => {
      const { service, batchRepo } = buildService();

      const queryBuilder = {
        setLock: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        getMany: (jest.fn() as any).mockResolvedValue([mockBatch]),
      };

      (batchRepo.createQueryBuilder as any).mockReturnValue(queryBuilder);

      const filters: ConsumptionFilters = {
        channelId: 1,
        stockLocationId: 2,
        productVariantId: 3,
        orderBy: 'createdAt',
      };

      await service.getOpenBatchesForConsumption(ctx, filters);

      expect(queryBuilder.orderBy).toHaveBeenCalledWith('batch.createdAt', 'ASC');
      expect(queryBuilder.addOrderBy).not.toHaveBeenCalled();
    });
  });

  describe('updateBatchQuantity', () => {
    it('should update batch quantity', async () => {
      const { service, batchRepo } = buildService();

      const existingBatch: InventoryBatch = {
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

      const updatedBatch = { ...existingBatch, quantity: 50 };

      const queryBuilder = {
        setLock: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        getOne: (jest.fn() as any).mockResolvedValue(existingBatch),
      };

      (batchRepo.createQueryBuilder as any).mockReturnValue(queryBuilder);
      (batchRepo.save as any).mockResolvedValue(updatedBatch);

      const result = await service.updateBatchQuantity(ctx, 'batch-1', -50);

      expect(result.quantity).toBe(50);
      expect(batchRepo.save).toHaveBeenCalled();
    });

    it('should reject update that would make quantity negative', async () => {
      const { service, batchRepo } = buildService();

      const existingBatch: InventoryBatch = {
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
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const queryBuilder = {
        setLock: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        getOne: (jest.fn() as any).mockResolvedValue(existingBatch),
      };

      (batchRepo.createQueryBuilder as any).mockReturnValue(queryBuilder);

      await expect(service.updateBatchQuantity(ctx, 'batch-1', -100)).rejects.toThrow(
        UserInputError
      );
    });
  });

  describe('createMovement', () => {
    it('should create a movement with valid input', async () => {
      const { service, movementRepo } = buildService();

      const input: CreateMovementInput = {
        channelId: 1,
        stockLocationId: 2,
        productVariantId: 3,
        movementType: MovementType.PURCHASE,
        quantity: 100,
        batchId: 'batch-1',
        sourceType: 'Purchase',
        sourceId: 'purchase-123',
        metadata: { test: true },
      };

      const mockMovement: InventoryMovement = {
        id: 'movement-1',
        channelId: 1,
        stockLocationId: 2,
        productVariantId: 3,
        movementType: MovementType.PURCHASE,
        quantity: 100,
        batchId: 'batch-1',
        sourceType: 'Purchase',
        sourceId: 'purchase-123',
        metadata: { test: true },
        createdAt: new Date(),
      };

      (movementRepo.findOne as any).mockResolvedValue(null); // No existing movement
      (movementRepo.create as any).mockReturnValue(mockMovement);
      (movementRepo.save as any).mockResolvedValue(mockMovement);

      const result = await service.createMovement(ctx, input);

      expect(result).toEqual(mockMovement);
      expect(movementRepo.create).toHaveBeenCalled();
      expect(movementRepo.save).toHaveBeenCalled();
    });

    it('should return existing movement for idempotent source', async () => {
      const { service, movementRepo } = buildService();

      const existingMovement: InventoryMovement = {
        id: 'movement-existing',
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

      (movementRepo.findOne as any).mockResolvedValue(existingMovement);

      const input: CreateMovementInput = {
        channelId: 1,
        stockLocationId: 2,
        productVariantId: 3,
        movementType: MovementType.PURCHASE,
        quantity: 100,
        batchId: 'batch-1',
        sourceType: 'Purchase',
        sourceId: 'purchase-123',
      };

      const result = await service.createMovement(ctx, input);

      expect(result).toEqual(existingMovement);
      expect(movementRepo.create).not.toHaveBeenCalled();
    });
  });

  describe('verifyBatchExists', () => {
    it('should return true if batch exists', async () => {
      const { service, batchRepo } = buildService();

      (batchRepo.findOne as any).mockResolvedValue({ id: 'batch-1' });

      const result = await service.verifyBatchExists(ctx, 'batch-1');

      expect(result).toBe(true);
    });

    it('should return false if batch does not exist', async () => {
      const { service, batchRepo } = buildService();

      (batchRepo.findOne as any).mockResolvedValue(null);

      const result = await service.verifyBatchExists(ctx, 'batch-1');

      expect(result).toBe(false);
    });
  });

  describe('verifyStockLevel', () => {
    it('should return true if stock is sufficient', async () => {
      const { service } = buildService();

      const mockBatches: InventoryBatch[] = [
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
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      jest.spyOn(service, 'getOpenBatches' as any).mockResolvedValue(mockBatches);

      const result = await service.verifyStockLevel(ctx, 3, 2, 50);

      expect(result).toBe(true);
    });

    it('should return false if stock is insufficient', async () => {
      const { service } = buildService();

      const mockBatches: InventoryBatch[] = [
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
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      jest.spyOn(service, 'getOpenBatches' as any).mockResolvedValue(mockBatches);

      const result = await service.verifyStockLevel(ctx, 3, 2, 100);

      expect(result).toBe(false);
    });
  });

  describe('getValuationSnapshot', () => {
    it('should calculate valuation correctly', async () => {
      const { service } = buildService();

      const mockBatches: InventoryBatch[] = [
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
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: 'batch-2',
          channelId: 1,
          stockLocationId: 2,
          productVariantId: 3,
          quantity: 30,
          unitCost: 6000,
          expiryDate: null,
          sourceType: 'Purchase',
          sourceId: 'purchase-2',
          metadata: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      jest.spyOn(service, 'getOpenBatches' as any).mockResolvedValue(mockBatches);

      const filters: BatchFilters = {
        channelId: 1,
        stockLocationId: 2,
        productVariantId: 3,
      };

      const result = await service.getValuationSnapshot(ctx, filters);

      expect(result.totalQuantity).toBe(80);
      expect(result.totalValue).toBe(50 * 5000 + 30 * 6000); // 430000 cents
      expect(result.batchCount).toBe(2);
    });
  });
});

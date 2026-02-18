import { Injectable, Logger } from '@nestjs/common';
import {
  ID,
  ProductVariant,
  RequestContext,
  StockLocation,
  TransactionalConnection,
  UserInputError,
} from '@vendure/core';
import { LessThan, MoreThanOrEqual } from 'typeorm';
import { InventoryBatch } from './entities/inventory-batch.entity';
import { InventoryMovement, MovementType } from './entities/inventory-movement.entity';
import {
  BatchFilters,
  ConsumptionFilters,
  CreateBatchInput,
  CreateMovementInput,
  InventoryStore,
  MovementFilters,
  ValuationSnapshot,
} from './interfaces/inventory-store.interface';

/**
 * InventoryStoreService
 *
 * Implements InventoryStore interface, providing abstraction over inventory persistence.
 * Enforces invariants and provides transaction-safe operations with concurrency control.
 */
@Injectable()
export class InventoryStoreService implements InventoryStore {
  private readonly logger = new Logger(InventoryStoreService.name);

  constructor(private readonly connection: TransactionalConnection) {}

  /**
   * Create a new inventory batch
   * Enforces invariants: quantity >= 0
   */
  async createBatch(ctx: RequestContext, input: CreateBatchInput): Promise<InventoryBatch> {
    if (input.quantity < 0) {
      throw new UserInputError('Batch quantity cannot be negative');
    }

    // Check for idempotency - if movement with same source exists, return existing batch
    const existingMovement = await this.connection.getRepository(ctx, InventoryMovement).findOne({
      where: {
        channelId: Number(input.channelId),
        sourceType: input.sourceType,
        sourceId: String(input.sourceId),
      },
      relations: ['batch'],
    });

    if (existingMovement?.batchId) {
      const existingBatch = await this.connection
        .getRepository(ctx, InventoryBatch)
        .findOne({ where: { id: existingMovement.batchId } });
      if (existingBatch) {
        this.logger.log(
          `Batch already exists for source ${input.sourceType}:${input.sourceId}, returning existing batch`
        );
        return existingBatch;
      }
    }

    const batchRepo = this.connection.getRepository(ctx, InventoryBatch);
    const batch = batchRepo.create({
      channelId: Number(input.channelId),
      stockLocationId: Number(input.stockLocationId),
      productVariantId: Number(input.productVariantId),
      quantity: input.quantity,
      unitCost: input.unitCost,
      expiryDate: input.expiryDate || null,
      sourceType: input.sourceType,
      sourceId: String(input.sourceId),
      batchNumber: input.batchNumber ?? null,
      metadata: input.metadata || null,
    });

    const saved = await batchRepo.save(batch);

    this.logger.log(`Created inventory batch ${saved.id} for variant ${input.productVariantId}`);
    return saved;
  }

  /**
   * Get open batches (quantity > 0) matching filters
   */
  async getOpenBatches(ctx: RequestContext, filters: BatchFilters): Promise<InventoryBatch[]> {
    const batchRepo = this.connection.getRepository(ctx, InventoryBatch);
    const query = batchRepo
      .createQueryBuilder('batch')
      .where('batch.channelId = :channelId', { channelId: Number(filters.channelId) })
      .andWhere('batch.quantity > 0');

    if (filters.stockLocationId) {
      query.andWhere('batch.stockLocationId = :stockLocationId', {
        stockLocationId: Number(filters.stockLocationId),
      });
    }

    if (filters.productVariantId) {
      query.andWhere('batch.productVariantId = :productVariantId', {
        productVariantId: Number(filters.productVariantId),
      });
    }

    if (filters.minQuantity !== undefined) {
      query.andWhere('batch.quantity >= :minQuantity', { minQuantity: filters.minQuantity });
    }

    if (filters.expiryDateBefore) {
      query.andWhere('batch.expiryDate < :expiryDateBefore', {
        expiryDateBefore: filters.expiryDateBefore,
      });
    }

    if (filters.expiryDateAfter) {
      query.andWhere('batch.expiryDate > :expiryDateAfter', {
        expiryDateAfter: filters.expiryDateAfter,
      });
    }

    return query.orderBy('batch.createdAt', 'ASC').getMany();
  }

  /**
   * Get open batches for consumption (FIFO/FEFO)
   * Orders by createdAt for FIFO, or expiryDate for FEFO
   */
  async getOpenBatchesForConsumption(
    ctx: RequestContext,
    filters: ConsumptionFilters
  ): Promise<InventoryBatch[]> {
    const batchRepo = this.connection.getRepository(ctx, InventoryBatch);

    // Lock batches to prevent concurrent consumption
    const query = batchRepo
      .createQueryBuilder('batch')
      .setLock('pessimistic_write')
      .where('batch.channelId = :channelId', { channelId: Number(filters.channelId) })
      .andWhere('batch.quantity > 0');

    if (filters.stockLocationId) {
      query.andWhere('batch.stockLocationId = :stockLocationId', {
        stockLocationId: Number(filters.stockLocationId),
      });
    }

    if (filters.productVariantId) {
      query.andWhere('batch.productVariantId = :productVariantId', {
        productVariantId: Number(filters.productVariantId),
      });
    }

    if (filters.excludeExpired) {
      query.andWhere('(batch.expiryDate IS NULL OR batch.expiryDate >= :now)', {
        now: new Date(),
      });
    }

    // Order: strict FIFO = createdAt only; otherwise FEFO = expiry then createdAt
    if (filters.orderBy === 'createdAt') {
      query.orderBy('batch.createdAt', 'ASC');
    } else {
      query.orderBy('batch.expiryDate', 'ASC', 'NULLS FIRST').addOrderBy('batch.createdAt', 'ASC');
    }

    if (filters.maxQuantity !== undefined) {
      // Limit to batches that together have at least maxQuantity
      const batches = await query.getMany();
      let totalQuantity = 0;
      const selectedBatches: InventoryBatch[] = [];

      for (const batch of batches) {
        selectedBatches.push(batch);
        totalQuantity += batch.quantity;
        if (totalQuantity >= filters.maxQuantity!) {
          break;
        }
      }

      return selectedBatches;
    }

    return query.getMany();
  }

  /**
   * Update batch quantity (for consumption)
   * Enforces invariant: quantity >= 0
   */
  async updateBatchQuantity(
    ctx: RequestContext,
    batchId: ID,
    quantityChange: number
  ): Promise<InventoryBatch> {
    const batchRepo = this.connection.getRepository(ctx, InventoryBatch);

    // Lock the batch for update
    const batch = await batchRepo
      .createQueryBuilder('batch')
      .setLock('pessimistic_write')
      .where('batch.id = :batchId', { batchId: String(batchId) })
      .getOne();

    if (!batch) {
      throw new UserInputError(`Batch ${batchId} not found`);
    }

    const newQuantity = batch.quantity + quantityChange;
    if (newQuantity < 0) {
      throw new UserInputError(
        `Insufficient batch quantity. Current: ${batch.quantity}, Requested change: ${quantityChange}`
      );
    }

    batch.quantity = newQuantity;
    const updated = await batchRepo.save(batch);

    this.logger.log(
      `Updated batch ${batchId} quantity: ${batch.quantity} -> ${updated.quantity} (change: ${quantityChange})`
    );

    return updated;
  }

  /**
   * Create an inventory movement (immutable audit trail)
   */
  async createMovement(
    ctx: RequestContext,
    input: CreateMovementInput
  ): Promise<InventoryMovement> {
    // Check for idempotency
    const existingMovement = await this.connection.getRepository(ctx, InventoryMovement).findOne({
      where: {
        channelId: Number(input.channelId),
        sourceType: input.sourceType,
        sourceId: String(input.sourceId),
      },
    });

    if (existingMovement) {
      this.logger.log(
        `Movement already exists for source ${input.sourceType}:${input.sourceId}, returning existing movement`
      );
      return existingMovement;
    }

    const movementRepo = this.connection.getRepository(ctx, InventoryMovement);
    const movement = movementRepo.create({
      channelId: Number(input.channelId),
      stockLocationId: Number(input.stockLocationId),
      productVariantId: Number(input.productVariantId),
      movementType: input.movementType,
      quantity: input.quantity,
      batchId: input.batchId ? String(input.batchId) : null,
      sourceType: input.sourceType,
      sourceId: String(input.sourceId),
      metadata: input.metadata || null,
    });

    const saved = await movementRepo.save(movement);

    this.logger.log(
      `Created inventory movement ${saved.id}: ${input.movementType} ${input.quantity > 0 ? '+' : ''}${input.quantity} for variant ${input.productVariantId}`
    );

    return saved;
  }

  /**
   * Get movements matching filters
   */
  async getMovements(ctx: RequestContext, filters: MovementFilters): Promise<InventoryMovement[]> {
    const movementRepo = this.connection.getRepository(ctx, InventoryMovement);
    const query = movementRepo
      .createQueryBuilder('movement')
      .where('movement.channelId = :channelId', { channelId: Number(filters.channelId) });

    if (filters.stockLocationId) {
      query.andWhere('movement.stockLocationId = :stockLocationId', {
        stockLocationId: Number(filters.stockLocationId),
      });
    }

    if (filters.productVariantId) {
      query.andWhere('movement.productVariantId = :productVariantId', {
        productVariantId: Number(filters.productVariantId),
      });
    }

    if (filters.movementType) {
      query.andWhere('movement.movementType = :movementType', {
        movementType: filters.movementType,
      });
    }

    if (filters.sourceType) {
      query.andWhere('movement.sourceType = :sourceType', { sourceType: filters.sourceType });
    }

    if (filters.sourceId) {
      query.andWhere('movement.sourceId = :sourceId', { sourceId: String(filters.sourceId) });
    }

    if (filters.dateFrom) {
      query.andWhere('movement.createdAt >= :dateFrom', { dateFrom: filters.dateFrom });
    }

    if (filters.dateTo) {
      query.andWhere('movement.createdAt <= :dateTo', { dateTo: filters.dateTo });
    }

    return query.orderBy('movement.createdAt', 'DESC').getMany();
  }

  /**
   * Verify that a batch exists
   */
  async verifyBatchExists(ctx: RequestContext, batchId: ID): Promise<boolean> {
    const batchRepo = this.connection.getRepository(ctx, InventoryBatch);
    const batch = await batchRepo.findOne({ where: { id: String(batchId) } });
    return batch !== null;
  }

  /**
   * Verify stock level is sufficient
   */
  async verifyStockLevel(
    ctx: RequestContext,
    variantId: ID,
    locationId: ID,
    expectedMin: number
  ): Promise<boolean> {
    const batches = await this.getOpenBatches(ctx, {
      channelId: ctx.channelId!,
      stockLocationId: locationId,
      productVariantId: variantId,
    });

    const totalQuantity = batches.reduce((sum, batch) => sum + batch.quantity, 0);
    return totalQuantity >= expectedMin;
  }

  /**
   * Get valuation snapshot for reporting
   */
  async getValuationSnapshot(
    ctx: RequestContext,
    filters: BatchFilters
  ): Promise<ValuationSnapshot> {
    const batches = await this.getOpenBatches(ctx, filters);

    const totalQuantity = batches.reduce((sum, batch) => sum + batch.quantity, 0);
    const totalValue = batches.reduce((sum, batch) => sum + batch.quantity * batch.unitCost, 0);

    const batchDetails = batches.map(batch => ({
      batchId: batch.id,
      quantity: batch.quantity,
      unitCost: batch.unitCost,
      totalCost: batch.quantity * batch.unitCost,
      expiryDate: batch.expiryDate,
    }));

    return {
      channelId: filters.channelId,
      stockLocationId: filters.stockLocationId,
      productVariantId: filters.productVariantId,
      totalQuantity,
      totalValue,
      batchCount: batches.length,
      batches: batchDetails,
      asOfDate: new Date(),
    };
  }
}

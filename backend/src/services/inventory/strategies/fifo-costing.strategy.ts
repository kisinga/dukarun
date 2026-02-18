import { Inject, Injectable, Logger } from '@nestjs/common';
import { ID, RequestContext, UserInputError } from '@vendure/core';
import {
  BatchAllocation,
  CostAllocationRequest,
  CostAllocationResult,
  CostingStrategy,
} from '../interfaces/costing-strategy.interface';
import { InventoryStore } from '../interfaces/inventory-store.interface';

/**
 * FifoCostingStrategy
 *
 * First-In-First-Out cost allocation strategy.
 * Allocates costs from oldest batches first (by createdAt).
 *
 * This strategy provides deterministic allocation results for idempotency:
 * - Same source (sourceType, sourceId) = same allocation
 * - Batches are ordered by createdAt ASC
 */
@Injectable()
export class FifoCostingStrategy implements CostingStrategy {
  private readonly logger = new Logger(FifoCostingStrategy.name);

  constructor(@Inject('InventoryStore') private readonly inventoryStore: InventoryStore) {}

  getName(): string {
    return 'FIFO';
  }

  /**
   * Allocate cost using FIFO strategy
   * Returns deterministic allocation result for idempotency
   */
  async allocateCost(
    ctx: RequestContext,
    request: CostAllocationRequest
  ): Promise<CostAllocationResult> {
    // Get open batches ordered by creation date only (strict FIFO - oldest first)
    const batches = await this.inventoryStore.getOpenBatchesForConsumption(ctx, {
      channelId: request.channelId,
      stockLocationId: request.stockLocationId,
      productVariantId: request.productVariantId,
      maxQuantity: request.quantity,
      excludeExpired: false, // FIFO doesn't exclude expired, FEFO would
      orderBy: 'createdAt',
    });

    if (batches.length === 0) {
      throw new UserInputError(
        `No batches available for variant ${request.productVariantId} at location ${request.stockLocationId}`
      );
    }

    // Calculate total available quantity
    const totalAvailable = batches.reduce((sum, batch) => sum + batch.quantity, 0);

    if (totalAvailable < request.quantity) {
      throw new UserInputError(
        `Insufficient stock. Available: ${totalAvailable}, Requested: ${request.quantity}`
      );
    }

    // Allocate from oldest batches first
    const allocations: BatchAllocation[] = [];
    let remainingQuantity = request.quantity;

    for (const batch of batches) {
      if (remainingQuantity <= 0) {
        break;
      }

      const allocationQuantity = Math.min(remainingQuantity, batch.quantity);
      const totalCost = allocationQuantity * batch.unitCost;

      allocations.push({
        batchId: batch.id,
        quantity: allocationQuantity,
        unitCost: batch.unitCost,
        totalCost,
      });

      remainingQuantity -= allocationQuantity;
    }

    // Calculate total cost
    const totalCost = allocations.reduce((sum, alloc) => sum + alloc.totalCost, 0);

    // Verify allocation matches requested quantity
    const allocatedQuantity = allocations.reduce((sum, alloc) => sum + alloc.quantity, 0);
    if (allocatedQuantity !== request.quantity) {
      throw new Error(
        `Allocation mismatch: requested ${request.quantity}, allocated ${allocatedQuantity}`
      );
    }

    this.logger.log(
      `FIFO allocation: ${request.quantity} units from ${allocations.length} batches, total cost: ${totalCost}`
    );

    return {
      allocations,
      totalCost,
      metadata: {
        strategy: 'FIFO',
        sourceType: request.sourceType,
        sourceId: request.sourceId,
        batchCount: allocations.length,
      },
    };
  }
}

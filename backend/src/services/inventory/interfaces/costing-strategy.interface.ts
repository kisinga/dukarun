import { ID, RequestContext } from '@vendure/core';

/**
 * Request for cost allocation
 */
export interface CostAllocationRequest {
  channelId: ID;
  stockLocationId?: ID;
  productVariantId: ID;
  quantity: number;
  sourceType: string;
  sourceId: string;
  metadata?: Record<string, any>;
}

/**
 * Individual batch allocation result
 */
export interface BatchAllocation {
  batchId: ID;
  quantity: number;
  unitCost: number; // in cents
  totalCost: number; // in cents
}

/**
 * Result of cost allocation
 */
export interface CostAllocationResult {
  allocations: BatchAllocation[];
  totalCost: number; // in cents
  metadata: Record<string, any>;
}

/**
 * CostingStrategy Interface
 *
 * Pluggable strategy for allocating costs to inventory batches.
 * Different strategies (FIFO, FEFO, Average Cost, etc.) can be
 * implemented by implementing this interface.
 */
export interface CostingStrategy {
  /**
   * Allocate cost for a given quantity of inventory
   * @param ctx Request context
   * @param request Cost allocation request
   * @returns Cost allocation result with batch allocations
   */
  allocateCost(ctx: RequestContext, request: CostAllocationRequest): Promise<CostAllocationResult>;

  /**
   * Get the name of this strategy (e.g., 'FIFO', 'FEFO', 'AVERAGE')
   */
  getName(): string;
}

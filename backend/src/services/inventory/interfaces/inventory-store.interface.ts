import { ID, RequestContext } from '@vendure/core';

/**
 * Inventory Batch - represents a batch of stock with cost and expiry
 */
export interface InventoryBatch {
  id: string;
  channelId: number;
  stockLocationId: number;
  productVariantId: number;
  quantity: number;
  unitCost: number; // in cents
  expiryDate: Date | null;
  sourceType: string;
  sourceId: string;
  /** Optional supplier lot or batch number */
  batchNumber?: string | null;
  metadata: Record<string, any> | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Inventory Movement - immutable audit trail of stock changes
 */
export interface InventoryMovement {
  id: string;
  channelId: number;
  stockLocationId: number;
  productVariantId: number;
  movementType: MovementType;
  quantity: number; // positive for increases, negative for decreases
  batchId: string | null;
  sourceType: string;
  sourceId: string;
  metadata: Record<string, any> | null;
  createdAt: Date;
}

/**
 * Movement types for inventory operations
 */
export enum MovementType {
  PURCHASE = 'PURCHASE',
  SALE = 'SALE',
  ADJUSTMENT = 'ADJUSTMENT',
  TRANSFER = 'TRANSFER',
  WRITE_OFF = 'WRITE_OFF',
  EXPIRY = 'EXPIRY',
}

/**
 * Input for creating a new inventory batch
 */
export interface CreateBatchInput {
  channelId: ID;
  stockLocationId: ID;
  productVariantId: ID;
  quantity: number;
  unitCost: number; // in cents
  expiryDate?: Date | null;
  sourceType: string;
  sourceId: string;
  /** Optional supplier lot or batch number */
  batchNumber?: string | null;
  metadata?: Record<string, any>;
}

/**
 * Filters for querying batches
 */
export interface BatchFilters {
  channelId: ID;
  stockLocationId?: ID;
  productVariantId?: ID;
  minQuantity?: number;
  expiryDateBefore?: Date;
  expiryDateAfter?: Date;
}

/**
 * Sort order for consumption: FIFO = oldest first by createdAt only; FEFO = expiry then createdAt
 */
export type ConsumptionOrderBy = 'createdAt' | 'expiryThenCreatedAt';

/**
 * Filters for querying batches for consumption (FIFO/FEFO)
 */
export interface ConsumptionFilters extends BatchFilters {
  maxQuantity?: number;
  excludeExpired?: boolean;
  /** Default 'expiryThenCreatedAt'. Use 'createdAt' for strict FIFO (oldest first by creation only). */
  orderBy?: ConsumptionOrderBy;
}

/**
 * Input for creating a movement
 */
export interface CreateMovementInput {
  channelId: ID;
  stockLocationId: ID;
  productVariantId: ID;
  movementType: MovementType;
  quantity: number; // positive for increases, negative for decreases
  batchId?: ID | null;
  sourceType: string;
  sourceId: string;
  metadata?: Record<string, any>;
}

/**
 * Filters for querying movements
 */
export interface MovementFilters {
  channelId: ID;
  stockLocationId?: ID;
  productVariantId?: ID;
  movementType?: MovementType;
  sourceType?: string;
  sourceId?: string;
  dateFrom?: Date;
  dateTo?: Date;
}

/**
 * Valuation snapshot for reporting
 */
export interface ValuationSnapshot {
  channelId: ID;
  stockLocationId?: ID;
  productVariantId?: ID;
  totalQuantity: number;
  totalValue: number; // in cents
  batchCount: number;
  batches: Array<{
    batchId: string;
    quantity: number;
    unitCost: number;
    totalCost: number;
    expiryDate: Date | null;
  }>;
  asOfDate: Date;
}

/**
 * InventoryStore Interface
 *
 * Provides abstraction over inventory persistence, enforcing invariants
 * and providing transaction-safe operations with concurrency control.
 */
export interface InventoryStore {
  // Batch operations
  createBatch(ctx: RequestContext, input: CreateBatchInput): Promise<InventoryBatch>;
  getOpenBatches(ctx: RequestContext, filters: BatchFilters): Promise<InventoryBatch[]>;
  getOpenBatchesForConsumption(
    ctx: RequestContext,
    filters: ConsumptionFilters
  ): Promise<InventoryBatch[]>;
  updateBatchQuantity(
    ctx: RequestContext,
    batchId: ID,
    quantityChange: number
  ): Promise<InventoryBatch>;

  // Movement operations
  createMovement(ctx: RequestContext, input: CreateMovementInput): Promise<InventoryMovement>;
  getMovements(ctx: RequestContext, filters: MovementFilters): Promise<InventoryMovement[]>;

  // Verification operations
  verifyBatchExists(ctx: RequestContext, batchId: ID): Promise<boolean>;
  verifyStockLevel(
    ctx: RequestContext,
    variantId: ID,
    locationId: ID,
    expectedMin: number
  ): Promise<boolean>;

  // Valuation operations
  getValuationSnapshot(ctx: RequestContext, filters: BatchFilters): Promise<ValuationSnapshot>;
}

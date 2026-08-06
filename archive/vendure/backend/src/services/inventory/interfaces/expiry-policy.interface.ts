import { RequestContext } from '@vendure/core';
import { InventoryBatch, MovementType } from './inventory-store.interface';

/**
 * Result of expiry validation
 */
export interface ExpiryValidationResult {
  allowed: boolean;
  warning?: string;
  error?: string;
}

/**
 * ExpiryPolicy Interface
 *
 * Pluggable policy for handling expiry validation and events.
 * Different policies can enforce different rules (strict, relaxed, etc.)
 */
export interface ExpiryPolicy {
  /**
   * Validate if a batch can be consumed for a given movement type
   * @param ctx Request context
   * @param batch Batch to validate
   * @param quantity Quantity to consume
   * @param movementType Type of movement (SALE, TRANSFER, etc.)
   * @returns Validation result
   */
  validateBeforeConsume(
    ctx: RequestContext,
    batch: InventoryBatch,
    quantity: number,
    movementType: MovementType
  ): Promise<ExpiryValidationResult>;

  /**
   * Called when a new batch is created
   * @param ctx Request context
   * @param batch Newly created batch
   */
  onBatchCreated(ctx: RequestContext, batch: InventoryBatch): Promise<void>;

  /**
   * Called when a batch expires
   * @param ctx Request context
   * @param batch Expired batch
   */
  onBatchExpired(ctx: RequestContext, batch: InventoryBatch): Promise<void>;

  /**
   * Get the name of this policy (e.g., 'DEFAULT', 'STRICT', 'RELAXED')
   */
  getName(): string;
}

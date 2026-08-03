import { Injectable, Logger } from '@nestjs/common';
import { RequestContext } from '@vendure/core';
import { ExpiryPolicy, ExpiryValidationResult } from '../interfaces/expiry-policy.interface';
import { InventoryBatch, MovementType } from '../interfaces/inventory-store.interface';
import { isExpired } from '../utils/expiry-date.util';

/**
 * DefaultExpiryPolicy
 *
 * Standard expiry handling policy:
 * - Warns but allows internal movements (transfers, adjustments) of expired batches
 * - Blocks sales of expired batches
 * - Logs expiry events for audit
 */
@Injectable()
export class DefaultExpiryPolicy implements ExpiryPolicy {
  private readonly logger = new Logger(DefaultExpiryPolicy.name);

  getName(): string {
    return 'DEFAULT';
  }

  /**
   * Validate if a batch can be consumed for a given movement type
   */
  async validateBeforeConsume(
    ctx: RequestContext,
    batch: InventoryBatch,
    quantity: number,
    movementType: MovementType
  ): Promise<ExpiryValidationResult> {
    // Purchases shouldn't reference existing batches (logical constraint, not expiry-related)
    if (movementType === MovementType.PURCHASE) {
      return {
        allowed: false,
        error: 'Purchase movements should not reference existing batches',
      };
    }

    // If no expiry date, always allowed
    if (!batch.expiryDate) {
      return { allowed: true };
    }

    if (!isExpired(batch.expiryDate)) {
      return { allowed: true };
    }

    // Batch is expired - check movement type
    switch (movementType) {
      case MovementType.SALE:
        // Block sales of expired batches
        return {
          allowed: false,
          error: `Cannot sell expired batch ${batch.id}. Expiry date: ${batch.expiryDate.toISOString()}`,
        };

      case MovementType.TRANSFER:
      case MovementType.ADJUSTMENT:
        // Allow internal movements with warning
        this.logger.warn(
          `Allowing ${movementType} of expired batch ${batch.id}. Expiry date: ${batch.expiryDate.toISOString()}`
        );
        return {
          allowed: true,
          warning: `Batch expired on ${batch.expiryDate.toISOString()}. Proceeding with ${movementType}.`,
        };

      case MovementType.WRITE_OFF:
      case MovementType.EXPIRY:
        // Write-offs and expiry movements are expected for expired batches
        return {
          allowed: true,
          warning: `Processing ${movementType} for expired batch ${batch.id}`,
        };

      default:
        // Unknown movement type - be conservative
        return {
          allowed: false,
          error: `Unknown movement type: ${movementType}`,
        };
    }
  }

  /**
   * Called when a new batch is created
   */
  async onBatchCreated(ctx: RequestContext, batch: InventoryBatch): Promise<void> {
    if (batch.expiryDate) {
      this.logger.log(
        `Batch ${batch.id} created with expiry date: ${batch.expiryDate.toISOString()}`
      );
    }
  }

  /**
   * Called when a batch expires
   */
  async onBatchExpired(ctx: RequestContext, batch: InventoryBatch): Promise<void> {
    this.logger.warn(
      `Batch ${batch.id} expired on ${batch.expiryDate?.toISOString()}. Remaining quantity: ${batch.quantity}`
    );
    // In a full implementation, this could trigger automatic write-off or notification
  }
}

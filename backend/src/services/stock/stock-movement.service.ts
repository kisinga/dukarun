import { Injectable, Logger, Optional } from '@nestjs/common';
import {
  EventBus,
  ID,
  ProductVariant,
  RequestContext,
  StockLevel,
  TransactionalConnection,
  UserInputError,
} from '@vendure/core';
import { StockLevelChangedEvent } from '../../infrastructure/events/custom-events';
import { InventoryService } from '../inventory/inventory.service';

export interface StockMovementResult {
  variantId: ID;
  locationId: ID;
  previousStock: number;
  newStock: number;
  quantityChange: number;
}

/**
 * Stock Movement Service
 *
 * Writes Vendure stock_level only from batch-derived values (e.g. after applying
 * adjustments to batches). We never read stock_level as source of truth; batch
 * inventory is. adjustStockLevel / setStockLevelFromBatchSum keep stock_level
 * in sync for Vendure compatibility only.
 */
@Injectable()
export class StockMovementService {
  private readonly logger = new Logger('StockMovementService');

  constructor(
    private readonly connection: TransactionalConnection,
    private readonly eventBus: EventBus,
    @Optional() private readonly inventoryService?: InventoryService
  ) {}

  /**
   * Adjust stock level for a variant at a specific location
   * Returns previous and new stock levels for audit purposes
   */
  async adjustStockLevel(
    ctx: RequestContext,
    variantId: ID,
    locationId: ID,
    quantityChange: number,
    reason: string
  ): Promise<StockMovementResult> {
    const previousStock =
      this.inventoryService && ctx.channelId != null
        ? await this.inventoryService.getBatchStockOnHand(ctx, ctx.channelId, variantId, locationId)
        : 0;
    const newStock = previousStock + quantityChange;

    if (newStock < 0) {
      throw new UserInputError(
        `Insufficient stock. Current: ${previousStock}, Requested change: ${quantityChange}`
      );
    }
    await this.setStockLevelFromBatchSum(ctx, variantId, locationId, newStock);

    this.logger.log(
      `Stock adjusted: variant=${variantId}, location=${locationId}, ` +
        `change=${quantityChange}, previous=${previousStock}, new=${newStock}, reason=${reason}`
    );

    if (newStock > 0 && this.inventoryService) {
      try {
        await this.inventoryService.ensureOpeningStockBatchIfNeeded(
          ctx,
          variantId,
          locationId,
          newStock
        );
      } catch (err) {
        this.logger.warn(
          `Opening stock batch creation failed for variant ${variantId}: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }

    const channelId = ctx.channelId?.toString();
    if (channelId) {
      this.eventBus.publish(new StockLevelChangedEvent(ctx, channelId));
    }

    return {
      variantId,
      locationId,
      previousStock,
      newStock,
      quantityChange,
    };
  }

  /**
   * Set stock_level to a value derived from batch sum (write-only; we never read stock_level as source of truth).
   * Use after applying adjustments to batches to keep Vendure in sync.
   */
  async setStockLevelFromBatchSum(
    ctx: RequestContext,
    variantId: ID,
    locationId: ID,
    newStock: number
  ): Promise<void> {
    if (newStock < 0) {
      throw new UserInputError(`Stock cannot be negative (got ${newStock})`);
    }
    const variantRepo = this.connection.getRepository(ctx, ProductVariant);
    const variant = await variantRepo
      .createQueryBuilder('variant')
      .setLock('pessimistic_write')
      .where('variant.id = :variantId', { variantId })
      .getOne();
    if (!variant) {
      throw new UserInputError(`Product variant ${variantId} not found`);
    }
    const stockLevelRepo = this.connection.getRepository(ctx, StockLevel);
    let stockLevel = await stockLevelRepo
      .createQueryBuilder('stockLevel')
      .setLock('pessimistic_write')
      .innerJoinAndSelect('stockLevel.productVariant', 'variant')
      .innerJoinAndSelect('stockLevel.stockLocation', 'location')
      .where('variant.id = :variantId', { variantId })
      .andWhere('location.id = :locationId', { locationId })
      .getOne();
    if (!stockLevel) {
      stockLevel = stockLevelRepo.create({
        productVariant: { id: variantId } as ProductVariant,
        stockLocation: { id: locationId } as any,
        stockOnHand: newStock,
        stockAllocated: 0,
      });
    } else {
      stockLevel.stockOnHand = newStock;
    }
    await stockLevelRepo.save(stockLevel);
    const channelId = ctx.channelId?.toString();
    if (channelId) {
      this.eventBus.publish(new StockLevelChangedEvent(ctx, channelId));
    }
  }

  /**
   * Get current stock level for a variant at a location.
   * Prefer batch sum for source of truth; this reads stock_level for legacy/cache only.
   */
  async getCurrentStock(ctx: RequestContext, variantId: ID, locationId: ID): Promise<number> {
    if (this.inventoryService && ctx.channelId != null) {
      return this.inventoryService.getBatchStockOnHand(ctx, ctx.channelId, variantId, locationId);
    }
    return 0;
  }
}

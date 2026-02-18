import { Injectable, Logger, Optional } from '@nestjs/common';
import {
  ID,
  ProductVariant,
  RequestContext,
  StockLevel,
  TransactionalConnection,
  UserInputError,
} from '@vendure/core';
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
 * Core service for stock level updates.
 * Single source of truth for all stock modifications.
 */
@Injectable()
export class StockMovementService {
  private readonly logger = new Logger('StockMovementService');

  constructor(
    private readonly connection: TransactionalConnection,
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
    // Lock the variant first (without joins) to serialize concurrent adjustments
    // This avoids race conditions when creating or updating StockLevel rows.
    const variantRepo = this.connection.getRepository(ctx, ProductVariant);
    const variant = await variantRepo
      .createQueryBuilder('variant')
      .setLock('pessimistic_write')
      .where('variant.id = :variantId', { variantId })
      .getOne();

    if (!variant) {
      throw new UserInputError(`Product variant ${variantId} not found`);
    }

    // Now query and lock the stock level separately if it exists
    // Use inner join to avoid FOR UPDATE on nullable side of outer join
    const stockLevelRepo = this.connection.getRepository(ctx, StockLevel);
    let stockLevel = await stockLevelRepo
      .createQueryBuilder('stockLevel')
      .setLock('pessimistic_write')
      .innerJoinAndSelect('stockLevel.productVariant', 'variant')
      .innerJoinAndSelect('stockLevel.stockLocation', 'location')
      .where('variant.id = :variantId', { variantId })
      .andWhere('location.id = :locationId', { locationId })
      .getOne();

    const previousStock = stockLevel?.stockOnHand ?? 0;
    const newStock = previousStock + quantityChange;

    if (newStock < 0) {
      throw new UserInputError(
        `Insufficient stock. Current: ${previousStock}, Requested change: ${quantityChange}`
      );
    }

    if (!stockLevel) {
      // Create new stock level
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

    return {
      variantId,
      locationId,
      previousStock,
      newStock,
      quantityChange,
    };
  }

  /**
   * Get current stock level for a variant at a location
   */
  async getCurrentStock(ctx: RequestContext, variantId: ID, locationId: ID): Promise<number> {
    const stockLevelRepo = this.connection.getRepository(ctx, StockLevel);
    const stockLevel = await stockLevelRepo.findOne({
      where: {
        productVariant: { id: variantId },
        stockLocation: { id: locationId },
      },
    });

    return stockLevel?.stockOnHand ?? 0;
  }
}

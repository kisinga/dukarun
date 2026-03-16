import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import {
  EventBus,
  ProductVariantEvent,
  StockLocationService,
  TransactionalConnection,
  StockLevel,
} from '@vendure/core';
import type { CreateProductVariantInput } from '@vendure/common/lib/generated-types';
import { InventoryService } from '../../services/inventory/inventory.service';

/**
 * Listens for ProductVariantEvent('created') and creates opening stock batches
 * for any variant that was created with stockOnHand > 0.
 *
 * This is necessary because the CustomVendureStockMovementService override
 * is scoped to the LedgerPlugin module and does NOT intercept Vendure core's
 * ProductVariantService.create() call (NestJS module scoping). So the Vendure
 * default StockMovementService runs during variant creation, writing to
 * stock_level but never creating a batch.
 *
 * This subscriber fills the gap: after Vendure creates the variant and sets
 * stock_level, we check if a batch exists and create one if missing.
 */
@Injectable()
export class OpeningStockBatchSubscriber implements OnModuleInit {
  private readonly logger = new Logger(OpeningStockBatchSubscriber.name);

  constructor(
    private readonly eventBus: EventBus,
    private readonly inventoryService: InventoryService,
    private readonly stockLocationService: StockLocationService,
    private readonly connection: TransactionalConnection
  ) {}

  onModuleInit(): void {
    this.eventBus.ofType(ProductVariantEvent).subscribe(async event => {
      if (event.type !== 'created') return;
      try {
        await this.handleVariantsCreated(event);
      } catch (err) {
        this.logger.error(
          `Opening stock batch creation failed: ${err instanceof Error ? err.message : String(err)}`,
          err instanceof Error ? err.stack : undefined
        );
      }
    });
  }

  private async handleVariantsCreated(event: ProductVariantEvent): Promise<void> {
    const ctx = event.ctx;
    const variants = event.entity;
    const input = event.input as CreateProductVariantInput[] | undefined;

    if (!variants?.length || !ctx.channelId) return;

    const defaultLocation = await this.stockLocationService.defaultStockLocation(ctx);
    const locationId = defaultLocation.id;

    for (let i = 0; i < variants.length; i++) {
      const variant = variants[i];
      const variantInput = input?.[i];

      // Determine the stock quantity from the creation input
      let stockOnHand = 0;
      if (variantInput?.stockOnHand != null && variantInput.stockOnHand > 0) {
        stockOnHand = variantInput.stockOnHand;
      } else if (variantInput?.stockLevels?.length) {
        // stockLevels input (multi-location) — handle each
        for (const sl of variantInput.stockLevels) {
          if (sl.stockOnHand > 0) {
            await this.inventoryService.ensureOpeningStockBatchIfNeeded(
              ctx,
              variant.id,
              sl.stockLocationId,
              sl.stockOnHand
            );
            this.logger.log(
              `Ensured opening stock batch: variant=${variant.id}, ` +
                `location=${sl.stockLocationId}, qty=${sl.stockOnHand}`
            );
          }
        }
        continue; // Already handled per-location
      }

      if (stockOnHand <= 0) {
        // No opening stock set — check if Vendure wrote to stock_level directly
        // (fallback: read from stock_level table in case the input didn't have it
        //  but Vendure set it via a different path)
        const stockLevel = await this.connection
          .getRepository(ctx, StockLevel)
          .createQueryBuilder('sl')
          .innerJoin('sl.productVariant', 'v')
          .innerJoin('sl.stockLocation', 'loc')
          .where('v.id = :variantId', { variantId: variant.id })
          .andWhere('loc.id = :locationId', { locationId })
          .getOne();
        if (stockLevel && stockLevel.stockOnHand > 0) {
          stockOnHand = stockLevel.stockOnHand;
        }
      }

      if (stockOnHand <= 0) continue;

      await this.inventoryService.ensureOpeningStockBatchIfNeeded(
        ctx,
        variant.id,
        locationId,
        stockOnHand
      );
      this.logger.log(
        `Ensured opening stock batch: variant=${variant.id}, ` +
          `location=${locationId}, qty=${stockOnHand}`
      );
    }
  }
}

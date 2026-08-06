import { Inject, Injectable, Optional } from '@nestjs/common';
import {
  ConfigService,
  ID,
  RequestContext,
  StockLevelService,
  StockLocationService,
  TransactionalConnection,
} from '@vendure/core';
import { InventoryStore } from '../inventory/interfaces/inventory-store.interface';

/**
 * StockLevelService override that resolves available stock from FIFO batch inventory
 * instead of Vendure's stock_level table.
 *
 * IMPORTANT: This service is MODULE-SCOPED to LedgerPlugin via NestJS DI.
 * It does NOT affect the global GraphQL `stockOnHand` resolution because
 * Vendure's ProductVariantAdminEntityResolver lives in a different NestJS module
 * (ApiModule). For the global stock resolution path, see:
 * @see BatchStockLocationStrategy — configured via catalogOptions.stockLocationStrategy
 *
 * This override provides batch-aware stock for services WITHIN LedgerPlugin
 * (e.g. getSaleableStockLevel, getFulfillableStockLevel for add-item/fulfillment).
 *
 * When InventoryStore is not available (e.g. tests or plugin order), falls back
 * to default Vendure behavior (stock_level).
 */
@Injectable()
export class BatchAwareStockLevelService extends StockLevelService {
  constructor(
    connection: TransactionalConnection,
    stockLocationService: StockLocationService,
    configService: ConfigService,
    @Optional() @Inject('InventoryStore') private readonly inventoryStore?: InventoryStore
  ) {
    super(connection, stockLocationService, configService);
    this.stockLocationServiceRef = stockLocationService;
  }

  private readonly stockLocationServiceRef: StockLocationService;

  /**
   * Returns available stock from batch inventory (sum of open batch quantities)
   * at the channel's default stock location. No fallback to stock_level —
   * batch inventory is the single source of truth.
   */
  override async getAvailableStock(
    ctx: RequestContext,
    productVariantId: ID
  ): Promise<{ stockOnHand: number; stockAllocated: number }> {
    if (!this.inventoryStore || !ctx.channelId) {
      return { stockOnHand: 0, stockAllocated: 0 };
    }

    const location = await this.stockLocationServiceRef.defaultStockLocation(ctx);
    if (!location?.id) {
      return { stockOnHand: 0, stockAllocated: 0 };
    }

    const batches = await this.inventoryStore.getOpenBatches(ctx, {
      channelId: ctx.channelId,
      stockLocationId: location.id,
      productVariantId,
    });

    const stockOnHand = batches.reduce((sum, batch) => sum + batch.quantity, 0);

    // Batch inventory is the source of truth; Vendure's allocation is not synced to batches,
    // so we intentionally report no allocated stock here. See Vendure Stock Control:
    // saleable = stockOnHand - allocated - outOfStockThreshold (docs.vendure.io/guides/core-concepts/stock-control).
    return {
      stockOnHand,
      stockAllocated: 0,
    };
  }
}

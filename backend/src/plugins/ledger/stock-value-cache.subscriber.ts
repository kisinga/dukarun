import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { EventBus, ProductVariantEvent, RequestContext } from '@vendure/core';
import { StockLevelChangedEvent } from '../../infrastructure/events/custom-events';
import { StockValuationService } from '../../services/financial/stock-valuation.service';

/** Subscribes to stock and variant changes to invalidate the stock value cache. */
@Injectable()
export class StockValueCacheSubscriber implements OnModuleInit {
  private readonly logger = new Logger(StockValueCacheSubscriber.name);

  constructor(
    private readonly eventBus: EventBus,
    private readonly stockValuationService: StockValuationService
  ) {}

  onModuleInit(): void {
    this.eventBus.ofType(StockLevelChangedEvent).subscribe((event: StockLevelChangedEvent) => {
      const ctx = event.ctx;
      if (!ctx?.channelId) return;
      this.stockValuationService.invalidateCache(ctx).catch(err => {
        this.logger.warn(
          `Stock value cache invalidation failed: ${err instanceof Error ? err.message : String(err)}`
        );
      });
    });

    this.eventBus.ofType(ProductVariantEvent).subscribe((event: ProductVariantEvent) => {
      const ctx = event.ctx;
      if (!ctx?.channelId) return;
      this.stockValuationService.invalidateCache(ctx).catch(err => {
        this.logger.warn(
          `Stock value cache invalidation failed: ${err instanceof Error ? err.message : String(err)}`
        );
      });
    });
  }
}

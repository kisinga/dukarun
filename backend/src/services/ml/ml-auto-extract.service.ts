import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import {
  AssetEvent,
  ChannelService,
  EventBus,
  ProductEvent,
  ProductService,
  RequestContext,
  RequestContextService,
  TransactionalConnection,
} from '@vendure/core';
import { ProductAsset } from '@vendure/core/dist/entity/product/product-asset.entity';
import { MlExtractionQueueService } from './ml-extraction-queue.service';
import { MlTrainingService } from './ml-training.service';

/**
 * ML Auto-Extract Service
 *
 * Listens to product and asset events to automatically trigger photo extraction
 * when products are created or updated with new images.
 */
@Injectable()
export class MlAutoExtractService implements OnModuleInit {
  private readonly logger = new Logger(MlAutoExtractService.name);

  constructor(
    private eventBus: EventBus,
    private channelService: ChannelService,
    private productService: ProductService,
    private connection: TransactionalConnection,
    private extractionQueueService: MlExtractionQueueService,
    private mlTrainingService: MlTrainingService,
    private requestContextService: RequestContextService
  ) {}

  onModuleInit() {
    // Listen to product events
    this.eventBus.ofType(ProductEvent).subscribe(async event => {
      if (event.type === 'created' || event.type === 'updated') {
        await this.handleProductChange(event.ctx, event.entity);
      }
    });

    // Listen to asset events
    this.eventBus.ofType(AssetEvent).subscribe(async event => {
      if (event.type === 'created' || event.type === 'updated') {
        await this.handleAssetChange(event.ctx, event.entity);
      }
    });

    this.logger.log('Event listeners initialized');
  }

  /**
   * Handle product creation/update events
   */
  private async handleProductChange(ctx: RequestContext, product: any): Promise<void> {
    try {
      // Get all channels this product belongs to
      const channels = await this.getProductChannels(ctx, product.id);

      for (const channel of channels) {
        await this.scheduleExtractionForChannel(ctx, channel.id);
      }
    } catch (error) {
      this.logger.error('Error handling product change:', error);
    }
  }

  /**
   * Handle asset creation/update events
   */
  private async handleAssetChange(ctx: RequestContext, asset: any): Promise<void> {
    try {
      // Check if asset is assigned to any products
      const products = await this.getAssetProducts(ctx, asset.id);

      for (const product of products) {
        const channels = await this.getProductChannels(ctx, product.id);

        for (const channel of channels) {
          await this.scheduleExtractionForChannel(ctx, channel.id);
        }
      }
    } catch (error) {
      this.logger.error('Error handling asset change:', error);
    }
  }

  /**
   * Schedule extraction for a channel with database persistence
   */
  private async scheduleExtractionForChannel(
    ctx: RequestContext,
    channelId: string
  ): Promise<void> {
    try {
      // Check if channel has ML enabled using shared utility
      const hasMlEnabled = await this.mlTrainingService.isMlEnabled(channelId.toString());
      if (!hasMlEnabled) {
        this.logger.log(`Channel ${channelId} does not have ML enabled, skipping`);
        return;
      }

      // Check for recent pending extractions to prevent duplicates
      const hasRecent = await this.extractionQueueService.hasRecentPendingExtraction(
        ctx,
        channelId
      );
      if (hasRecent) {
        this.logger.log(
          `Channel ${channelId} already has a recent pending extraction, skipping duplicate`
        );
        return;
      }

      // Schedule extraction in database
      await this.extractionQueueService.scheduleExtraction(ctx, channelId, 5);
      this.logger.log(`Scheduled extraction for channel ${channelId} in database`);
    } catch (error) {
      this.logger.error(`Error scheduling extraction for channel ${channelId}:`, error);
    }
  }

  private async getProductChannels(ctx: RequestContext, productId: string): Promise<any[]> {
    return this.productService.getProductChannels(ctx, productId as any);
  }

  private async getAssetProducts(ctx: RequestContext, assetId: string): Promise<any[]> {
    const productAssets = await this.connection.getRepository(ctx, ProductAsset).find({
      where: { assetId: assetId as any },
      relations: ['product'],
    });
    return productAssets.map(pa => pa.product).filter(Boolean);
  }

  /**
   * Manually trigger extraction for a channel (bypasses debouncing)
   * This schedules an immediate extraction (0 delay) in the queue
   */
  async triggerExtraction(ctx: RequestContext, channelId: string): Promise<void> {
    this.logger.log(`Manual trigger for channel ${channelId}`);
    // Schedule with 0 delay for immediate processing
    await this.extractionQueueService.scheduleExtraction(ctx, channelId, 0);
  }

  /**
   * Clear all pending extractions
   */
  async clearAllPending(): Promise<void> {
    try {
      const ctx = await this.requestContextService.create({ apiType: 'admin' });
      const channels = await this.channelService.findAll(ctx);
      for (const channel of channels.items) {
        await this.extractionQueueService.cancelPendingExtractions(ctx, channel.id.toString());
      }
      this.logger.log('Cleared all pending extractions from database');
    } catch (error) {
      this.logger.error('Error clearing pending extractions:', error);
    }
  }
}

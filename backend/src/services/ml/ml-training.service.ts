import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import {
  AssetService,
  ChannelService,
  EventBus,
  ProductService,
  RequestContext,
  RequestContextService,
  TransactionalConnection,
} from '@vendure/core';
import { findChannelById } from '../../utils/channel-access.util';
import { env } from '../../infrastructure/config/environment.config';
import { MlWebhookService } from './ml-webhook.service';
import { MLStatusEvent } from '../../infrastructure/events/custom-events';

export interface ProductManifestEntry {
  productId: string;
  productName: string;
  images: ImageManifestEntry[];
}

export interface ImageManifestEntry {
  assetId: string;
  url: string;
  filename: string;
}

export interface TrainingManifest {
  channelId: string;
  version: string;
  extractedAt: Date;
  products: ProductManifestEntry[];
}

/**
 * ML Training Service
 *
 * Handles photo extraction and training manifest generation for ML models.
 * All public methods accept channelId and create their own channel-scoped
 * RequestContext internally via RequestContextService.
 */
@Injectable()
export class MlTrainingService {
  private readonly logger = new Logger(MlTrainingService.name);

  constructor(
    private channelService: ChannelService,
    private productService: ProductService,
    private assetService: AssetService,
    private connection: TransactionalConnection,
    private webhookService: MlWebhookService,
    private eventBus: EventBus,
    private requestContextService: RequestContextService
  ) {}

  /**
   * Create a properly channel-scoped RequestContext for ML operations.
   * This is the ONLY way ML code should obtain a context for product queries.
   */
  private async createChannelContext(channelId: string): Promise<RequestContext> {
    const defaultCtx = await this.requestContextService.create({
      apiType: 'admin',
    });

    const channel = await this.channelService.findOne(defaultCtx, channelId);
    if (!channel) {
      throw new Error(`Channel ${channelId} not found`);
    }

    return this.requestContextService.create({
      apiType: 'admin',
      channelOrToken: channel,
    });
  }

  /**
   * Build training manifest for a channel (read-only, internal).
   * No channel updates, no webhooks, no status changes.
   */
  private async buildManifestForChannel(
    ctx: RequestContext,
    channelId: string
  ): Promise<TrainingManifest> {
    this.logger.log(
      `Building manifest for channel ${channelId} (context channel: ${ctx.channel?.id})`
    );

    const products = await this.productService.findAll(ctx, { take: 1000 }, [
      'featuredAsset',
      'assets',
      'assets.asset',
    ]);

    this.logger.log(
      `productService.findAll returned ${products.items.length} products for channel ${channelId}`
    );

    const manifestProducts: ProductManifestEntry[] = [];

    for (const product of products.items) {
      const images: ImageManifestEntry[] = [];
      const seenAssetIds = new Set<string>();

      if (product.featuredAsset) {
        const id = product.featuredAsset.id.toString();
        seenAssetIds.add(id);
        images.push({
          assetId: id,
          url: this.generateAssetUrl(product.featuredAsset.source),
          filename: product.featuredAsset.name,
        });
      }

      if (product.assets?.length) {
        for (const productAsset of product.assets) {
          if (!productAsset.asset) continue;
          const id = productAsset.asset.id.toString();
          if (seenAssetIds.has(id)) continue;
          seenAssetIds.add(id);
          images.push({
            assetId: id,
            url: this.generateAssetUrl(productAsset.asset.source),
            filename: productAsset.asset.name,
          });
        }
      }

      if (images.length > 0) {
        manifestProducts.push({
          productId: product.id.toString(),
          productName: product.name,
          images,
        });
      }
    }

    const totalImages = manifestProducts.reduce((sum, p) => sum + p.images.length, 0);
    const productsWithoutImages = products.items.length - manifestProducts.length;

    this.logger.log(
      `Manifest built: ${manifestProducts.length} products with images ` +
        `(${totalImages} total images), ${productsWithoutImages} products without images`
    );

    if (productsWithoutImages > 0) {
      this.logger.warn(
        `${productsWithoutImages} products have no images (no featuredAsset and no loaded assets)`
      );
    }

    return {
      channelId,
      version: new Date().toISOString().slice(0, 19).replace(/[:.]/g, '-'),
      extractedAt: new Date(),
      products: manifestProducts,
    };
  }

  /**
   * Extract photos for a channel and generate training manifest.
   * Updates channel, status, and webhooks.
   */
  async extractPhotosForChannel(channelId: string): Promise<TrainingManifest> {
    this.logger.log(`Extracting photos for channel ${channelId}`);
    const ctx = await this.createChannelContext(channelId);

    await this.updateTrainingStatus(channelId, 'extracting', 0);
    await this.webhookService.notifyTrainingStarted(ctx, channelId);

    try {
      const manifest = await this.buildManifestForChannel(ctx, channelId);
      const totalImageCount = manifest.products.reduce((sum, p) => sum + p.images.length, 0);

      await this.channelService.update(ctx, {
        id: channelId,
        customFields: {
          mlProductCount: manifest.products.length,
          mlImageCount: totalImageCount,
        },
      });

      await this.updateTrainingStatus(channelId, 'ready', 100);
      await this.webhookService.notifyTrainingReady(ctx, channelId);

      this.logger.log(
        `Extracted ${manifest.products.length} products with ${totalImageCount} images`
      );
      return manifest;
    } catch (error) {
      this.logger.error(`Error extracting photos for channel ${channelId}:`, error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      await this.updateTrainingStatus(channelId, 'failed', 0, errorMessage);
      await this.webhookService.notifyTrainingFailed(ctx, channelId, errorMessage);
      throw error;
    }
  }

  /**
   * Get training manifest for a channel (read-only).
   * Builds the manifest without triggering status updates or webhooks.
   */
  async getTrainingManifest(channelId: string): Promise<TrainingManifest> {
    const ctx = await this.createChannelContext(channelId);
    return this.buildManifestForChannel(ctx, channelId);
  }

  /**
   * Update training status for a channel
   */
  async updateTrainingStatus(
    channelId: string,
    status: string,
    progress: number = 0,
    error?: string
  ): Promise<void> {
    const ctx = await this.createChannelContext(channelId);

    const updateData: any = {
      mlTrainingStatus: status,
      mlTrainingProgress: progress,
    };

    if (status === 'training' && !error) {
      updateData.mlTrainingStartedAt = new Date();
    }

    if (error) {
      updateData.mlTrainingError = error;
    }

    await this.channelService.update(ctx, {
      id: channelId,
      customFields: updateData,
    });

    if (status === 'training' && progress === 0) {
      this.eventBus.publish(new MLStatusEvent(ctx, channelId, 'training', 'started', { progress }));
    } else if (status === 'training' && progress > 0 && progress < 100) {
      this.eventBus.publish(
        new MLStatusEvent(ctx, channelId, 'training', 'progress', { progress })
      );
    } else if (status === 'ready' || status === 'active') {
      this.eventBus.publish(
        new MLStatusEvent(ctx, channelId, 'training', 'completed', { progress })
      );
    } else if (status === 'failed') {
      this.eventBus.publish(new MLStatusEvent(ctx, channelId, 'training', 'failed', { error }));
    }

    this.logger.log(`Updated channel ${channelId} status to ${status} (${progress}%)`);
  }

  /**
   * Check if a channel has ML enabled
   */
  async isMlEnabled(channelId: string): Promise<boolean> {
    const ctx = await this.createChannelContext(channelId);
    const channel = await this.channelService.findOne(ctx, channelId);
    if (!channel) return false;

    const customFields = channel.customFields as any;
    return !!(
      customFields.mlModelJsonAsset?.id ||
      customFields.mlTrainingStatus === 'training' ||
      customFields.mlTrainingStatus === 'ready' ||
      customFields.mlTrainingStatus === 'active'
    );
  }

  /**
   * Schedule auto-extraction for a channel
   */
  async scheduleAutoExtraction(channelId: string): Promise<void> {
    this.logger.log(`Scheduling auto-extraction for channel ${channelId}`);

    const hasMlEnabled = await this.isMlEnabled(channelId);
    if (hasMlEnabled) {
      await this.extractPhotosForChannel(channelId);
    }
  }

  private generateAssetUrl(source: string): string {
    const baseUrl = env.ml.backendInternalUrl || 'http://backend:3000';
    return `${baseUrl}/assets/${source}`;
  }

  /**
   * Get training info for a channel.
   * Loads channel by ID with seller filter bypass so we always get the requested channel's
   * counts (mlProductCount, mlImageCount) regardless of the request's active channel.
   */
  async getTrainingInfo(channelId: string): Promise<any> {
    const ctx = await this.createChannelContext(channelId);
    const channel = await findChannelById(
      ctx,
      channelId,
      this.connection,
      this.channelService,
      true
    );
    if (!channel) {
      throw new Error('Channel not found');
    }

    const customFields = channel.customFields as any;

    const getAssetId = (field: any) => {
      if (!field) return null;
      return typeof field === 'object' ? field.id : field;
    };

    const modelJsonId = getAssetId(customFields.mlModelJsonAsset);
    const metadataId = getAssetId(customFields.mlMetadataAsset);

    return {
      status: customFields.mlTrainingStatus || 'idle',
      progress: customFields.mlTrainingProgress || 0,
      startedAt: customFields.mlTrainingStartedAt,
      error: customFields.mlTrainingError,
      productCount: customFields.mlProductCount || 0,
      imageCount: customFields.mlImageCount || 0,
      hasActiveModel: !!(modelJsonId && metadataId),
      lastTrainedAt: customFields.mlTrainingStartedAt,
      queuedAt: customFields.mlTrainingQueuedAt ?? null,
    };
  }

  /**
   * Start training for a channel.
   * Invokes the ml-trainer microservice.
   */
  async startTraining(channelId: string): Promise<boolean> {
    this.logger.log(`Starting training for channel ${channelId}`);
    const ctx = await this.createChannelContext(channelId);

    // Check stored counts from last extraction for diagnostics
    const channel = await this.channelService.findOne(ctx, channelId);
    const storedProductCount = (channel?.customFields as any)?.mlProductCount || 0;
    const storedImageCount = (channel?.customFields as any)?.mlImageCount || 0;
    this.logger.log(
      `Channel ${channelId} stored counts: ${storedProductCount} products, ${storedImageCount} images`
    );

    // Build live manifest for validation
    const manifest = await this.buildManifestForChannel(ctx, channelId);
    const liveImageCount = manifest.products.reduce((sum, p) => sum + p.images.length, 0);
    this.logger.log(
      `Channel ${channelId} live manifest: ${manifest.products.length} products, ${liveImageCount} images`
    );

    if (!manifest.products || manifest.products.length < 2) {
      const errorMsg =
        `Insufficient training data for channel ${channelId}. ` +
        `Found ${manifest.products?.length ?? 0} products with images (need >= 2). ` +
        `Stored count was ${storedProductCount}. ` +
        `Context channel: ${ctx.channel?.id}`;
      this.logger.error(errorMsg);
      throw new Error(errorMsg);
    }

    await this.updateTrainingStatus(channelId, 'training', 0);

    try {
      const authToken = env.ml.serviceToken;
      if (!authToken) {
        throw new Error('ML_SERVICE_TOKEN not configured. Cannot start training.');
      }

      const trainerUrl = env.ml.trainerUrl;
      const backendUrl = env.ml.backendInternalUrl;

      const manifestUrl = `${backendUrl}/admin-api?query=query{mlTrainingManifest(channelId:"${channelId}"){channelId,version,extractedAt,products{productId,productName,images{assetId,url,filename}}}}`;

      this.logger.log(`Invoking ML trainer at ${trainerUrl}/v1/train`);

      await axios.post(
        `${trainerUrl}/v1/train`,
        {
          channelId,
          manifestUrl,
          webhookUrl: `${backendUrl}/admin-api`,
          authToken,
        },
        {
          headers: {
            Authorization: `Bearer ${authToken}`,
          },
        }
      );

      return true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to start training: ${errorMessage}`);
      await this.updateTrainingStatus(
        channelId,
        'failed',
        0,
        `Failed to start training: ${errorMessage}`
      );
      throw error;
    }
  }
}

import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import {
  AssetService,
  ChannelService,
  EventBus,
  ProductService,
  RequestContext,
  TransactionalConnection,
} from '@vendure/core';
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
 * Provides methods for extracting product photos and generating training manifests.
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
    private eventBus: EventBus
  ) {}

  /**
   * Build training manifest for a channel (read-only).
   * No channel updates, no webhooks, no status changes. Single source of truth for manifest data.
   */
  async buildManifestForChannel(ctx: RequestContext, channelId: string): Promise<TrainingManifest> {
    const products = await this.productService.findAll(ctx, {
      take: 1000,
    });

    const manifestProducts: ProductManifestEntry[] = [];

    for (const product of products.items) {
      const productWithAssets = await this.productService.findOne(ctx, product.id, ['assets']);
      if (!productWithAssets?.assets || productWithAssets.assets.length === 0) {
        continue;
      }

      const images: ImageManifestEntry[] = [];
      for (const asset of productWithAssets.assets) {
        const publicUrl = this.generateAssetUrl(asset.asset.source);
        images.push({
          assetId: asset.asset.id.toString(),
          url: publicUrl,
          filename: asset.asset.name,
        });
      }

      if (images.length > 0) {
        manifestProducts.push({
          productId: product.id.toString(),
          productName: product.name,
          images,
        });
      }
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
   * Updates channel, status, and webhooks. Uses buildManifestForChannel for the manifest data.
   */
  async extractPhotosForChannel(ctx: RequestContext, channelId: string): Promise<TrainingManifest> {
    this.logger.log(`Extracting photos for channel ${channelId}`);

    await this.updateTrainingStatus(ctx, channelId, 'extracting', 0);
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

      await this.updateTrainingStatus(ctx, channelId, 'ready', 100);
      await this.webhookService.notifyTrainingReady(ctx, channelId);

      this.logger.log(
        `Extracted ${manifest.products.length} products with ${totalImageCount} images`
      );
      return manifest;
    } catch (error) {
      this.logger.error(`Error extracting photos for channel ${channelId}:`, error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      await this.updateTrainingStatus(ctx, channelId, 'failed', 0, errorMessage);
      await this.webhookService.notifyTrainingFailed(ctx, channelId, errorMessage);
      throw error;
    }
  }

  /**
   * Get training manifest for a channel
   *
   * Note: This method extracts photos to generate the manifest.
   * The extraction is idempotent - it updates channel custom fields with counts
   * but doesn't change the underlying product/asset data.
   *
   * If mlProductCount > 0, extraction was done recently, but we still need to
   * extract again to get the actual manifest data (product IDs, image URLs).
   * This is expected behavior since we don't store the full manifest.
   */
  async getTrainingManifest(ctx: RequestContext, channelId: string): Promise<TrainingManifest> {
    const channel = await this.channelService.findOne(ctx, channelId);
    if (!channel) {
      throw new Error('Channel not found');
    }

    // Always extract to get fresh manifest data
    // This is necessary since we don't store the full manifest, only counts
    return this.extractPhotosForChannel(ctx, channelId);
  }

  /**
   * Update training status for a channel
   */
  async updateTrainingStatus(
    ctx: RequestContext,
    channelId: string,
    status: string,
    progress: number = 0,
    error?: string
  ): Promise<void> {
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

    // Update channel custom fields
    // Update channel custom fields
    await this.channelService.update(ctx, {
      id: channelId,
      customFields: updateData,
    });

    // Publish appropriate ML status event
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
   * Shared utility method to avoid duplication across services
   */
  async isMlEnabled(ctx: RequestContext, channelId: string): Promise<boolean> {
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
   * Schedule auto-extraction for a channel (debounced)
   */
  async scheduleAutoExtraction(ctx: RequestContext, channelId: string): Promise<void> {
    // In a real implementation, you would use Vendure's job queue
    // For now, we'll just trigger extraction immediately
    this.logger.log(`Scheduling auto-extraction for channel ${channelId}`);

    // Check if channel has ML enabled
    const hasMlEnabled = await this.isMlEnabled(ctx, channelId);
    if (hasMlEnabled) {
      // Trigger extraction
      await this.extractPhotosForChannel(ctx, channelId);
    }
  }

  /**
   * Generate public URL for an asset
   */
  private generateAssetUrl(source: string): string {
    // In production, this would use the actual asset server URL
    // For now, return a placeholder that would work with AssetServerPlugin
    const baseUrl = process.env.ASSET_URL_PREFIX || 'http://localhost:3000/assets';
    return `${baseUrl}/${source}`;
  }

  /**
   * Get training info for a channel
   */
  async getTrainingInfo(ctx: RequestContext, channelId: string): Promise<any> {
    const channel = await this.channelService.findOne(ctx, channelId);
    if (!channel) {
      throw new Error('Channel not found');
    }

    const customFields = channel.customFields as any;

    // Handle both loaded Asset objects and raw IDs
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
      lastTrainedAt: customFields.mlTrainingStartedAt, // Could be improved with separate field
      queuedAt: customFields.mlTrainingQueuedAt ?? null,
    };
  }

  /**
   * Start training for a channel
   * Invokes the ml-trainer microservice
   */
  async startTraining(ctx: RequestContext, channelId: string): Promise<boolean> {
    this.logger.log(`Starting training for channel ${channelId}`);

    // Check if channel has training data
    const manifest = await this.getTrainingManifest(ctx, channelId);
    if (!manifest.products || manifest.products.length < 2) {
      throw new Error('Insufficient training data. Need at least 2 products with images.');
    }

    // Update status to training (starting)
    // We don't set progress to 0 yet, as that's done by the webhook when it actually starts
    await this.updateTrainingStatus(ctx, channelId, 'training', 0);

    try {
      // Get service token from environment config
      const authToken = env.ml.serviceToken;
      if (!authToken) {
        throw new Error('ML_SERVICE_TOKEN not configured. Cannot start training.');
      }

      // Use URLs from environment config (defaults to Docker service names)
      const trainerUrl = env.ml.trainerUrl;
      const backendUrl = env.ml.backendInternalUrl;

      // The manifest URL needs to be accessible by ml-trainer
      // We use the admin-api with a query to get it
      const manifestUrl = `${backendUrl}/admin-api?query=query{mlTrainingManifest(channelId:"${channelId}"){channelId,version,extractedAt,products{productId,productName,images{assetId,url,filename}}}}`;

      this.logger.log(`Invoking ML trainer at ${trainerUrl}/v1/train`);

      await axios.post(`${trainerUrl}/v1/train`, {
        channelId,
        manifestUrl,
        webhookUrl: `${backendUrl}/admin-api`, // The GraphQL endpoint for callbacks
        authToken,
      });

      return true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to start training: ${errorMessage}`);
      await this.updateTrainingStatus(
        ctx,
        channelId,
        'failed',
        0,
        `Failed to start training: ${errorMessage}`
      );
      throw error;
    }
  }
}

import { Injectable, Logger } from '@nestjs/common';
import { ChannelService, RequestContext } from '@vendure/core';
import { env } from '../../infrastructure/config/environment.config';

export interface TrainingWebhookPayload {
  channelId: string;
  status: string;
  progress?: number;
  productCount?: number;
  imageCount?: number;
  manifestUrl?: string;
  error?: string;
}

@Injectable()
export class MlWebhookService {
  private readonly logger = new Logger(MlWebhookService.name);

  constructor(private channelService: ChannelService) {}

  /**
   * Send webhook notification to external training service
   * This is called when training status changes
   */
  async sendTrainingWebhook(
    ctx: RequestContext,
    channelId: string,
    status: string,
    progress?: number,
    error?: string
  ): Promise<void> {
    try {
      const channel = await this.channelService.findOne(ctx, channelId);
      if (!channel) {
        this.logger.warn(`Channel ${channelId} not found for webhook`);
        return;
      }

      const customFields = channel.customFields as any;

      const payload: TrainingWebhookPayload = {
        channelId,
        status,
        progress: progress || customFields.mlTrainingProgress || 0,
        productCount: customFields.mlProductCount || 0,
        imageCount: customFields.mlImageCount || 0,
        manifestUrl: status === 'ready' ? this.generateManifestUrl(channelId) : undefined,
        error,
      };

      // For now, just console.log the webhook data
      // In production, this would POST to external service URL
      this.logger.log('=== ML TRAINING WEBHOOK ===');
      this.logger.log(`Channel: ${channelId}`);
      this.logger.log(`Status: ${status}`);
      this.logger.log(`Progress: ${payload.progress}%`);
      this.logger.log(`Products: ${payload.productCount}`);
      this.logger.log(`Images: ${payload.imageCount}`);
      if (payload.manifestUrl) {
        this.logger.log(`Manifest URL: ${payload.manifestUrl}`);
      }
      if (error) {
        this.logger.log(`Error: ${error}`);
      }
      this.logger.log('=== END WEBHOOK ===');

      // TODO: In production, replace console.log with actual HTTP POST
      // await this.httpService.post(webhookUrl, payload).toPromise();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Failed to send training webhook: ${errorMessage}`);
    }
  }

  /**
   * Generate manifest download URL for external service
   */
  private generateManifestUrl(channelId: string): string {
    const baseUrl = env.ml.backendInternalUrl || 'http://backend:3000';
    return `${baseUrl}/admin-api?query=query{mlTrainingManifest(channelId:"${channelId}"){channelId,version,extractedAt,products{productId,productName,images{assetId,url,filename}}}}`;
  }

  /**
   * Send webhook when training is ready for external service
   */
  async notifyTrainingReady(ctx: RequestContext, channelId: string): Promise<void> {
    await this.sendTrainingWebhook(ctx, channelId, 'ready', 100);
  }

  /**
   * Send webhook when training fails
   */
  async notifyTrainingFailed(ctx: RequestContext, channelId: string, error: string): Promise<void> {
    await this.sendTrainingWebhook(ctx, channelId, 'failed', 0, error);
  }

  /**
   * Send webhook when training starts
   */
  async notifyTrainingStarted(ctx: RequestContext, channelId: string): Promise<void> {
    await this.sendTrainingWebhook(ctx, channelId, 'extracting', 0);
  }
}

import { Logger, UseGuards } from '@nestjs/common';
import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import {
  Allow,
  AssetService,
  ChannelService,
  Ctx,
  ID,
  Permission,
  RequestContext,
  RequestContextService,
  Transaction,
} from '@vendure/core';
import gql from 'graphql-tag';
import { MlTrainingService, TrainingManifest } from '../../services/ml/ml-training.service';
import { MlServiceAuthGuard } from './ml-service-auth.guard';
import { env } from '../../infrastructure/config/environment.config';

/**
 * GraphQL schema extension for ML model management
 */
export const ML_MODEL_SCHEMA = gql`
  type MlModelInfo {
    hasModel: Boolean!
    version: String
    status: String
    modelJsonId: String
    modelBinId: String
    metadataId: String
  }

  type MlTrainingInfo {
    status: String!
    progress: Int!
    startedAt: DateTime
    error: String
    productCount: Int!
    imageCount: Int!
    hasActiveModel: Boolean!
    lastTrainedAt: DateTime
  }

  type MlTrainingManifest {
    channelId: String!
    version: String!
    extractedAt: DateTime!
    products: [ProductManifestEntry!]!
  }

  type ProductManifestEntry {
    productId: String!
    productName: String!
    images: [ImageManifestEntry!]!
  }

  type ImageManifestEntry {
    assetId: String!
    url: String!
    filename: String!
  }

  extend type Query {
    """
    Get ML model info for a specific channel
    """
    mlModelInfo(channelId: ID!): MlModelInfo!

    """
    Get detailed training info including status and stats
    """
    mlTrainingInfo(channelId: ID!): MlTrainingInfo!

    """
    Get photo manifest for training (JSON with URLs)
    """
    mlTrainingManifest(channelId: ID!): MlTrainingManifest!
  }

  extend type Mutation {
    """
    Link existing Asset IDs to channel (simpler than file upload)
    """
    linkMlModelAssets(channelId: ID!, modelJsonId: ID!, modelBinId: ID!, metadataId: ID!): Boolean!

    """
    Set ML model status (active/inactive/training)
    """
    setMlModelStatus(channelId: ID!, status: String!): Boolean!

    """
    Clear all ML model files for a channel
    """
    clearMlModel(channelId: ID!): Boolean!

    """
    Manually trigger photo extraction
    """
    extractPhotosForTraining(channelId: ID!): Boolean!

    """
    Update training status (for external training services)
    """
    updateTrainingStatus(channelId: ID!, status: String!, progress: Int, error: String): Boolean!

    """
    Complete training and upload model files (multipart)
    """
    completeTraining(
      channelId: ID!
      modelJson: Upload!
      weightsFile: Upload!
      metadata: Upload!
    ): Boolean!

    """
    Start in-process model training for a channel.
    Requires 'ready' status (photos extracted) or will trigger extraction.
    """
    startTraining(channelId: ID!): Boolean!
  }
`;

/**
 * ML Model Resolver - Using NestJS decorators per Vendure docs
 */
@Resolver()
export class MlModelResolver {
  private readonly logger = new Logger(MlModelResolver.name);

  constructor(
    private channelService: ChannelService,
    private assetService: AssetService,
    private mlTrainingService: MlTrainingService,
    private requestContextService: RequestContextService
  ) {}

  @Query()
  @Allow(Permission.ReadCatalog)
  async mlModelInfo(@Ctx() ctx: RequestContext, @Args() args: { channelId: ID }): Promise<any> {
    const channel = await this.channelService.findOne(ctx, args.channelId);
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
    const modelBinId = getAssetId(customFields.mlModelBinAsset);
    const metadataId = getAssetId(customFields.mlMetadataAsset);

    return {
      hasModel: !!(modelJsonId && metadataId),
      version: customFields.mlModelVersion || null,
      status: customFields.mlModelStatus || 'inactive',
      modelJsonId,
      modelBinId,
      metadataId,
    };
  }

  @Transaction()
  @Mutation()
  @Allow(Permission.UpdateCatalog)
  async linkMlModelAssets(
    @Ctx() ctx: RequestContext,
    @Args() args: { channelId: ID; modelJsonId: ID; modelBinId: ID; metadataId: ID }
  ): Promise<boolean> {
    this.logger.debug('linkMlModelAssets called', args);

    const channel = await this.channelService.findOne(ctx, args.channelId);
    if (!channel) {
      throw new Error('Channel not found');
    }

    // Verify assets exist
    const [modelJson, modelBin, metadata] = await Promise.all([
      this.assetService.findOne(ctx, args.modelJsonId),
      this.assetService.findOne(ctx, args.modelBinId),
      this.assetService.findOne(ctx, args.metadataId),
    ]);

    if (!modelJson || !modelBin || !metadata) {
      throw new Error('One or more assets not found');
    }

    // Assign assets to channel (CRITICAL: assets must be channel-aware)
    await this.assetService.assignToChannel(ctx, {
      assetIds: [args.modelJsonId, args.modelBinId, args.metadataId],
      channelId: args.channelId.toString(),
    });

    const version = new Date().toISOString().slice(0, 19).replace(/[:.]/g, '-');

    await this.channelService.update(ctx, {
      id: args.channelId.toString(),
      customFields: {
        mlModelJsonAssetId: args.modelJsonId,
        mlModelBinAssetId: args.modelBinId,
        mlMetadataAssetId: args.metadataId,
        mlModelVersion: version,
        mlModelStatus: 'active',
      },
    });

    this.logger.log('Assets linked and assigned to channel successfully');
    return true;
  }

  @Transaction()
  @Mutation()
  @Allow(Permission.UpdateCatalog)
  async setMlModelStatus(
    @Ctx() ctx: RequestContext,
    @Args() args: { channelId: ID; status: string }
  ): Promise<boolean> {
    const channel = await this.channelService.findOne(ctx, args.channelId);
    if (!channel) {
      throw new Error('Channel not found');
    }

    const validStatuses = ['active', 'inactive', 'training'];
    if (!validStatuses.includes(args.status)) {
      throw new Error(`Invalid status. Must be one of: ${validStatuses.join(', ')}`);
    }

    await this.channelService.update(ctx, {
      id: args.channelId.toString(),
      customFields: {
        mlModelStatus: args.status,
      },
    });

    return true;
  }

  @Transaction()
  @Mutation()
  @Allow(Permission.DeleteCatalog)
  async clearMlModel(
    @Ctx() ctx: RequestContext,
    @Args() args: { channelId: ID }
  ): Promise<boolean> {
    const channel = await this.channelService.findOne(ctx, args.channelId);
    if (!channel) {
      throw new Error('Channel not found');
    }

    await this.channelService.update(ctx, {
      id: args.channelId.toString(),
      customFields: {
        mlModelJsonAssetId: null,
        mlModelBinAssetId: null,
        mlMetadataAssetId: null,
        mlModelVersion: null,
        mlModelStatus: 'inactive',
      },
    });

    return true;
  }

  @Query()
  @Allow(Permission.ReadCatalog)
  async mlTrainingInfo(@Ctx() ctx: RequestContext, @Args() args: { channelId: ID }): Promise<any> {
    return this.mlTrainingService.getTrainingInfo(ctx, args.channelId.toString());
  }

  /**
   * Get training manifest for ml-trainer service
   *
   * This endpoint is designed for service-to-service calls from ml-trainer.
   * Authentication is handled via ML_SERVICE_TOKEN in the Authorization header.
   * We don't use @Allow decorator because it conflicts with service token auth.
   */
  @Query()
  async mlTrainingManifest(
    @Ctx() ctx: RequestContext,
    @Args() args: { channelId: ID }
  ): Promise<TrainingManifest> {
    // Verify service token authentication
    // The token should be in the Authorization header as "Bearer <token>"
    const req = (ctx as any).req;
    const authHeader = req?.headers?.authorization || req?.headers?.Authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new Error('Authorization required: Bearer token expected');
    }

    const token = authHeader.substring(7);
    const expectedToken = env.ml.serviceToken;

    if (!expectedToken || token !== expectedToken) {
      throw new Error('Invalid service token');
    }

    // Create a RequestContext for the specific channel
    // This ensures product queries use the correct channel filter
    const channel = await this.channelService.findOne(ctx, args.channelId);
    if (!channel) {
      throw new Error(`Channel ${args.channelId} not found`);
    }

    const channelCtx = new RequestContext({
      apiType: ctx.apiType,
      channel,
      languageCode: ctx.languageCode,
      isAuthorized: true,
      authorizedAsOwnerOnly: false,
    });

    return this.mlTrainingService.getTrainingManifest(channelCtx, args.channelId.toString());
  }

  @Transaction()
  @Mutation()
  @Allow(Permission.UpdateCatalog)
  async extractPhotosForTraining(
    @Ctx() ctx: RequestContext,
    @Args() args: { channelId: ID }
  ): Promise<boolean> {
    this.logger.debug('extractPhotosForTraining called', args);

    await this.mlTrainingService.extractPhotosForChannel(ctx, args.channelId.toString());
    return true;
  }

  @Transaction()
  @Mutation()
  @UseGuards(MlServiceAuthGuard)
  @Allow(Permission.UpdateCatalog)
  async updateTrainingStatus(
    @Ctx() ctx: RequestContext,
    @Args() args: { channelId: ID; status: string; progress?: number; error?: string }
  ): Promise<boolean> {
    this.logger.debug('updateTrainingStatus called', args);

    await this.mlTrainingService.updateTrainingStatus(
      ctx,
      args.channelId.toString(),
      args.status,
      args.progress || 0,
      args.error
    );
    return true;
  }

  /**
   * Complete training and upload model files (multipart)
   *
   * This mutation handles file uploads from ml-trainer service.
   * Authentication is handled manually via ML_SERVICE_TOKEN because
   * NestJS guards don't work properly with GraphQL multipart uploads.
   *
   * @Allow(Permission.Public) allows the mutation to be called without Vendure session auth.
   * We validate the service token manually inside the resolver.
   */
  @Transaction()
  @Mutation()
  @Allow(Permission.Public)
  async completeTraining(
    @Ctx() ctx: RequestContext,
    @Args()
    args: {
      channelId: ID;
      modelJson: any;
      weightsFile: any;
      metadata: any;
    }
  ): Promise<boolean> {
    this.logger.debug('completeTraining called', { channelId: args.channelId });

    // Manual service token authentication (guards don't work for multipart uploads)
    const req = (ctx as any).req;
    const authHeader = req?.headers?.authorization || req?.headers?.Authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      this.logger.warn('completeTraining: No Bearer token provided');
      throw new Error('Authorization required: Bearer token expected');
    }

    const token = authHeader.substring(7);
    const expectedToken = env.ml.serviceToken;

    if (!expectedToken || token !== expectedToken) {
      this.logger.warn('completeTraining: Invalid service token');
      throw new Error('Invalid service token');
    }

    this.logger.log('completeTraining: Service token validated');

    // Create internal context with admin permissions
    // First create with default channel, then we'll use it to fetch target channel
    this.logger.log('completeTraining: Creating default admin context...');
    const defaultCtx = await this.requestContextService.create({
      apiType: 'admin',
    });
    this.logger.log('completeTraining: Default context created');

    // Now fetch the target channel using the default context (which has permissions)
    this.logger.log(`completeTraining: Fetching channel ${args.channelId}...`);
    const channel = await this.channelService.findOne(defaultCtx, args.channelId);
    if (!channel) {
      throw new Error(`Channel ${args.channelId} not found`);
    }
    this.logger.log(`completeTraining: Channel found: ${channel.code}`);

    // Create the final context scoped to the target channel
    this.logger.log('completeTraining: Creating channel-scoped context...');
    const internalCtx = await this.requestContextService.create({
      apiType: 'admin',
      channelOrToken: channel,
    });
    this.logger.log('completeTraining: Internal context created for channel', {
      channelId: args.channelId,
    });

    try {
      // Upload the three files as assets with proper tags
      const trainingDate = new Date().toISOString().split('T')[0];
      const version = new Date().toISOString().slice(0, 19).replace(/[:.]/g, '-');
      const tags = [
        'ml-model',
        `channel-${args.channelId}`,
        `v${version}`,
        `trained-${trainingDate}`,
      ];

      // Upload model.json (using internalCtx for proper permissions)
      this.logger.log('completeTraining: Uploading model.json...');
      const modelJsonResult = await this.assetService.create(internalCtx, {
        file: args.modelJson,
        tags,
      });
      this.logger.log('completeTraining: model.json uploaded');

      // Upload weights.bin
      this.logger.log('completeTraining: Uploading weights.bin...');
      const weightsResult = await this.assetService.create(internalCtx, {
        file: args.weightsFile,
        tags,
      });
      this.logger.log('completeTraining: weights.bin uploaded');

      // Upload metadata.json
      this.logger.log('completeTraining: Uploading metadata.json...');
      const metadataResult = await this.assetService.create(internalCtx, {
        file: args.metadata,
        tags,
      });
      this.logger.log('completeTraining: metadata.json uploaded');

      // Check for errors in asset creation
      if (
        'message' in modelJsonResult ||
        'message' in weightsResult ||
        'message' in metadataResult
      ) {
        throw new Error('Failed to create assets');
      }
      this.logger.log('completeTraining: Asset error check passed');
      // Note: Assets are automatically assigned to the channel when created with internalCtx
      // which is already scoped to the target channel. No separate assignToChannel needed.

      // Parse metadata to get stats
      let productCount = 0;
      let imageCount = 0;
      try {
        const metadataContent = await args.metadata.text();
        const metadataObj = JSON.parse(metadataContent);
        productCount = metadataObj.productCount || 0;
        imageCount = metadataObj.imageCount || 0;
      } catch (e) {
        this.logger.warn('Could not parse metadata.json for stats');
      }
      this.logger.log(
        `completeTraining: Metadata parsed - products: ${productCount}, images: ${imageCount}`
      );

      // Update channel with new model assets and stats
      // For relation custom fields, use *Id suffix (Vendure input convention)
      this.logger.log('completeTraining: Updating channel with model assets...');
      this.logger.log(
        `Asset IDs - model: ${modelJsonResult.id}, weights: ${weightsResult.id}, metadata: ${metadataResult.id}`
      );
      await this.channelService.update(internalCtx, {
        id: args.channelId.toString(),
        customFields: {
          mlModelJsonAssetId: modelJsonResult.id,
          mlModelBinAssetId: weightsResult.id,
          mlMetadataAssetId: metadataResult.id,
          mlModelVersion: version,
          mlModelStatus: 'active',
          mlTrainingStatus: 'active',
          mlTrainingProgress: 100,
          mlTrainingError: null, // Clear any previous error
          mlProductCount: productCount,
          mlImageCount: imageCount,
          mlLastTrainedAt: new Date(), // Set rate limit marker
          mlTrainingQueuedAt: null, // Clear queue marker
        },
      });

      this.logger.log('completeTraining: Training completed successfully!');
      return true;
    } catch (error) {
      this.logger.error('Error completing training:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      await this.mlTrainingService.updateTrainingStatus(
        internalCtx,
        args.channelId.toString(),
        'failed',
        0,
        errorMessage
      );
      throw error;
    }
  }
  @Transaction()
  @Mutation()
  @Allow(Permission.UpdateCatalog)
  async startTraining(
    @Ctx() ctx: RequestContext,
    @Args() args: { channelId: ID }
  ): Promise<boolean> {
    this.logger.debug('startTraining called', args);
    return this.mlTrainingService.startTraining(ctx, args.channelId.toString());
  }
}

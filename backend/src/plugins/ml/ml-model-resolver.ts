import { Logger } from '@nestjs/common';
import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import {
  Allow,
  AssetService,
  ChannelService,
  Ctx,
  ID,
  Permission,
  RequestContext,
  Transaction,
} from '@vendure/core';
import gql from 'graphql-tag';
import { MlTrainingService, TrainingManifest } from '../../services/ml/ml-training.service';

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
    private mlTrainingService: MlTrainingService
  ) {}

  @Query()
  @Allow(Permission.ReadCatalog)
  async mlModelInfo(@Ctx() ctx: RequestContext, @Args() args: { channelId: ID }): Promise<any> {
    const channel = await this.channelService.findOne(ctx, args.channelId);
    if (!channel) {
      throw new Error('Channel not found');
    }

    const customFields = channel.customFields as any;

    return {
      hasModel: !!(customFields.mlModelJsonId && customFields.mlMetadataId),
      version: customFields.mlModelVersion || null,
      status: customFields.mlModelStatus || 'inactive',
      modelJsonId: customFields.mlModelJsonId || null,
      modelBinId: customFields.mlModelBinId || null,
      metadataId: customFields.mlMetadataId || null,
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
        mlModelJsonId: args.modelJsonId,
        mlModelBinId: args.modelBinId,
        mlMetadataId: args.metadataId,
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
        mlModelJsonId: null,
        mlModelBinId: null,
        mlMetadataId: null,
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

  @Query()
  @Allow(Permission.ReadCatalog)
  async mlTrainingManifest(
    @Ctx() ctx: RequestContext,
    @Args() args: { channelId: ID }
  ): Promise<TrainingManifest> {
    return this.mlTrainingService.getTrainingManifest(ctx, args.channelId.toString());
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

  @Transaction()
  @Mutation()
  @Allow(Permission.UpdateCatalog)
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

      // Upload model.json
      const modelJsonResult = await this.assetService.create(ctx, {
        file: args.modelJson,
        tags,
      });

      // Upload weights.bin
      const weightsResult = await this.assetService.create(ctx, {
        file: args.weightsFile,
        tags,
      });

      // Upload metadata.json
      const metadataResult = await this.assetService.create(ctx, {
        file: args.metadata,
        tags,
      });

      // Check for errors in asset creation
      if (
        'message' in modelJsonResult ||
        'message' in weightsResult ||
        'message' in metadataResult
      ) {
        throw new Error('Failed to create assets');
      }

      // Assign assets to channel (CRITICAL: assets must be channel-aware for queries)
      await this.assetService.assignToChannel(ctx, {
        assetIds: [modelJsonResult.id, weightsResult.id, metadataResult.id],
        channelId: args.channelId.toString(),
      });

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

      // Update channel with new model assets and stats
      // Update channel with new model assets and stats
      await this.channelService.update(ctx, {
        id: args.channelId.toString(),
        customFields: {
          mlModelJsonId: modelJsonResult.id.toString(),
          mlModelBinId: weightsResult.id.toString(),
          mlMetadataId: metadataResult.id.toString(),
          mlModelVersion: version,
          mlModelStatus: 'active',
          mlTrainingStatus: 'active',
          mlTrainingProgress: 100,
          mlProductCount: productCount,
          mlImageCount: imageCount,
        },
      });

      this.logger.log('Training completed successfully');
      return true;
    } catch (error) {
      this.logger.error('Error completing training:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      await this.mlTrainingService.updateTrainingStatus(
        ctx,
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

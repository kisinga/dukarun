import { effect, inject, Injectable, signal } from '@angular/core';
import type { LayersModel } from '@tensorflow/tfjs';
import { BackgroundStateService } from '../background-state.service';
import { ModelError, ModelErrorType, parseError } from './model-error.util';
import { ModelLoaderService } from './model-loader.service';
import { ModelPredictorService } from './model-predictor.service';
import { ModelSourceResolverService } from './model-source-resolver.service';
import { ModelMetadata, ModelPrediction } from './model.types';

/**
 * ML Model Service
 *
 * Architecture: Tag-based versioning + custom field activation
 * - Active model: Asset IDs in Channel.customFields
 * - Versioning: Assets tagged with channel-{id}, v{version}, trained-{date}
 * - Loading: Query customFields → Fetch assets → Load from /assets/{source}
 * - Caching: IndexedDB via TensorFlow.js (version-keyed)
 *
 * Deployment: backend/scripts/deploy-ml-model.js
 * Documentation: ML_GUIDE.md
 */

@Injectable({
  providedIn: 'root',
})
export class MlModelService {
  private readonly backgroundStateService = inject(BackgroundStateService);
  private readonly loaderService = inject(ModelLoaderService);
  private readonly predictorService = inject(ModelPredictorService);
  private readonly sourceResolver = inject(ModelSourceResolverService);

  private model: LayersModel | null = null;
  private metadata: ModelMetadata | null = null;
  private readonly isLoadingSignal = signal<boolean>(false);
  private readonly isInitializedSignal = signal<boolean>(false);
  private readonly errorSignal = signal<ModelError | null>(null);

  readonly isLoading = this.isLoadingSignal.asReadonly();
  readonly isInitialized = this.isInitializedSignal.asReadonly();
  readonly error = this.errorSignal.asReadonly();

  constructor() {
    // Unload model when app goes to background to save memory and battery
    effect(() => {
      const isBackground = this.backgroundStateService.isBackground();
      if (isBackground && this.model) {
        console.log('[MlModelService] App went to background - unloading model to save resources');
        this.unloadModel();
      }
    });
  }

  /**
   * Check if model exists for the given channel
   */
  async checkModelExists(channelId: string): Promise<{ exists: boolean; error?: ModelError }> {
    try {
      const sources = await this.sourceResolver.getModelSources(channelId);

      if (!sources) {
        return {
          exists: false,
          error: {
            type: ModelErrorType.NOT_FOUND,
            message:
              'No ML model found for this store. Upload a model first to use product recognition.',
            technicalDetails: `ML model not configured for channel ${channelId}`,
          },
        };
      }

      return { exists: true };
    } catch (error: any) {
      return {
        exists: false,
        error: {
          type: ModelErrorType.NETWORK_ERROR,
          message: 'Network error while checking for ML model. Check your connection.',
          technicalDetails: error.message,
        },
      };
    }
  }

  /**
   * Load model for the given channel
   * Uses IndexedDB caching via TensorFlow.js for offline operation
   */
  async loadModel(channelId: string): Promise<boolean> {
    if (this.model) {
      return true;
    }

    this.isLoadingSignal.set(true);
    this.errorSignal.set(null);

    try {
      const result = await this.loaderService.loadModel(channelId);

      if (!result) {
        this.errorSignal.set({
          type: ModelErrorType.NOT_FOUND,
          message:
            'ML model not configured for this channel. Set up model asset IDs in channel settings to use product recognition.',
          technicalDetails: `No model sources for channel ${channelId}`,
        });
        this.model = null;
        this.metadata = null;
        this.isInitializedSignal.set(false);
        return false;
      }

      this.model = result.model;
      this.metadata = result.metadata;
      this.isInitializedSignal.set(true);
      return true;
    } catch (error: any) {
      // Parse error to determine if it's expected (404) or unexpected
      const parsedError = parseError(error);

      // Use appropriate logging level based on error type
      if (parsedError.type === ModelErrorType.NOT_FOUND) {
        console.warn('⚠️ ML model not available:', parsedError.message);
      } else {
        console.error('❌ Failed to load model:', error);
      }

      this.errorSignal.set(parsedError);
      this.model = null;
      this.metadata = null;
      this.isInitializedSignal.set(false);
      return false;
    } finally {
      this.isLoadingSignal.set(false);
    }
  }

  /**
   * Run prediction on image or video element
   * Model includes MobileNet, so we can pass raw images directly (matching Teachable Machine)
   */
  async predict(
    imageElement: HTMLImageElement | HTMLVideoElement,
    topK: number = 3,
  ): Promise<ModelPrediction[]> {
    if (!this.model || !this.metadata) {
      const error: ModelError = {
        type: ModelErrorType.PREDICTION_ERROR,
        message: 'Cannot make predictions - model not loaded.',
        technicalDetails: 'Model must be loaded before calling predict()',
      };
      this.errorSignal.set(error);
      throw new Error(error.message);
    }

    try {
      return await this.predictorService.predict(this.model, this.metadata, imageElement, topK);
    } catch (error: any) {
      console.error('Prediction error:', error);
      const modelError: ModelError = {
        type: ModelErrorType.PREDICTION_ERROR,
        message: 'Failed to recognize product. Please try again with better lighting.',
        technicalDetails: error instanceof Error ? error.message : String(error),
      };
      this.errorSignal.set(modelError);
      throw error;
    }
  }

  /**
   * Get product ID from model prediction label
   */
  getProductIdFromLabel(label: string): string {
    return label;
  }

  /**
   * Get current model metadata
   */
  getMetadata(): ModelMetadata | null {
    return this.metadata;
  }

  /**
   * Clear error state
   */
  clearError(): void {
    this.errorSignal.set(null);
  }

  /**
   * Unload model from memory
   */
  unloadModel(): void {
    if (this.model) {
      this.model.dispose();
      this.model = null;
    }

    this.metadata = null;
    this.isInitializedSignal.set(false);
    this.errorSignal.set(null);
  }

  /**
   * Clear model from IndexedDB cache
   */
  async clearModelCache(channelId: string): Promise<void> {
    this.unloadModel();
    await this.loaderService.clearModelCache(channelId);
  }

  /**
   * Clear asset sources cache (useful when channel changes)
   */
  clearAssetSourcesCache(): void {
    this.sourceResolver.clearCache();
  }

  /**
   * Check if cached model needs update
   */
  async checkForUpdate(channelId: string): Promise<boolean> {
    if (!this.metadata) return true;

    return await this.loaderService.checkForUpdate(channelId, this.metadata.trainedAt);
  }
}

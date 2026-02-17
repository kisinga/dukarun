import { inject, Injectable } from '@angular/core';
import type { LayersModel } from '@tensorflow/tfjs';
import { ModelMetadata } from './model.types';
import { ModelSourceResolverService } from './model-source-resolver.service';
import { getTf } from './tensorflow.util';

/**
 * Service for loading ML models with IndexedDB caching
 * Handles model loading, metadata fetching, and cache management
 */
@Injectable({
  providedIn: 'root',
})
export class ModelLoaderService {
  private readonly sourceResolver = inject(ModelSourceResolverService);

  private readonly MODEL_CACHE_NAME = 'dukarun-ml-models';

  /**
   * Load model for the given channel
   * Uses IndexedDB caching via TensorFlow.js for offline operation
   */
  async loadModel(channelId: string): Promise<{
    model: LayersModel;
    metadata: ModelMetadata;
  } | null> {
    const tf = await getTf();

    // Initialize TensorFlow backend
    await tf.setBackend('webgl');
    await tf.ready();

    // Get model file URLs
    const sources = await this.sourceResolver.getModelSources(channelId);

    if (!sources) {
      return null;
    }

    // Include credentials to send session cookies for authenticated asset access
    const metadataResponse = await fetch(sources.metadataUrl, {
      credentials: 'include',
    });

    if (!metadataResponse.ok) {
      // Handle 404 as "model not available" (expected scenario)
      if (metadataResponse.status === 404) {
        throw new Error(
          `ML model not configured for this channel. Please set up the model asset IDs in channel settings. Metadata URL returned HTTP ${metadataResponse.status}`,
        );
      }
      // Other HTTP errors are unexpected
      throw new Error(`Failed to fetch metadata: HTTP ${metadataResponse.status}`);
    }

    const metadataJson = await metadataResponse.json();
    // Merge metadata, ensuring all fields from backend are included
    const metadata: ModelMetadata = {
      ...metadataJson,
      channelId,
      // Ensure optional fields are included
      trainingId: metadataJson.trainingId,
      modelName: metadataJson.modelName,
    };

    // Log model metadata for debugging
    console.log('[ModelLoader] Model metadata:', {
      trainingId: metadata.trainingId,
      modelName: metadata.modelName,
      trainedAt: metadata.trainedAt,
      productCount: metadata.productCount,
      imageCount: metadata.imageCount,
      labelsCount: metadata.labels?.length || 0,
      version: metadata.version,
    });

    // Use trainingId in cache key to ensure we load the correct model version
    // If trainingId is not available, fall back to channelId (for backward compatibility)
    const cacheKey = `indexeddb://${this.MODEL_CACHE_NAME}/${channelId}-${metadata.trainingId || 'legacy'}`;

    try {
      const model = await tf.loadLayersModel(cacheKey);

      // Log model architecture info
      const inputShape = model.inputs[0]?.shape;
      console.log('[ModelLoader] Model loaded from cache:', {
        inputShape,
        outputShape: model.outputs[0]?.shape,
        layersCount: model.layers.length,
        cacheKey,
      });

      // Verify the cached model has the correct input shape (should be [null, 224, 224, 3] for new format)
      if (
        inputShape &&
        inputShape.length === 4 &&
        inputShape[1] === 224 &&
        inputShape[2] === 224 &&
        inputShape[3] === 3
      ) {
        console.log('[ModelLoader] ✓ Cached model has correct input shape for combined format');
      } else {
        console.warn('[ModelLoader] ⚠ Cached model has unexpected input shape:', inputShape);
        // Clear the cache and reload from network
        await tf.io.removeModel(cacheKey);
        throw new Error('Cached model has incorrect format, will reload from network');
      }

      return { model, metadata };
    } catch (cacheError) {
      // Cache miss or invalid cache - load from network
      console.log('[ModelLoader] Cache miss or invalid cache, loading from network:', cacheError);
      // Cache miss - load from network using custom IOHandler
      // This is necessary because Vendure assigns each asset a unique URL,
      // and TensorFlow.js tries to resolve weights relative to model.json URL.
      // We load model.json and weights separately from their correct URLs.
      // Include credentials to send session cookies for authenticated asset access
      const modelJsonResponse = await fetch(sources.modelUrl, {
        credentials: 'include',
      });
      if (!modelJsonResponse.ok) {
        throw new Error(`Failed to fetch model.json: HTTP ${modelJsonResponse.status}`);
      }
      const modelJson = await modelJsonResponse.json();

      const weightsResponse = await fetch(sources.weightsUrl, {
        credentials: 'include',
      });
      if (!weightsResponse.ok) {
        throw new Error(`Failed to fetch weights: HTTP ${weightsResponse.status}`);
      }
      const weightsData = await weightsResponse.arrayBuffer();

      // Custom IOHandler that provides model topology and weights from our fetched data
      // Type is inferred from tf.loadLayersModel parameter type
      const customHandler: Parameters<typeof tf.loadLayersModel>[0] = {
        load: async () => ({
          modelTopology: modelJson.modelTopology,
          weightSpecs: modelJson.weightsManifest?.[0]?.weights || [],
          weightData: weightsData,
          format: modelJson.format,
          generatedBy: modelJson.generatedBy,
          convertedBy: modelJson.convertedBy,
        }),
      };

      const model = await tf.loadLayersModel(customHandler);

      // Log model architecture info
      const inputShape = model.inputs[0]?.shape;
      console.log('[ModelLoader] Model loaded from network:', {
        inputShape,
        outputShape: model.outputs[0]?.shape,
        layersCount: model.layers.length,
      });

      // Verify the loaded model has the correct input shape
      if (
        inputShape &&
        inputShape.length === 4 &&
        inputShape[1] === 224 &&
        inputShape[2] === 224 &&
        inputShape[3] === 3
      ) {
        console.log('[ModelLoader] ✓ Model has correct input shape for combined format');
      } else {
        console.error('[ModelLoader] ✗ Model has incorrect input shape:', inputShape);
        console.error('[ModelLoader] Expected [null, 224, 224, 3], got:', inputShape);
        throw new Error(
          `Model has incorrect input shape. Expected [null, 224, 224, 3], got ${JSON.stringify(inputShape)}. This model may need retraining.`,
        );
      }

      // Save to cache with trainingId-based key
      await model.save(cacheKey);
      console.log('[ModelLoader] Model saved to cache with key:', cacheKey);

      return { model, metadata };
    }
  }

  /**
   * Check if cached model needs update
   */
  async checkForUpdate(channelId: string, currentTrainedAt: string): Promise<boolean> {
    try {
      const sources = await this.sourceResolver.getModelSources(channelId);
      if (!sources) return false;

      // Include credentials to send session cookies for authenticated asset access
      const metadataResponse = await fetch(sources.metadataUrl, {
        credentials: 'include',
      });
      if (!metadataResponse.ok) return false;

      const remoteMetadata = await metadataResponse.json();

      const cachedTime = new Date(currentTrainedAt);
      const remoteTime = new Date(remoteMetadata.trainedAt || '');

      return remoteTime > cachedTime;
    } catch (error) {
      console.error('Error checking for model update:', error);
      return false;
    }
  }

  /**
   * Clear model from IndexedDB cache
   * Clears all cached models for the channel (including all trainingId variants)
   */
  async clearModelCache(channelId: string): Promise<void> {
    try {
      const tf = await getTf();
      const models = await tf.io.listModels();

      // Clear all models for this channel (including legacy and trainingId-based keys)
      const prefix = `indexeddb://${this.MODEL_CACHE_NAME}/${channelId}`;
      for (const key in models) {
        if (key.startsWith(prefix)) {
          await tf.io.removeModel(key);
          console.log('[ModelLoader] Cleared cached model:', key);
        }
      }
    } catch (error) {
      console.error('Error clearing model cache:', error);
    }
  }
}

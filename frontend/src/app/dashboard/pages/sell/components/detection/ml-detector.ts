import { Injector } from '@angular/core';
import { loadMlModelService } from '../../../../../core/services/ml-model.loader';
import type { MlModelService } from '../../../../../core/services/ml-model/ml-model.service';
import { ProductSearchService } from '../../../../../core/services/product/product-search.service';
import { ScannerBeepService } from '../../../../../core/services/scanner-beep.service';
import { Detector, DetectionResult } from './detection.types';

/**
 * ML (Machine Learning) detector implementing the Detector interface.
 * Uses MlModelService for product image recognition
 * and ProductSearchService for product lookup.
 *
 * Lazy-loads the ML model service to avoid loading TensorFlow.js
 * until actually needed.
 */
export class MLDetector implements Detector {
  readonly name = 'ml';

  private mlModelService: MlModelService | null = null;
  private ready = false;
  private processing = false;

  constructor(
    private readonly injector: Injector,
    private readonly productSearchService: ProductSearchService,
    private readonly beepService: ScannerBeepService,
    private readonly channelId: string,
    private readonly confidenceThreshold: number = 0.9,
  ) {}

  async initialize(): Promise<boolean> {
    try {
      // Lazy-load the ML model service
      this.mlModelService = await loadMlModelService(this.injector);

      // Load the model for the channel
      const modelLoaded = await this.mlModelService.loadModel(this.channelId);

      if (!modelLoaded) {
        const error = this.mlModelService.error();
        console.warn('[MLDetector] ML model not available:', error?.message || 'Unknown error');
        this.ready = false;
        return false;
      }

      this.ready = true;
      console.log('[MLDetector] Initialized successfully');
      return true;
    } catch (error) {
      console.error('[MLDetector] Failed to initialize:', error);
      this.ready = false;
      return false;
    }
  }

  async processFrame(video: HTMLVideoElement): Promise<DetectionResult | null> {
    if (!this.ready || this.processing || !this.mlModelService) {
      return null;
    }

    // Check if video is ready
    if (!video.videoWidth || video.paused || video.ended) {
      return null;
    }

    this.processing = true;

    try {
      // Run ML prediction
      const predictions = await this.mlModelService.predict(video, 3);
      const bestPrediction = predictions[0];

      // Check if prediction meets confidence threshold
      if (!bestPrediction || bestPrediction.probability < this.confidenceThreshold) {
        return null;
      }

      console.log(
        `[MLDetector] Detection: ${bestPrediction.className} (${(bestPrediction.probability * 100).toFixed(1)}%)`,
      );

      // Get product ID from the prediction label
      const productId = this.mlModelService.getProductIdFromLabel(bestPrediction.className);

      // Look up product
      const product = await this.productSearchService.getProductById(productId);

      if (!product) {
        console.warn(
          `[MLDetector] ML detected "${bestPrediction.className}" but product not found in system`,
        );
        return null;
      }

      // Play beep on successful detection (fire and forget)
      this.beepService.playBeep().catch(() => {
        // Silently handle beep errors
      });

      // Build detection result
      const result: DetectionResult = {
        type: 'ml',
        product,
        confidence: bestPrediction.probability,
      };

      console.log('[MLDetector] Product found:', result.product.name);
      return result;
    } catch (error) {
      console.error('[MLDetector] Error processing frame:', error);
      return null;
    } finally {
      this.processing = false;
    }
  }

  isReady(): boolean {
    return this.ready && this.mlModelService?.isInitialized() === true;
  }

  isProcessing(): boolean {
    return this.processing;
  }

  cleanup(): void {
    this.ready = false;
    this.processing = false;

    // Unload the model to free memory
    if (this.mlModelService) {
      this.mlModelService.unloadModel();
    }

    console.log('[MLDetector] Cleaned up');
  }
}

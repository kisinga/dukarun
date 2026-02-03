import { inject, Injectable } from '@angular/core';
import type { LayersModel, Tensor } from '@tensorflow/tfjs';
import { ModelMetadata, ModelPrediction } from './model.types';
import { getTf } from './tensorflow.util';

/**
 * Service for executing ML model predictions on images/videos
 * Handles image preprocessing and prediction execution
 */
@Injectable({
  providedIn: 'root',
})
export class ModelPredictorService {
  private modelInfoLogged = false;

  /**
   * Detect model format by checking input shape
   * Returns 'combined' if model accepts raw images [224,224,3], 'legacy' if it expects features
   */
  private detectModelFormat(model: LayersModel): 'combined' | 'legacy' {
    if (!model.inputs || model.inputs.length === 0) {
      return 'legacy'; // Default to legacy if we can't determine
    }

    const inputShape = model.inputs[0].shape;
    if (!inputShape || inputShape.length === 0) {
      return 'legacy';
    }

    // Combined models (with MobileNet) expect [null, 224, 224, 3]
    // Legacy models expect [null, 7, 7, 256] or [null, 12544]
    if (inputShape.length === 4 && inputShape[1] === 224 && inputShape[2] === 224) {
      return 'combined';
    }

    return 'legacy';
  }

  /**
   * Run prediction on image or video element
   * Automatically detects model format and handles accordingly
   */
  async predict(
    model: LayersModel,
    metadata: ModelMetadata,
    imageElement: HTMLImageElement | HTMLVideoElement,
    topK: number = 3,
  ): Promise<ModelPrediction[]> {
    const tf = await getTf();

    // Detect model format
    const modelFormat = this.detectModelFormat(model);
    const inputShape = model.inputs[0]?.shape;

    // Log model info only once per session (not on every prediction)
    if (!this.modelInfoLogged) {
      console.log('[ModelPredictor] Model loaded:', {
        format: modelFormat,
        inputShape,
        trainingId: metadata.trainingId,
        trainedAt: metadata.trainedAt,
        modelName: metadata.modelName,
      });
      this.modelInfoLogged = true;
    }

    // Check if this is a legacy model (expects features, not raw images)
    if (modelFormat === 'legacy') {
      const errorMessage = `This model uses the old format (classification head only) and requires retraining. Model expects features but received raw images. Please retrain the model to use the new combined format.`;
      console.error('[ModelPredictor] Legacy model detected:', {
        inputShape,
        expected: 'features [7,7,256] or [12544]',
        received: 'raw images [224,224,3]',
      });
      throw new Error(errorMessage);
    }

    // Preprocess image: resize to 224x224, normalize to [0,1]
    const tensor = tf.tidy(() => {
      let img = tf.browser.fromPixels(imageElement);
      const imageSize = metadata.imageSize || 224;
      img = tf.image.resizeBilinear(img, [imageSize, imageSize]);
      img = img.toFloat().div(255.0);
      return img.expandDims(0);
    });

    // Direct prediction (model includes MobileNet)
    const predictions = model.predict(tensor) as Tensor;
    const probabilities = await predictions.data();

    // Cleanup tensors
    tensor.dispose();
    predictions.dispose();

    const labels = metadata.labels;
    const results: ModelPrediction[] = labels.map((label, i) => ({
      className: label,
      probability: probabilities[i],
    }));

    results.sort((a, b) => b.probability - a.probability);
    const topResults = results.slice(0, topK);

    // Log predictions with >75% confidence
    const highConfidenceResults = topResults.filter((r) => r.probability > 0.3);
    if (highConfidenceResults.length > 0) {
      console.log('[ModelPredictor] High confidence prediction:', {
        topPrediction: topResults[0],
        confidence: (topResults[0].probability * 100).toFixed(1) + '%',
        allTopK: topResults.map((r) => ({
          label: r.className,
          confidence: (r.probability * 100).toFixed(1) + '%',
        })),
      });
    }

    return topResults;
  }
}

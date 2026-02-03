/**
 * Type definitions for ML model service
 */

export interface ModelMetadata {
  version: string;
  trainedAt: string;
  channelId: string;
  productCount: number;
  imageCount: number;
  trainingDuration: number;
  labels: string[];
  imageSize: number;
  modelType: string;
  // Additional fields from ml-trainer
  trainingId?: string;
  modelName?: string;
  // Model format detection
  modelFormat?: 'combined' | 'legacy'; // 'combined' = includes MobileNet, 'legacy' = classification head only
}

export interface ModelPrediction {
  className: string;
  probability: number;
}

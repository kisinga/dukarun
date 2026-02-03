/**
 * Type definitions for ML training pipeline
 */

export interface TrainingConfig {
  channelId: string;
  manifestUrl: string;
  webhookUrl: string;
  authToken?: string;
}

export interface DatasetItem {
  path: string;
  labelIndex: number;
}

export interface ImageManifestEntry {
  assetId: string;
  url: string;
  filename: string;
}

export interface ProductManifestEntry {
  productId: string;
  productName: string;
  images: ImageManifestEntry[];
}

export interface TrainingManifest {
  channelId: string;
  version: string;
  extractedAt: string;
  products: ProductManifestEntry[];
}

export interface ModelMetadata {
  modelName: string;
  trainingId: string;
  labels: string[];
  imageSize: number;
  trainedAt: string;
  productCount: number;
  imageCount: number;
  files: {
    modelJson: string;
    weights: string;
    metadata: string;
  };
}

export interface ArtifactFileNames {
  modelJson: string;
  weights: string;
  metadata: string;
}

/**
 * Augmentation configuration for data augmentation during training
 */
export interface AugmentationConfig {
  rotation?: { enabled: boolean; maxDegrees: number };
  flipHorizontal?: { enabled: boolean; probability: number };
  flipVertical?: { enabled: boolean; probability: number };
  brightness?: { enabled: boolean; maxDelta: number };
  contrast?: { enabled: boolean; maxDelta: number };
  saturation?: { enabled: boolean; maxDelta: number };
  crop?: { enabled: boolean; maxCropRatio: number };
  noise?: { enabled: boolean; stddev: number };
}

/**
 * Training metrics for a single epoch
 */
export interface TrainingMetrics {
  epoch: number;
  loss: number;
  accuracy: number;
  valLoss?: number;
  valAccuracy?: number;
}

/**
 * Validation results after training
 */
export interface ValidationResults {
  loss: number;
  accuracy: number;
  perClassAccuracy?: Record<string, number>;
}




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



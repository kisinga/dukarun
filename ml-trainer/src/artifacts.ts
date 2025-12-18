/**
 * Model artifact file management
 */
import * as tf from '@tensorflow/tfjs-node';
import axios from 'axios';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { promisify } from 'util';
import { pipeline as streamPipeline } from 'stream';
import { DatasetItem, ProductManifestEntry, ModelMetadata, ArtifactFileNames } from './types';
import { IMAGE_SIZE, logger } from './constants';

const pipeline = promisify(streamPipeline);

/**
 * Download image from URL to local path
 */
export async function downloadImage(url: string, destPath: string): Promise<void> {
  try {
    const response = await axios({
      url,
      method: 'GET',
      responseType: 'stream',
      timeout: 30000,
    });
    await pipeline(response.data, fs.createWriteStream(destPath));
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    logger.warn(`Failed to download image ${url}: ${errorMessage}`);
    throw err;
  }
}

/**
 * Download all images for products and build dataset
 */
export async function downloadDataset(
  products: ProductManifestEntry[],
  jobDir: string
): Promise<{ dataset: DatasetItem[]; totalImages: number }> {
  const classes = products.map(p => p.productId);
  const dataset: DatasetItem[] = [];
  let totalImages = 0;

  logger.info(`Downloading images for ${products.length} products...`);

  for (const product of products) {
    logger.info(`Downloading ${product.images.length} images for product ${product.productId}`);
    for (const image of product.images) {
      const imagePath = path.join(jobDir, `${product.productId}_${image.assetId}.jpg`);
      await downloadImage(image.url, imagePath);
      dataset.push({
        path: imagePath,
        labelIndex: classes.indexOf(product.productId),
      });
      totalImages++;
    }
  }

  logger.info(`Downloaded ${totalImages} images successfully`);

  if (totalImages === 0) {
    throw new Error('No images found in manifest');
  }

  return { dataset, totalImages };
}

/**
 * Generate unique training ID
 */
export function generateTrainingId(): string {
  return crypto.randomUUID().slice(0, 8);
}

/**
 * Save model with unique filenames to prevent Vendure naming conflicts
 */
export async function saveModelArtifacts(
  model: tf.Sequential,
  channelId: string,
  artifactsDir: string,
  classes: string[],
  productCount: number,
  imageCount: number
): Promise<{ metadata: ModelMetadata; fileNames: ArtifactFileNames }> {
  if (!fs.existsSync(artifactsDir)) {
    fs.mkdirSync(artifactsDir, { recursive: true });
  }

  const trainingId = generateTrainingId();
  logger.info(`Training ID: ${trainingId}`);

  // Save model with TensorFlow's default names
  await model.save(`file://${artifactsDir}`);

  // Generate unique filenames
  const fileNames: ArtifactFileNames = {
    modelJson: `model-${channelId}-${trainingId}.json`,
    weights: `model-${channelId}-${trainingId}.weights.bin`,
    metadata: `metadata-${channelId}-${trainingId}.json`,
  };

  // Update model.json to reference unique weights filename
  const modelJsonPath = path.join(artifactsDir, 'model.json');
  const modelJson = JSON.parse(fs.readFileSync(modelJsonPath, 'utf-8'));
  if (modelJson.weightsManifest?.[0]?.paths) {
    modelJson.weightsManifest[0].paths = [fileNames.weights];
  }

  // Write updated model.json with new name
  fs.writeFileSync(path.join(artifactsDir, fileNames.modelJson), JSON.stringify(modelJson));
  fs.unlinkSync(modelJsonPath);

  // Rename weights.bin
  fs.renameSync(
    path.join(artifactsDir, 'weights.bin'),
    path.join(artifactsDir, fileNames.weights)
  );

  // Create metadata
  const metadata: ModelMetadata = {
    modelName: `dukarun-channel-${channelId}`,
    trainingId,
    labels: classes,
    imageSize: IMAGE_SIZE,
    trainedAt: new Date().toISOString(),
    productCount,
    imageCount,
    files: fileNames,
  };

  fs.writeFileSync(path.join(artifactsDir, fileNames.metadata), JSON.stringify(metadata));

  return { metadata, fileNames };
}

/**
 * Cleanup temporary job directory
 */
export function cleanupJobDir(jobDir: string, keepForDebug = true): void {
  if (fs.existsSync(jobDir) && !keepForDebug) {
    fs.rmSync(jobDir, { recursive: true, force: true });
    logger.info(`Cleaned up job directory: ${jobDir}`);
  }
}



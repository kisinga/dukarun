/**
 * Artifact Management
 *
 * Handles downloading training images, saving model artifacts,
 * and cleanup of temporary files.
 */
import * as tf from '@tensorflow/tfjs-node';
import fs from 'fs';
import path from 'path';
import axios from 'axios';
import { DatasetItem, ProductManifestEntry, ModelMetadata, ArtifactFileNames } from './types';
import { IMAGE_SIZE, logger } from './constants';

// =============================================================================
// Dataset Download
// =============================================================================

/**
 * Download all images from the training manifest to local disk.
 *
 * Creates a directory structure:
 * jobDir/
 *   images/
 *     0/  (first product)
 *       image1.jpg
 *       image2.jpg
 *     1/  (second product)
 *       ...
 *
 * @param products - Array of products with image URLs from manifest
 * @param jobDir - Directory to store downloaded images
 * @returns Dataset items (paths + label indices) and total image count
 */
export async function downloadDataset(
  products: ProductManifestEntry[],
  jobDir: string
): Promise<{ dataset: DatasetItem[]; totalImages: number }> {
  logger.info(`Downloading images for ${products.length} products...`);

  const imagesDir = path.join(jobDir, 'images');
  if (!fs.existsSync(imagesDir)) {
    fs.mkdirSync(imagesDir, { recursive: true });
  }

  const dataset: DatasetItem[] = [];
  let totalImages = 0;
  let failedDownloads = 0;

  for (let productIndex = 0; productIndex < products.length; productIndex++) {
    const product = products[productIndex];
    const productDir = path.join(imagesDir, productIndex.toString());

    if (!fs.existsSync(productDir)) {
      fs.mkdirSync(productDir, { recursive: true });
    }

    logger.info(`  Downloading images for product ${productIndex + 1}/${products.length}: ${product.productName}`);

    for (let imageIndex = 0; imageIndex < product.images.length; imageIndex++) {
      const image = product.images[imageIndex];

      try {
        // Determine file extension from URL or filename
        const ext = getFileExtension(image.url, image.filename);
        const filename = `${imageIndex}${ext}`;
        const imagePath = path.join(productDir, filename);

        // Download image
        await downloadImage(image.url, imagePath);

        // Add to dataset
        dataset.push({
          path: imagePath,
          labelIndex: productIndex,
        });

        totalImages++;
      } catch (error) {
        failedDownloads++;
        logger.warn(
          `    Failed to download image ${image.filename}: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }
    }
  }

  logger.info(`Download complete: ${totalImages} images downloaded, ${failedDownloads} failed`);

  if (totalImages === 0) {
    throw new Error('No images could be downloaded from the manifest');
  }

  // Warn if we have very few images per class
  const avgImagesPerClass = totalImages / products.length;
  if (avgImagesPerClass < 3) {
    logger.warn(
      `Low image count: average ${avgImagesPerClass.toFixed(1)} images per product. ` +
        `Consider adding more images for better accuracy.`
    );
  }

  return { dataset, totalImages };
}

/**
 * Download a single image from URL to local path.
 */
async function downloadImage(url: string, destPath: string): Promise<void> {
  const response = await axios.get(url, {
    responseType: 'arraybuffer',
    timeout: 30000, // 30 second timeout
    headers: {
      'User-Agent': 'DukarunMLTrainer/1.0',
    },
  });

  fs.writeFileSync(destPath, Buffer.from(response.data));
}

/**
 * Get file extension from URL or filename.
 */
function getFileExtension(url: string, filename: string): string {
  // Try to get extension from filename first
  const filenameExt = path.extname(filename).toLowerCase();
  if (filenameExt && ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp'].includes(filenameExt)) {
    return filenameExt;
  }

  // Try to get extension from URL
  try {
    const urlPath = new URL(url).pathname;
    const urlExt = path.extname(urlPath).toLowerCase();
    if (urlExt && ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp'].includes(urlExt)) {
      return urlExt;
    }
  } catch {
    // Invalid URL, continue with default
  }

  // Default to .jpg
  return '.jpg';
}

// =============================================================================
// Model Artifact Saving
// =============================================================================

/**
 * Save trained model and metadata to disk.
 *
 * Creates three files:
 * - model.json: Model architecture and weight manifest
 * - weights.bin: Model weights (binary)
 * - metadata.json: Training metadata (labels, stats, etc.)
 *
 * @param model - Trained TensorFlow.js model
 * @param channelId - Channel ID for naming
 * @param artifactsDir - Directory to save artifacts
 * @param labels - Array of product IDs (class labels)
 * @param productCount - Number of products trained on
 * @param imageCount - Total number of training images
 * @returns File names of saved artifacts
 */
export async function saveModelArtifacts(
  model: tf.LayersModel,
  channelId: string,
  artifactsDir: string,
  labels: string[],
  productCount: number,
  imageCount: number
): Promise<{ fileNames: ArtifactFileNames }> {
  logger.info(`Saving model artifacts to ${artifactsDir}...`);

  if (!fs.existsSync(artifactsDir)) {
    fs.mkdirSync(artifactsDir, { recursive: true });
  }

  // Save model to file system
  const modelPath = `file://${artifactsDir}`;
  await model.save(modelPath);

  // The model.save creates model.json and group1-shardXofY.bin files
  // Rename the weights file to weights.bin for consistency
  const modelJsonPath = path.join(artifactsDir, 'model.json');
  const weightsPath = path.join(artifactsDir, 'weights.bin');

  // Find and rename the weights file(s)
  const files = fs.readdirSync(artifactsDir);
  const weightFiles = files.filter(f => f.endsWith('.bin') && f !== 'weights.bin');

  if (weightFiles.length === 1) {
    // Single weights file - rename it
    fs.renameSync(path.join(artifactsDir, weightFiles[0]), weightsPath);

    // Update model.json to reference the renamed weights file
    const modelJson = JSON.parse(fs.readFileSync(modelJsonPath, 'utf8'));
    if (modelJson.weightsManifest && modelJson.weightsManifest[0]) {
      modelJson.weightsManifest[0].paths = ['weights.bin'];
    }
    fs.writeFileSync(modelJsonPath, JSON.stringify(modelJson));
  } else if (weightFiles.length > 1) {
    // Multiple weight shards - combine them
    const weightBuffers: Buffer[] = [];
    for (const wf of weightFiles.sort()) {
      weightBuffers.push(fs.readFileSync(path.join(artifactsDir, wf)));
      fs.unlinkSync(path.join(artifactsDir, wf)); // Remove original
    }
    fs.writeFileSync(weightsPath, Buffer.concat(weightBuffers));

    // Update model.json
    const modelJson = JSON.parse(fs.readFileSync(modelJsonPath, 'utf8'));
    if (modelJson.weightsManifest && modelJson.weightsManifest[0]) {
      modelJson.weightsManifest[0].paths = ['weights.bin'];
    }
    fs.writeFileSync(modelJsonPath, JSON.stringify(modelJson));
  }

  // Create metadata file
  const trainingId = `${channelId}-${Date.now()}`;
  const metadata: ModelMetadata = {
    modelName: `product-classifier-${channelId}`,
    trainingId,
    labels,
    imageSize: IMAGE_SIZE,
    trainedAt: new Date().toISOString(),
    productCount,
    imageCount,
    files: {
      modelJson: 'model.json',
      weights: 'weights.bin',
      metadata: 'metadata.json',
    },
  };

  const metadataPath = path.join(artifactsDir, 'metadata.json');
  fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));

  logger.info('Model artifacts saved:');
  logger.info(`  model.json: ${fs.statSync(modelJsonPath).size} bytes`);
  logger.info(`  weights.bin: ${fs.statSync(weightsPath).size} bytes`);
  logger.info(`  metadata.json: ${fs.statSync(metadataPath).size} bytes`);

  return {
    fileNames: {
      modelJson: 'model.json',
      weights: 'weights.bin',
      metadata: 'metadata.json',
    },
  };
}

// =============================================================================
// Cleanup
// =============================================================================

/**
 * Clean up temporary job directory after training completes.
 *
 * @param jobDir - Directory to remove
 */
export function cleanupJobDir(jobDir: string): void {
  try {
    if (fs.existsSync(jobDir)) {
      fs.rmSync(jobDir, { recursive: true, force: true });
      logger.info(`Cleaned up job directory: ${jobDir}`);
    }
  } catch (error) {
    logger.warn(
      `Failed to cleanup job directory ${jobDir}: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

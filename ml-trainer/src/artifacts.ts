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
 * Accepts both Sequential and LayersModel (for combined models with MobileNet)
 */
export async function saveModelArtifacts(
  model: tf.LayersModel,
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

  // Log model structure before saving to verify it's correct
  logger.info(`Saving model with ${model.layers.length} layers`);
  logger.info(`Model input shape: ${JSON.stringify(model.inputs[0]?.shape)}`);
  logger.info(`Model output shape: ${JSON.stringify(model.outputs[0]?.shape)}`);
  
  // Verify model expects raw images [224, 224, 3]
  const inputShape = model.inputs[0]?.shape;
  if (inputShape && inputShape.length === 4 && inputShape[1] === 224 && inputShape[2] === 224 && inputShape[3] === 3) {
    logger.info('✓ Model correctly expects raw images [224, 224, 3]');
  } else {
    logger.error(`✗ Model input shape is incorrect: ${JSON.stringify(inputShape)}. Expected [null, 224, 224, 3]`);
    throw new Error(`Model input shape mismatch. Got ${JSON.stringify(inputShape)}, expected [null, 224, 224, 3]`);
  }

  // Save model with TensorFlow's default names
  // includeOptimizer: false to reduce file size (we don't need optimizer state for inference)
  await model.save(`file://${artifactsDir}`, { includeOptimizer: false });
  
  logger.info('Model saved successfully');
  
  // Verify the saved model.json to ensure it has the correct structure
  const modelJsonPath = path.join(artifactsDir, 'model.json');
  if (fs.existsSync(modelJsonPath)) {
    const savedModelJson = JSON.parse(fs.readFileSync(modelJsonPath, 'utf-8'));
    const savedLayersCount = savedModelJson.modelTopology?.layers?.length || 0;
    logger.info(`Saved model has ${savedLayersCount} layers in topology`);
    
    // Check weights manifest to see how many weight groups are included
    const weightsManifest = savedModelJson.weightsManifest?.[0];
    if (weightsManifest) {
      const weightsCount = weightsManifest.weights?.length || 0;
      logger.info(`Saved model has ${weightsCount} weight tensors in manifest`);
      
      // Calculate total weight size
      const totalWeightSize = weightsManifest.weights?.reduce((sum: number, w: any) => sum + (w.shape?.reduce((a: number, b: number) => a * b, 1) || 0), 0) || 0;
      logger.info(`Total weight elements: ${totalWeightSize.toLocaleString()}`);
    }
    
    // Check if the first layer is the input layer with correct shape
    const firstLayer = savedModelJson.modelTopology?.layers?.[0];
    if (firstLayer) {
      logger.info(`First layer in saved model: ${firstLayer.name}, config: ${JSON.stringify(firstLayer.config?.batchInputShape || firstLayer.config?.inputShape)}`);
    }
    
    // Verify we have enough layers (should match the model we created)
    if (savedLayersCount < model.layers.length) {
      logger.warn(`Warning: Saved model has ${savedLayersCount} layers but original model has ${model.layers.length} layers`);
    }
  }
  
  // Check the actual weights.bin file size
  const weightsPath = path.join(artifactsDir, 'weights.bin');
  if (fs.existsSync(weightsPath)) {
    const stats = fs.statSync(weightsPath);
    const fileSizeMB = (stats.size / (1024 * 1024)).toFixed(2);
    logger.info(`Weights file size: ${fileSizeMB} MB (${stats.size.toLocaleString()} bytes)`);
    
    // MobileNet + classification head should be ~4-5 MB
    // If it's only ~900KB, only the classification head is saved
    if (stats.size < 2000000) {
      logger.error(`ERROR: Weights file is too small (${fileSizeMB} MB). Expected ~4-5 MB for MobileNet + classification head.`);
      logger.error('This indicates MobileNet weights are NOT being saved!');
      throw new Error(`Weights file too small: ${fileSizeMB} MB. Expected ~4-5 MB. MobileNet weights may not be included.`);
    }
  }

  // Generate unique filenames
  const fileNames: ArtifactFileNames = {
    modelJson: `model-${channelId}-${trainingId}.json`,
    weights: `model-${channelId}-${trainingId}.weights.bin`,
    metadata: `metadata-${channelId}-${trainingId}.json`,
  };

  // Update model.json to reference unique weights filename
  // Reuse modelJsonPath that was already declared above
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



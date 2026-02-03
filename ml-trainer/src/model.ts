/**
 * Model Architecture and Image Processing
 *
 * Implements transfer learning with MobileNet V2 for product classification.
 * Architecture matches Teachable Machine for frontend compatibility.
 */
import * as tf from '@tensorflow/tfjs-node';
import fs from 'fs';
import path from 'path';
import { DatasetItem } from './types';
import { IMAGE_SIZE, LEARNING_RATE, DROPOUT_RATE, logger } from './constants';

// =============================================================================
// MobileNet Loading
// =============================================================================

/**
 * Load MobileNet as feature extractor (truncated before final classification layer).
 *
 * Uses MobileNet V1 0.25 (smaller, faster) which is well-suited for:
 * - Small datasets (transfer learning)
 * - Edge deployment (frontend inference)
 * - Quick training iterations
 *
 * IMPORTANT: We truncate the model to get features from the layer BEFORE
 * the final classification layer. The full model outputs 1000 ImageNet classes,
 * but we need the feature vectors for transfer learning.
 *
 * @returns Truncated MobileNet model that outputs feature vectors
 */
export async function loadMobileNet(): Promise<tf.LayersModel> {
  logger.info('Loading MobileNet base model...');

  // Use MobileNet V1 0.25 - smaller model, good for transfer learning
  const MOBILENET_URL =
    'https://storage.googleapis.com/tfjs-models/tfjs/mobilenet_v1_0.25_224/model.json';

  try {
    const fullMobilenet = await tf.loadLayersModel(MOBILENET_URL);

    logger.info(`Full MobileNet loaded. Layers: ${fullMobilenet.layers.length}`);
    logger.info(`Full model output shape: ${JSON.stringify(fullMobilenet.outputs[0].shape)}`);

    // Find the feature extraction layer (before final dense/softmax)
    // MobileNet V1 0.25 224 structure:
    // - conv layers → global_average_pooling2d → reshape → dense (1000) → softmax
    // We want the output AFTER global_average_pooling or reshape, BEFORE dense

    // List layers to find the right one
    const layerNames = fullMobilenet.layers.map(l => `${l.name}: ${l.outputShape}`);
    logger.info('Looking for feature layer...');

    // Find the layer before the final dense layer
    // Usually named 'global_average_pooling2d', 'reshape', or 'flatten'
    let featureLayerName: string | null = null;

    for (let i = fullMobilenet.layers.length - 1; i >= 0; i--) {
      const layer = fullMobilenet.layers[i];
      const name = layer.name.toLowerCase();

      // Skip the final classification layers
      if (name.includes('dense') || name.includes('softmax') || name.includes('predictions')) {
        continue;
      }

      // Found a good feature layer
      if (
        name.includes('pool') ||
        name.includes('reshape') ||
        name.includes('flatten') ||
        name.includes('dropout') ||
        name.includes('conv')
      ) {
        featureLayerName = layer.name;
        logger.info(
          `Found feature layer: ${featureLayerName} with shape ${JSON.stringify(layer.outputShape)}`
        );
        break;
      }
    }

    if (!featureLayerName) {
      // Fallback: use second-to-last layer
      featureLayerName = fullMobilenet.layers[fullMobilenet.layers.length - 2].name;
      logger.warn(`No pool/reshape layer found, using: ${featureLayerName}`);
    }

    // Create truncated model that outputs features instead of classifications
    const featureLayer = fullMobilenet.getLayer(featureLayerName);
    const truncatedModel = tf.model({
      inputs: fullMobilenet.inputs,
      outputs: featureLayer.output,
      name: 'mobilenet_features',
    });

    // Freeze all layers - we only train the classification head
    truncatedModel.trainable = false;
    for (const layer of truncatedModel.layers) {
      layer.trainable = false;
    }

    logger.info(
      `Truncated MobileNet created. Output shape: ${JSON.stringify(
        truncatedModel.outputs[0].shape
      )}`
    );

    return truncatedModel;
  } catch (error) {
    logger.error('Failed to load MobileNet:', error);
    throw new Error(
      `Failed to load MobileNet base model: ${
        error instanceof Error ? error.message : 'Unknown error'
      }`
    );
  }
}

// =============================================================================
// Combined Model Creation
// =============================================================================

/**
 * Create a combined model: MobileNet (frozen) + Classification Head (trainable).
 *
 * Architecture:
 * 1. Input: Raw images [batch, 224, 224, 3]
 * 2. MobileNet: Feature extraction (frozen) → [batch, features] or [batch, h, w, c]
 * 3. Flatten (if needed): Flatten spatial dimensions
 * 4. Dropout: Regularization for small datasets
 * 5. Dense + Softmax: Classification → [batch, numClasses]
 *
 * This architecture is compatible with Teachable Machine models.
 *
 * @param mobilenet - Pre-loaded MobileNet model
 * @param numClasses - Number of product classes to classify
 * @returns Compiled model ready for training
 */
export function createCombinedModel(mobilenet: tf.LayersModel, numClasses: number): tf.LayersModel {
  logger.info(`Creating combined model for ${numClasses} classes...`);

  // Get the output shape from MobileNet
  const mobilenetOutputShape = mobilenet.outputs[0].shape;
  logger.info(`MobileNet output shape: ${JSON.stringify(mobilenetOutputShape)}`);

  // Create the classification head
  // Input matches MobileNet output (excluding batch dimension)
  const inputShape = mobilenetOutputShape.slice(1) as number[];
  const outputDims = inputShape.length;

  logger.info(`Classification head input shape: ${JSON.stringify(inputShape)} (${outputDims}D)`);

  // Build classification head layers based on MobileNet output shape
  const layers: tf.layers.Layer[] = [];

  // Only add Flatten if MobileNet outputs spatial features (4D: [batch, h, w, c])
  // MobileNet V1 0.25 outputs 2D: [batch, 256] - no flatten needed
  // Other MobileNets may output 4D: [batch, 7, 7, 1024] - needs flatten
  if (outputDims > 1) {
    // 3D or 4D output - needs flattening
    layers.push(tf.layers.flatten({ inputShape }));
    logger.info('Added Flatten layer for spatial features');
  } else {
    // 1D output (already flattened feature vector)
    // Need to specify inputShape for the first layer
    layers.push(tf.layers.dropout({ rate: DROPOUT_RATE, inputShape }));
    layers.push(
      tf.layers.dense({
        units: numClasses,
        activation: 'softmax',
        kernelInitializer: 'glorotUniform',
        name: 'predictions',
      })
    );

    const classificationHead = tf.sequential({
      name: 'classification_head',
      layers,
    });

    // Create the combined model: Input → MobileNet → Classification Head
    const input = tf.input({ shape: [IMAGE_SIZE, IMAGE_SIZE, 3], name: 'input_image' });
    const features = mobilenet.apply(input) as tf.SymbolicTensor;
    const predictions = classificationHead.apply(features) as tf.SymbolicTensor;

    const model = tf.model({
      inputs: input,
      outputs: predictions,
      name: 'product_classifier',
    });

    model.compile({
      optimizer: tf.train.adam(LEARNING_RATE),
      loss: 'categoricalCrossentropy',
      metrics: ['accuracy'],
    });

    logModelSummary(model, numClasses);
    return model;
  }

  // For spatial outputs, add dropout and dense after flatten
  layers.push(tf.layers.dropout({ rate: DROPOUT_RATE }));
  layers.push(
    tf.layers.dense({
      units: numClasses,
      activation: 'softmax',
      kernelInitializer: 'glorotUniform',
      name: 'predictions',
    })
  );

  const classificationHead = tf.sequential({
    name: 'classification_head',
    layers,
  });

  // Create the combined model: Input → MobileNet → Classification Head
  const input = tf.input({ shape: [IMAGE_SIZE, IMAGE_SIZE, 3], name: 'input_image' });
  const features = mobilenet.apply(input) as tf.SymbolicTensor;
  const predictions = classificationHead.apply(features) as tf.SymbolicTensor;

  const model = tf.model({
    inputs: input,
    outputs: predictions,
    name: 'product_classifier',
  });

  model.compile({
    optimizer: tf.train.adam(LEARNING_RATE),
    loss: 'categoricalCrossentropy',
    metrics: ['accuracy'],
  });

  logModelSummary(model, numClasses);
  return model;
}

/**
 * Log model summary with parameter counts.
 */
function logModelSummary(model: tf.LayersModel, numClasses: number): void {
  logger.info('Combined model created:');
  logger.info(`  Input shape: [batch, ${IMAGE_SIZE}, ${IMAGE_SIZE}, 3]`);
  logger.info(`  Output shape: [batch, ${numClasses}]`);
  logger.info(`  Trainable parameters: ${model.trainableWeights.length > 0 ? 'Yes' : 'No'}`);

  let totalParams = 0;
  let trainableParams = 0;
  model.weights.forEach(w => {
    const params = w.shape.reduce((a, b) => (a ?? 1) * (b ?? 1), 1);
    totalParams += params ?? 0;
    if (w.trainable) trainableParams += params ?? 0;
  });
  logger.info(`  Total parameters: ${totalParams.toLocaleString()}`);
  logger.info(`  Trainable parameters: ${trainableParams.toLocaleString()}`);
}

// =============================================================================
// Image Processing
// =============================================================================

/**
 * Load and preprocess a single image from disk.
 *
 * @param imagePath - Path to the image file
 * @returns Preprocessed image tensor [1, 224, 224, 3] normalized to [0, 1]
 */
async function loadImage(imagePath: string): Promise<tf.Tensor4D> {
  // Read image file
  const imageBuffer = fs.readFileSync(imagePath);

  // Decode image (supports JPEG, PNG, GIF, BMP)
  let imageTensor = tf.node.decodeImage(imageBuffer, 3) as tf.Tensor3D;

  // Resize to MobileNet input size
  imageTensor = tf.image.resizeBilinear(imageTensor, [IMAGE_SIZE, IMAGE_SIZE]);

  // Normalize to [0, 1] range
  const normalized = imageTensor.div(255.0) as tf.Tensor3D;

  // Add batch dimension
  const batched = normalized.expandDims(0) as tf.Tensor4D;

  // Cleanup intermediate tensors
  imageTensor.dispose();

  return batched;
}

/**
 * Process dataset items (image paths + labels) into tensors for training.
 *
 * @param dataset - Array of {path, labelIndex} items
 * @param numClasses - Total number of classes for one-hot encoding
 * @param applyAugmentation - Whether to apply augmentation (not used here, done in trainer)
 * @returns Object with xs (images) and ys (labels) tensors
 */
export async function processImagesToTensors(
  dataset: DatasetItem[],
  numClasses: number,
  applyAugmentation: boolean = false
): Promise<{ xs: tf.Tensor4D; ys: tf.Tensor2D }> {
  logger.info(`Processing ${dataset.length} images to tensors...`);

  const imageTensors: tf.Tensor4D[] = [];
  const labels: number[] = [];
  let failedCount = 0;

  for (let i = 0; i < dataset.length; i++) {
    const item = dataset[i];

    try {
      const imageTensor = await loadImage(item.path);
      imageTensors.push(imageTensor);
      labels.push(item.labelIndex);

      // Log progress every 10 images
      if ((i + 1) % 10 === 0 || i === dataset.length - 1) {
        logger.info(`  Processed ${i + 1}/${dataset.length} images`);
      }
    } catch (error) {
      failedCount++;
      logger.warn(
        `Failed to load image ${item.path}: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`
      );
    }
  }

  if (imageTensors.length === 0) {
    throw new Error('No images could be loaded from the dataset');
  }

  if (failedCount > 0) {
    logger.warn(`${failedCount} images failed to load and were skipped`);
  }

  // Concatenate all image tensors into a single batch
  const xs = tf.concat(imageTensors, 0) as tf.Tensor4D;

  // Create one-hot encoded labels
  const ys = tf.oneHot(tf.tensor1d(labels, 'int32'), numClasses) as tf.Tensor2D;

  // Cleanup individual tensors
  imageTensors.forEach(t => t.dispose());

  logger.info(
    `Tensors created: xs shape ${JSON.stringify(xs.shape)}, ys shape ${JSON.stringify(ys.shape)}`
  );

  return { xs, ys };
}

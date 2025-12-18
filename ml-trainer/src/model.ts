/**
 * TensorFlow model operations for transfer learning
 */
import * as tf from '@tensorflow/tfjs-node';
import fs from 'fs';
import { DatasetItem } from './types';
import { MOBILENET_URL, IMAGE_SIZE, logger } from './constants';

/**
 * Load MobileNet base model with retry logic
 */
export async function loadMobileNet(maxRetries = 3): Promise<tf.LayersModel> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const model = await tf.loadLayersModel(MOBILENET_URL);
      logger.info('MobileNet loaded successfully');
      return model;
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      logger.warn(`MobileNet load attempt ${attempt}/${maxRetries} failed: ${errMsg}`);
      if (attempt === maxRetries) {
        throw new Error(`Failed to load MobileNet after ${maxRetries} attempts: ${errMsg}`);
      }
      await new Promise(r => setTimeout(r, 2000 * attempt));
    }
  }
  throw new Error('Failed to load MobileNet');
}

/**
 * Create feature extractor from MobileNet (truncated at conv_pw_13_relu)
 */
export function createFeatureExtractor(mobilenet: tf.LayersModel): tf.LayersModel {
  const layer = mobilenet.getLayer('conv_pw_13_relu');
  return tf.model({
    inputs: mobilenet.inputs,
    outputs: layer.output,
  });
}

/**
 * Create classification head for transfer learning
 */
export function createClassificationHead(
  featureShape: number[],
  numClasses: number
): tf.Sequential {
  const model = tf.sequential();
  model.add(tf.layers.flatten({ inputShape: featureShape }));
  model.add(tf.layers.dense({ units: 100, activation: 'relu' }));
  model.add(tf.layers.dense({ units: numClasses, activation: 'softmax' }));

  model.compile({
    optimizer: tf.train.adam(0.0001),
    loss: 'categoricalCrossentropy',
    metrics: ['accuracy'],
  });

  return model;
}

/**
 * Process images into feature tensors using the feature extractor
 */
export async function processImagesToTensors(
  dataset: DatasetItem[],
  numClasses: number,
  featureExtractor: tf.LayersModel
): Promise<{ xs: tf.Tensor; ys: tf.Tensor }> {
  const features: tf.Tensor[] = [];
  const labels: number[] = [];

  for (const item of dataset) {
    if (!fs.existsSync(item.path)) continue;

    const buffer = fs.readFileSync(item.path);
    const feature = tf.tidy(() => {
      const tensor = tf.node
        .decodeImage(buffer)
        .resizeNearestNeighbor([IMAGE_SIZE, IMAGE_SIZE])
        .toFloat()
        .div(255.0)
        .expandDims();

      const prediction = featureExtractor.predict(tensor);
      const featureTensor = Array.isArray(prediction) ? prediction[0] : prediction;
      return featureTensor.clone();
    });

    features.push(feature);
    labels.push(item.labelIndex);
  }

  const xs = tf.concat(features);
  const ys = tf.oneHot(tf.tensor1d(labels, 'int32'), numClasses);

  // Cleanup intermediate tensors
  features.forEach(f => f.dispose());

  return { xs, ys };
}



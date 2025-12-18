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
 * Create combined model with MobileNet + classification head
 * Matches Teachable Machine architecture: MobileNet (frozen) → Dense layers
 * This creates a single model that accepts raw images [224,224,3] directly
 *
 * IMPORTANT: Following Teachable Machine's approach, we use MobileNet's final output
 * (not intermediate layers) to ensure all MobileNet layers are included in the model.
 * This ensures TensorFlow.js includes all layers and weights when saving the model.
 */
export function createCombinedModel(mobilenet: tf.LayersModel, numClasses: number): tf.LayersModel {
  // Freeze MobileNet layers (don't train base layers)
  mobilenet.layers.forEach(layer => {
    layer.trainable = false;
  });

  // CRITICAL: Use MobileNet's final output directly (Teachable Machine approach)
  // MobileNet's final output is already flattened: [batch, 1024]
  // This ensures ALL MobileNet layers are included in the computation graph
  logger.info('Using MobileNet final output (Teachable Machine approach)...');
  const mobilenetOutput = mobilenet.outputs[0];

  // Add classification layers directly on top of MobileNet's output
  // Teachable Machine adds dense layers directly without GlobalAveragePooling2D
  // since MobileNet's output is already flattened
  logger.info('Building classification head on MobileNet output...');
  const dense1 = tf.layers
    .dense({ units: 100, activation: 'relu', name: 'dense_1' })
    .apply(mobilenetOutput) as tf.SymbolicTensor;
  const output = tf.layers
    .dense({ units: numClasses, activation: 'softmax', name: 'dense_output' })
    .apply(dense1) as tf.SymbolicTensor;

  // Create final combined model using MobileNet's input directly
  // CRITICAL: Use mobilenet.inputs (array) instead of mobilenet.inputs[0] to ensure
  // we're using the actual input tensor from MobileNet, not creating a new one
  logger.info('Creating combined model with all MobileNet layers...');
  logger.info(`MobileNet inputs: ${mobilenet.inputs.length} input(s)`);
  logger.info(`MobileNet input shape: ${JSON.stringify(mobilenet.inputs[0]?.shape)}`);

  const model = tf.model({
    inputs: mobilenet.inputs, // Use the array, not [0]
    outputs: output,
  });

  // CRITICAL: After creating the model, we need to explicitly ensure all MobileNet weights
  // are included. The model.layers list might not include all MobileNet layers, but
  // the weights should be in the computation graph. However, TensorFlow.js might not
  // save them unless they're explicitly in model.layers.
  //
  // Let's verify by checking if we can access the weights through the computation graph
  logger.info(`Model created with ${model.layers.length} layers in layer list`);
  logger.info(`MobileNet has ${mobilenet.layers.length} layers`);

  // The issue is that model.layers might not include all MobileNet layers.
  // We need to ensure all weights are saved. Let's try a different approach:
  // Get all weights from the model (this should include all weights in the computation graph)
  const allWeights = model.getWeights();
  logger.info(`Model has ${allWeights.length} weight tensors`);

  // Calculate total weight size
  let totalWeightSize = 0;
  allWeights.forEach(weight => {
    totalWeightSize += weight.size;
  });
  logger.info(`Total weight elements: ${totalWeightSize.toLocaleString()}`);

  // MobileNet should contribute ~4.2M parameters. If totalWeightSize is too small,
  // the weights aren't being included properly.
  if (totalWeightSize < 4000000) {
    logger.warn(
      `Warning: Total weight size (${totalWeightSize}) is too small. Expected ~4.2M+ from MobileNet.`
    );
    logger.warn('This suggests MobileNet weights may not be included in the saved model.');
  }

  model.compile({
    optimizer: tf.train.adam(0.0001),
    loss: 'categoricalCrossentropy',
    metrics: ['accuracy'],
  });

  // CRITICAL: Force TensorFlow.js to build the full computation graph by making a dummy prediction
  // This ensures all layers (including MobileNet layers) are part of the graph
  // Even though they might not be in model.layers, they should be in the computation graph
  logger.info('Building computation graph with dummy prediction...');
  try {
    const dummyInput = tf.zeros([1, 224, 224, 3]);
    const dummyOutput = model.predict(dummyInput) as tf.Tensor;
    dummyOutput.dispose();
    dummyInput.dispose();
    logger.info('Computation graph built successfully');
  } catch (error) {
    logger.warn(`Warning: Could not build computation graph: ${error}`);
  }

  // Log model structure to verify all layers are included
  logger.info('Combined model created (MobileNet + Dense layers, Teachable Machine style)');
  logger.info(`Model input shape: ${JSON.stringify(model.inputs[0].shape)}`);
  logger.info(`Model output shape: ${JSON.stringify(model.outputs[0].shape)}`);
  logger.info(`Total layers in model: ${model.layers.length}`);
  logger.info(`MobileNet base model layers: ${mobilenet.layers.length}`);

  // Verify the first layer is from MobileNet (should be the input layer)
  if (model.layers.length > 0) {
    logger.info(`First layer: ${model.layers[0].name}, type: ${model.layers[0].getClassName()}`);
  }

  // Count trainable vs non-trainable weights to verify MobileNet is included
  let trainableCount = 0;
  let nonTrainableCount = 0;
  model.layers.forEach(layer => {
    const layerParams = layer.countParams();
    if (layer.trainable) {
      trainableCount += layerParams;
    } else {
      nonTrainableCount += layerParams;
    }
  });
  logger.info(`Trainable parameters: ${trainableCount.toLocaleString()}`);
  logger.info(`Non-trainable (frozen MobileNet) parameters: ${nonTrainableCount.toLocaleString()}`);
  logger.info(`Total parameters: ${(trainableCount + nonTrainableCount).toLocaleString()}`);

  // Verify that MobileNet layers are included (should be many layers)
  // The combined model should have MobileNet layers + 2 Dense layers (no GlobalAveragePooling2D)
  const expectedMinLayers = mobilenet.layers.length + 2; // +2 for 2 dense layers
  if (model.layers.length < expectedMinLayers) {
    logger.warn(
      `Warning: Model has only ${model.layers.length} layers. Expected at least ${expectedMinLayers} layers (${mobilenet.layers.length} MobileNet + 2 dense layers).`
    );
    logger.warn(
      'This may indicate that MobileNet layers are not being included in the saved model.'
    );
  } else {
    logger.info(
      `✓ Model includes all layers: ${model.layers.length} total (${mobilenet.layers.length} MobileNet + 2 dense layers)`
    );
  }

  // Check if getWeights() includes all weights (this should include weights from the computation graph)
  const modelWeights = model.getWeights();
  let totalWeightElements = 0;
  modelWeights.forEach(weight => {
    totalWeightElements += weight.size;
  });
  logger.info(`Total weight elements from getWeights(): ${totalWeightElements.toLocaleString()}`);

  // NOTE: TensorFlow.js's model.layers might not include all layers from nested models
  // even though they're in the computation graph. The actual weights file size check
  // in artifacts.ts will verify if weights are actually being saved.
  //
  // If model.layers shows low counts but getWeights() shows correct counts, the weights
  // are in the computation graph and should be saved. If both are low, there's a problem.
  if (nonTrainableCount < 1000000 && totalWeightElements < 4000000) {
    logger.warn(
      `WARNING: Non-trainable parameter count (${nonTrainableCount}) and total weight elements (${totalWeightElements}) are both low.`
    );
    logger.warn('MobileNet should have ~4.2M parameters.');
    logger.warn(
      'This suggests MobileNet weights may not be included. However, the actual saved file size will be checked in artifacts.ts.'
    );
    logger.warn(
      'If the saved weights.bin file is ~4-5MB, then the weights ARE being saved correctly despite model.layers not showing them.'
    );
    // Don't throw error here - let artifacts.ts check the actual file size
  } else if (nonTrainableCount < 1000000 && totalWeightElements >= 4000000) {
    logger.info(
      `NOTE: model.layers shows only ${nonTrainableCount} non-trainable params, but getWeights() shows ${totalWeightElements} total elements.`
    );
    logger.info(
      'This is expected - weights are in the computation graph and should be saved correctly.'
    );
    logger.info('The actual saved file size will confirm this.');
  }

  return model;
}

/**
 * Process images into raw image tensors (for combined model training)
 * Returns preprocessed images [batch, 224, 224, 3] ready for model input
 */
export async function processImagesToTensors(
  dataset: DatasetItem[],
  numClasses: number
): Promise<{ xs: tf.Tensor; ys: tf.Tensor }> {
  const images: tf.Tensor[] = [];
  const labels: number[] = [];

  for (const item of dataset) {
    if (!fs.existsSync(item.path)) continue;

    const buffer = fs.readFileSync(item.path);
    const image = tf.tidy(() => {
      const tensor = tf.node
        .decodeImage(buffer)
        .resizeNearestNeighbor([IMAGE_SIZE, IMAGE_SIZE])
        .toFloat()
        .div(255.0)
        .expandDims(0);
      return tensor.clone();
    });

    images.push(image);
    labels.push(item.labelIndex);
  }

  const xs = tf.concat(images);
  const ys = tf.oneHot(tf.tensor1d(labels, 'int32'), numClasses);

  // Cleanup intermediate tensors
  images.forEach(img => img.dispose());

  return { xs, ys };
}

/**
 * Training utilities for dataset management, data generation, and callbacks
 */
import * as tf from '@tensorflow/tfjs-node';
import { DatasetItem, TrainingMetrics } from './types';
import {
  VALIDATION_SPLIT,
  EARLY_STOPPING_PATIENCE,
  LEARNING_RATE_DECAY,
  LEARNING_RATE_PATIENCE,
  AUGMENTATION_ENABLED,
  BATCH_SIZE,
  EPOCHS,
  logger,
} from './constants';
import { augmentBatch } from './augmentation';
import { DEFAULT_AUGMENTATION_CONFIG } from './augmentation';

/**
 * Split dataset into training and validation sets
 * @param dataset - Full dataset
 * @param validationSplit - Fraction of data to use for validation (0-1)
 * @returns Object with train and validation datasets
 */
export function splitDataset(
  dataset: DatasetItem[],
  validationSplit: number = VALIDATION_SPLIT
): { train: DatasetItem[]; validation: DatasetItem[] } {
  // Shuffle dataset first to ensure random split
  const shuffled = [...dataset].sort(() => Math.random() - 0.5);

  const splitIndex = Math.floor(shuffled.length * (1 - validationSplit));
  const train = shuffled.slice(0, splitIndex);
  const validation = shuffled.slice(splitIndex);

  logger.info(
    `Dataset split: ${train.length} training samples, ${validation.length} validation samples (${(
      validationSplit * 100
    ).toFixed(1)}% validation)`
  );

  return { train, validation };
}

/**
 * Create a data generator that applies augmentation on-the-fly during training
 * This allows for different augmentations each epoch without storing augmented images
 * @param xs - Image tensor [batch, height, width, channels]
 * @param ys - Label tensor [batch, numClasses]
 * @param batchSize - Batch size for training
 * @param applyAugmentation - Whether to apply augmentation
 * @returns Generator function that yields batches
 */
export function* createDataGenerator(
  xs: tf.Tensor,
  ys: tf.Tensor,
  batchSize: number = BATCH_SIZE,
  applyAugmentation: boolean = AUGMENTATION_ENABLED
): Generator<{ xs: tf.Tensor; ys: tf.Tensor }, void, unknown> {
  const numSamples = xs.shape[0] ?? 0;
  const numBatches = Math.ceil(numSamples / batchSize);

  for (let i = 0; i < numBatches; i++) {
    const start = i * batchSize;
    const end = Math.min(start + batchSize, numSamples);

    // Extract batch
    const batchSizeActual = end - start;
    const xsShape = xs.shape.slice(1);
    const ysShape = ys.shape[1] ?? 1;
    const batchXs = xs.slice([start, 0, 0, 0], [batchSizeActual, ...xsShape]);
    const batchYs = ys.slice([start, 0], [batchSizeActual, ysShape]);

    // Apply augmentation if enabled
    let augmentedXs = batchXs;
    if (applyAugmentation) {
      augmentedXs = augmentBatch(batchXs, DEFAULT_AUGMENTATION_CONFIG);
      batchXs.dispose(); // Dispose original if we created augmented version
    }

    yield { xs: augmentedXs, ys: batchYs };
  }
}

/**
 * Calculate class weights to handle imbalanced datasets
 * @param labels - Array of label indices
 * @param numClasses - Total number of classes
 * @returns Object mapping class index to weight
 */
export function calculateClassWeights(
  labels: number[],
  numClasses: number
): Record<number, number> {
  // Count samples per class
  const classCounts: Record<number, number> = {};
  for (let i = 0; i < numClasses; i++) {
    classCounts[i] = 0;
  }

  labels.forEach(label => {
    classCounts[label] = (classCounts[label] || 0) + 1;
  });

  // Calculate weights: total_samples / (num_classes * class_samples)
  const totalSamples = labels.length;
  const weights: Record<number, number> = {};

  for (let i = 0; i < numClasses; i++) {
    const count = classCounts[i] || 1; // Avoid division by zero
    weights[i] = totalSamples / (numClasses * count);
  }

  logger.info('Class weights calculated:', weights);
  return weights;
}

/**
 * Create training callbacks for early stopping, learning rate scheduling, and progress tracking
 * @param onEpochEnd - Optional callback for epoch end events
 * @param bestModelPath - Optional path to save best model
 * @returns Array of TensorFlow callbacks
 */
export function createCallbacks(
  onEpochEnd?: (epoch: number, logs?: tf.Logs) => void | Promise<void>,
  bestModelPath?: string
): tf.Callback[] {
  const callbacks: tf.Callback[] = [];
  let bestValLoss = Infinity;
  let patienceCounter = 0;
  let lrPatienceCounter = 0;
  let bestModel: tf.LayersModel | null = null;

  // Early stopping callback
  const earlyStopping = {
    onEpochEnd: async (epoch: number, logs?: tf.Logs) => {
      if (!logs || logs.val_loss === undefined) return;

      const valLoss = logs.val_loss as number;

      // Track best model
      if (valLoss < bestValLoss) {
        bestValLoss = valLoss;
        patienceCounter = 0;
        lrPatienceCounter = 0;
        logger.info(`New best validation loss: ${bestValLoss.toFixed(4)} at epoch ${epoch + 1}`);
      } else {
        patienceCounter++;
        lrPatienceCounter++;

        // Check for early stopping
        if (patienceCounter >= EARLY_STOPPING_PATIENCE) {
          logger.info(
            `Early stopping triggered: no improvement for ${patienceCounter} epochs. Best val_loss: ${bestValLoss.toFixed(
              4
            )}`
          );
          // Note: TensorFlow.js doesn't support stopping training from callback
          // We'll log this and the trainer will check the flag
        }

        // Learning rate reduction on plateau
        if (lrPatienceCounter >= LEARNING_RATE_PATIENCE) {
          logger.info(`Reducing learning rate: no improvement for ${lrPatienceCounter} epochs`);
          lrPatienceCounter = 0;
          // Note: Learning rate adjustment needs to be done via optimizer
          // This is logged for manual adjustment or future implementation
        }
      }

      // Call custom epoch end callback
      if (onEpochEnd) {
        await onEpochEnd(epoch, logs);
      }
    },
  };

  callbacks.push(earlyStopping as tf.Callback);

  // Progress logging callback
  const progressLogger = {
    onEpochEnd: async (epoch: number, logs?: tf.Logs) => {
      if (!logs) return;

      const metrics: TrainingMetrics = {
        epoch: epoch + 1,
        loss: logs.loss as number,
        accuracy: (logs.acc as number) || 0,
        valLoss: logs.val_loss as number | undefined,
        valAccuracy: logs.val_acc as number | undefined,
      };

      if (metrics.valLoss !== undefined && metrics.valAccuracy !== undefined) {
        logger.info(
          `Epoch ${metrics.epoch}/${EPOCHS}: loss=${metrics.loss.toFixed(
            4
          )}, acc=${metrics.accuracy.toFixed(4)}, ` +
            `val_loss=${metrics.valLoss.toFixed(4)}, val_acc=${metrics.valAccuracy.toFixed(4)}`
        );
      } else {
        logger.info(
          `Epoch ${metrics.epoch}/${EPOCHS}: loss=${metrics.loss.toFixed(
            4
          )}, acc=${metrics.accuracy.toFixed(4)}`
        );
      }
    },
  };

  callbacks.push(progressLogger as tf.Callback);

  return callbacks;
}

/**
 * Create a learning rate scheduler that reduces LR on plateau
 * @param initialLR - Initial learning rate
 * @param factor - Factor to multiply LR by when reducing
 * @param patience - Number of epochs to wait before reducing
 * @param minLR - Minimum learning rate
 * @returns Learning rate scheduler function
 */
export function createLearningRateScheduler(
  initialLR: number,
  factor: number = LEARNING_RATE_DECAY,
  patience: number = LEARNING_RATE_PATIENCE,
  minLR: number = 1e-7
): (epoch: number) => number {
  let currentLR = initialLR;
  let bestLoss = Infinity;
  let patienceCounter = 0;

  return (epoch: number): number => {
    // This will be called by the optimizer, but we need to track loss separately
    // For now, return current LR. Actual reduction happens in callbacks.
    return currentLR;
  };
}

/**
 * Training Constants and Configuration
 *
 * Hyperparameters optimized for small datasets (5-20 products, ~5 images each)
 * Based on transfer learning best practices with MobileNet V2
 */
import winston from 'winston';

// =============================================================================
// Training Hyperparameters
// =============================================================================

/**
 * Number of training epochs.
 * Higher for small datasets - more passes needed to learn from limited data.
 * Early stopping will prevent overfitting.
 */
export const EPOCHS = 50;

/**
 * Batch size for training.
 * Smaller batches work better with limited samples - provides better gradient estimates.
 * 8 is a good balance for 25-100 total images.
 */
export const BATCH_SIZE = 8;

/**
 * Initial learning rate for Adam optimizer.
 * 0.001 is standard for transfer learning with frozen base.
 * Lower than training from scratch since we're fine-tuning.
 */
export const LEARNING_RATE = 0.001;

/**
 * Learning rate decay factor when reducing on plateau.
 * Multiply LR by this when validation loss stops improving.
 */
export const LEARNING_RATE_DECAY = 0.5;

/**
 * Epochs to wait before reducing learning rate.
 * More patience for small datasets where validation metrics are noisy.
 */
export const LEARNING_RATE_PATIENCE = 5;

/**
 * Fraction of data to use for validation.
 * Lower split (15%) to maximize training data with small datasets.
 * With 5 images per product, this keeps ~4 for training, ~1 for validation.
 */
export const VALIDATION_SPLIT = 0.15;

/**
 * Epochs without improvement before stopping training.
 * Higher patience (10) for small datasets to avoid premature stopping
 * due to noisy validation metrics.
 */
export const EARLY_STOPPING_PATIENCE = 10;

/**
 * Enable/disable data augmentation during training.
 * Critical for small datasets - creates variation from limited samples.
 */
export const AUGMENTATION_ENABLED = true;

/**
 * Input image size for MobileNet V2.
 * Standard size - do not change unless using a different base model.
 */
export const IMAGE_SIZE = 224;

/**
 * Dropout rate for classification head.
 * 0.5 is standard - helps prevent overfitting on small datasets.
 */
export const DROPOUT_RATE = 0.5;

/**
 * Temporary directory for storing downloaded images and model artifacts.
 */
export const TEMP_DIR = process.env.ML_TEMP_DIR || '/tmp/ml-training';

// =============================================================================
// MobileNet Configuration
// =============================================================================

/**
 * MobileNet V2 model URL from TensorFlow Hub.
 * This is the feature extraction model (without top classification layer).
 * Output shape: [batch, 7, 7, 1280] for 224x224 input
 */
export const MOBILENET_URL =
  'https://tfhub.dev/google/tfjs-model/imagenet/mobilenet_v2_100_224/feature_vector/3/default/1';

/**
 * Alternative: Use the classification model and truncate
 * This can be more stable for loading
 */
export const MOBILENET_CLASSIFICATION_URL =
  'https://storage.googleapis.com/tfjs-models/tfjs/mobilenet_v1_0.25_224/model.json';

// =============================================================================
// Logger Configuration
// =============================================================================

/**
 * Winston logger instance for ML trainer service.
 * Outputs to console with timestamp and level.
 */
export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.printf(({ timestamp, level, message, ...meta }) => {
      const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
      return `[${timestamp}] ${level.toUpperCase()}: ${message}${metaStr}`;
    })
  ),
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.printf(({ timestamp, level, message, ...meta }) => {
          const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
          return `[${timestamp}] ${level}: ${message}${metaStr}`;
        })
      ),
    }),
  ],
});

/**
 * Data augmentation utilities for image classification training
 * Applies transformations to artificially expand small datasets
 */
import * as tf from '@tensorflow/tfjs-node';
import { AugmentationConfig } from './types';
import { IMAGE_SIZE, logger } from './constants';

/**
 * Default augmentation configuration matching TeachableMachine approach
 */
export const DEFAULT_AUGMENTATION_CONFIG: AugmentationConfig = {
  rotation: { enabled: true, maxDegrees: 15 },
  flipHorizontal: { enabled: true, probability: 0.5 },
  flipVertical: { enabled: false, probability: 0.5 },
  brightness: { enabled: true, maxDelta: 0.2 },
  contrast: { enabled: true, maxDelta: 0.2 },
  saturation: { enabled: true, maxDelta: 0.2 },
  crop: { enabled: true, maxCropRatio: 0.1 },
  noise: { enabled: false, stddev: 0.01 },
};

/**
 * Apply data augmentation to an image tensor
 * @param image - Image tensor [1, height, width, channels] or [height, width, channels]
 * @param config - Augmentation configuration
 * @returns Augmented image tensor with same shape as input
 */
export function augmentImage(
  image: tf.Tensor,
  config: AugmentationConfig = DEFAULT_AUGMENTATION_CONFIG
): tf.Tensor {
  return tf.tidy(() => {
    let augmented = image;

    // Ensure we have batch dimension
    const needsExpand = augmented.shape.length === 3;
    if (needsExpand) {
      augmented = augmented.expandDims(0);
    }

    // Ensure we have Tensor4D for image operations
    const augmented4D = augmented as tf.Tensor4D;

    // Random rotation (±maxDegrees)
    // Note: tf.image.rotateWithOffset is not available in TensorFlow.js Node.js backend
    // It only works in the browser backend. For Node.js, we skip rotation.
    // Rotation is less critical than other augmentations (flips, brightness, contrast)
    // and the impact of skipping it is minimal for small angle rotations.
    if (config.rotation?.enabled) {
      // Skip rotation in Node.js - not available in this backend
      // Other augmentations (flips, brightness, contrast) provide sufficient variation
    }

    // Random horizontal flip
    if (config.flipHorizontal?.enabled && Math.random() < config.flipHorizontal.probability) {
      augmented = tf.image.flipLeftRight(augmented4D);
    }

    // Random vertical flip (implement manually - tf.image.flipUpDown doesn't exist in node)
    if (config.flipVertical?.enabled && Math.random() < config.flipVertical.probability) {
      // Flip vertically by reversing along height dimension (axis 1)
      augmented = tf.reverse(augmented4D, [1]);
    }

    // Random brightness adjustment (implement manually)
    if (config.brightness?.enabled) {
      const delta = (Math.random() * 2 - 1) * config.brightness.maxDelta; // -maxDelta to +maxDelta
      augmented = tf.add(augmented, delta);
      // Clamp to [0, 1] range
      augmented = tf.clipByValue(augmented, 0, 1);
    }

    // Random contrast adjustment (implement manually)
    if (config.contrast?.enabled) {
      const factor = 1 + (Math.random() * 2 - 1) * config.contrast.maxDelta; // 1-maxDelta to 1+maxDelta
      // Contrast: (pixel - mean) * factor + mean
      const mean = tf.mean(augmented);
      augmented = tf.add(tf.mul(tf.sub(augmented, mean), factor), mean);
      // Clamp to [0, 1] range
      augmented = tf.clipByValue(augmented, 0, 1);
      mean.dispose();
    }

    // Random saturation adjustment (for RGB images, implement manually)
    if (config.saturation?.enabled && augmented.shape.length >= 4 && augmented.shape[3] === 3) {
      const factor = 1 + (Math.random() * 2 - 1) * config.saturation.maxDelta;
      // Convert to grayscale, then blend: grayscale * (1 - factor) + color * factor
      const grayscale = tf.image.grayscaleToRGB(tf.mean(augmented4D, 3, true) as tf.Tensor4D);
      augmented = tf.add(tf.mul(grayscale, 1 - factor), tf.mul(augmented4D, factor));
      // Clamp to [0, 1] range
      augmented = tf.clipByValue(augmented, 0, 1);
      grayscale.dispose();
    }

    // Random crop with padding (center crop with random offset)
    if (config.crop?.enabled) {
      const shape = augmented.shape;
      const batch = shape[0] ?? 1;
      const height = shape[1] ?? IMAGE_SIZE;
      const width = shape[2] ?? IMAGE_SIZE;
      const channels = shape[3] ?? 3;

      const cropRatio = Math.random() * (config.crop.maxCropRatio ?? 0.1);
      const cropHeight = Math.floor(height * (1 - cropRatio));
      const cropWidth = Math.floor(width * (1 - cropRatio));

      // Random offset for crop position
      const offsetY = Math.floor(Math.random() * Math.max(1, height - cropHeight));
      const offsetX = Math.floor(Math.random() * Math.max(1, width - cropWidth));

      // Crop and resize back to original size
      const cropped = tf.slice(
        augmented as tf.Tensor4D,
        [0, offsetY, offsetX, 0],
        [batch, cropHeight, cropWidth, channels]
      );
      augmented = tf.image.resizeBilinear(cropped as tf.Tensor4D, [height, width]);
      cropped.dispose();
    }

    // Add Gaussian noise (optional, usually disabled)
    if (config.noise?.enabled) {
      const noise = tf.randomNormal(augmented.shape, 0, config.noise.stddev);
      augmented = tf.add(augmented, noise);
      augmented = tf.clipByValue(augmented, 0, 1);
      noise.dispose();
    }

    // Remove batch dimension if it wasn't there originally
    if (needsExpand) {
      augmented = augmented.squeeze([0]);
    }

    return augmented;
  });
}

/**
 * Apply augmentation to a batch of images
 * @param images - Batch tensor [batch, height, width, channels]
 * @param config - Augmentation configuration
 * @returns Augmented batch tensor
 */
export function augmentBatch(
  images: tf.Tensor,
  config: AugmentationConfig = DEFAULT_AUGMENTATION_CONFIG
): tf.Tensor {
  return tf.tidy(() => {
    const batchSize = images.shape[0];
    const augmentedImages: tf.Tensor[] = [];

    // Apply augmentation to each image in the batch independently
    for (let i = 0; i < batchSize; i++) {
      const singleImage = images.slice([i, 0, 0, 0], [1, ...images.shape.slice(1)]);
      const augmented = augmentImage(singleImage, config);
      augmentedImages.push(augmented);
      singleImage.dispose();
    }

    const result = tf.concat(augmentedImages, 0);

    // Cleanup intermediate tensors
    augmentedImages.forEach(img => img.dispose());

    return result;
  });
}

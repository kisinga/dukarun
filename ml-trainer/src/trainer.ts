/**
 * ML Training Pipeline Orchestrator
 *
 * Coordinates the training workflow:
 * 1. Fetch manifest → 2. Download images → 3. Train model → 4. Upload artifacts
 */
import * as tf from '@tensorflow/tfjs-node';
import fs from 'fs';
import path from 'path';

import { TrainingConfig } from './types';
import {
  TEMP_DIR,
  EPOCHS,
  BATCH_SIZE,
  VALIDATION_SPLIT,
  AUGMENTATION_ENABLED,
  LEARNING_RATE,
  LEARNING_RATE_DECAY,
  EARLY_STOPPING_PATIENCE,
  logger,
} from './constants';
import { loadMobileNet, createCombinedModel, processImagesToTensors } from './model';
import { fetchManifest, sendStatusWebhook, uploadArtifacts } from './api';
import { downloadDataset, saveModelArtifacts, cleanupJobDir } from './artifacts';
import { splitDataset, createCallbacks, calculateClassWeights } from './training-utils';
import { augmentBatch } from './augmentation';
import { DEFAULT_AUGMENTATION_CONFIG } from './augmentation';

/**
 * Main training entry point
 */
export async function startTraining(config: TrainingConfig): Promise<void> {
  const { channelId, manifestUrl, webhookUrl, authToken } = config;
  const jobDir = path.join(TEMP_DIR, channelId);

  try {
    // 1. Signal training started
    await sendStatusWebhook(webhookUrl, channelId, 'started', 0, null, authToken);

    // 2. Fetch training manifest
    logger.info('Fetching training manifest...');
    const manifest = await fetchManifest(manifestUrl, authToken);
    const classes = manifest.products.map(p => p.productId);

    // 3. Download images
    if (!fs.existsSync(jobDir)) fs.mkdirSync(jobDir, { recursive: true });
    const { dataset, totalImages } = await downloadDataset(manifest.products, jobDir);

    // 4. Split dataset into training and validation sets
    logger.info('Splitting dataset into training and validation sets...');
    const { train: trainDataset, validation: valDataset } = splitDataset(dataset, VALIDATION_SPLIT);

    if (trainDataset.length === 0) {
      throw new Error('Training dataset is empty after split');
    }

    // 5. Load base model and create combined model
    logger.info('Loading MobileNet base model...');
    const mobilenet = await loadMobileNet();

    // 6. Create combined model (MobileNet + classification head with dropout)
    // This matches Teachable Machine architecture: accepts raw images [224,224,3]
    logger.info('Creating combined model (MobileNet + Dense layers + Dropout)...');
    const model = createCombinedModel(mobilenet, classes.length);

    // 7. Process images to raw image tensors
    // Training data: augmentation will be applied during training
    // Validation data: without augmentation (for accurate validation metrics)
    logger.info('Processing training images to tensors...');
    const { xs: trainXs, ys: trainYs } = await processImagesToTensors(
      trainDataset,
      classes.length,
      false // Don't apply augmentation here, we'll do it during training
    );

    let valXs: tf.Tensor | null = null;
    let valYs: tf.Tensor | null = null;

    if (valDataset.length > 0) {
      logger.info('Processing validation images to tensors...');
      const valData = await processImagesToTensors(valDataset, classes.length, false);
      valXs = valData.xs;
      valYs = valData.ys;
    }

    // 8. Calculate class weights to handle imbalanced datasets
    // This helps prevent bias toward classes with more samples (e.g., label 4)
    const trainLabels = trainDataset.map(item => item.labelIndex);
    const classWeights = calculateClassWeights(trainLabels, classes.length);

    // Log class distribution
    const classCounts: Record<number, number> = {};
    trainLabels.forEach(label => {
      classCounts[label] = (classCounts[label] || 0) + 1;
    });
    logger.info('Class distribution in training set:');
    Object.entries(classCounts).forEach(([classIdx, count]) => {
      const weight = classWeights[parseInt(classIdx)];
      logger.info(`  Class ${classIdx}: ${count} samples, weight: ${weight.toFixed(3)}`);
    });

    // 9. Train with enhanced features
    logger.info('Starting training with data augmentation, validation, and class weighting...');
    logger.info(
      `Training samples: ${trainDataset.length}, Validation samples: ${valDataset.length}`
    );
    logger.info(`Augmentation enabled: ${AUGMENTATION_ENABLED}`);

    let bestValLoss = Infinity;
    let bestModelWeights: tf.Tensor[] | null = null;
    let epochsWithoutImprovement = 0;
    let shouldStopEarly = false;

    // Create callbacks with progress tracking
    const callbacks = createCallbacks(async (epoch: number, logs?: tf.Logs) => {
      if (!logs) return;

      const progress = Math.round(((epoch + 1) / EPOCHS) * 100);

      // Track best model based on validation loss
      if (logs.val_loss !== undefined) {
        const valLoss = logs.val_loss as number;
        if (valLoss < bestValLoss) {
          bestValLoss = valLoss;
          epochsWithoutImprovement = 0;
          // Save best model weights
          if (bestModelWeights !== null) {
            (bestModelWeights as tf.Tensor[]).forEach(w => w.dispose());
          }
          bestModelWeights = model.getWeights().map(w => w.clone());
          logger.info(`New best validation loss: ${bestValLoss.toFixed(4)} at epoch ${epoch + 1}`);
        } else {
          epochsWithoutImprovement++;
          if (epochsWithoutImprovement >= EARLY_STOPPING_PATIENCE) {
            shouldStopEarly = true;
            logger.info(
              `Early stopping: no improvement for ${epochsWithoutImprovement} epochs. Best val_loss: ${bestValLoss.toFixed(
                4
              )}`
            );
          }
        }
      }

      // Send progress webhook every 5 epochs or on significant milestones
      if (epoch % 5 === 0 || epoch === 0 || epoch === EPOCHS - 1) {
        await sendStatusWebhook(webhookUrl, channelId, 'progress', progress, null, authToken);
      }
    });

    // Train with augmentation applied per epoch
    // Apply augmentation to training data each epoch for variety
    for (let epoch = 0; epoch < EPOCHS && !shouldStopEarly; epoch++) {
      let epochTrainXs = trainXs;

      // Apply augmentation to training data at the start of each epoch
      // This gives different augmentations each epoch
      if (AUGMENTATION_ENABLED) {
        epochTrainXs = augmentBatch(trainXs, DEFAULT_AUGMENTATION_CONFIG) as tf.Tensor4D;
      }

      // Train for one epoch with class weighting
      const history = await model.fit(epochTrainXs, trainYs, {
        epochs: 1,
        batchSize: BATCH_SIZE,
        validationData: valXs && valYs ? [valXs, valYs] : undefined,
        classWeight: classWeights, // Helps balance classes with different sample counts
        callbacks: callbacks.map(cb => ({
          onEpochEnd: async (e: number, l?: tf.Logs) => {
            await cb.onEpochEnd?.(epoch, l);
          },
        })),
        verbose: 0, // Suppress default logging, we have custom callbacks
      });

      // Cleanup augmented data for this epoch
      if (epochTrainXs !== trainXs) {
        epochTrainXs.dispose();
      }

      // Check for early stopping after epoch
      if (shouldStopEarly) {
        logger.info(`Stopping training early at epoch ${epoch + 1}`);
        break;
      }
    }

    // Restore best model weights
    if (bestModelWeights !== null) {
      logger.info('Restoring best model weights based on validation loss');
      model.setWeights(bestModelWeights);
      (bestModelWeights as tf.Tensor[]).forEach(w => w.dispose());
    }

    // Cleanup tensors
    trainXs.dispose();
    trainYs.dispose();
    if (valXs) valXs.dispose();
    if (valYs) valYs.dispose();

    // 8. Save model artifacts
    logger.info('Saving model artifacts...');
    const artifactsDir = path.join(jobDir, 'artifacts');
    const { fileNames } = await saveModelArtifacts(
      model,
      channelId,
      artifactsDir,
      classes,
      manifest.products.length,
      totalImages
    );

    // 9. Upload to backend
    logger.info('Uploading artifacts to backend...');
    await uploadArtifacts(webhookUrl, channelId, artifactsDir, fileNames, authToken);

    logger.info('Training completed successfully');
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error(`Training failed: ${errorMessage}`, error);

    // Send error webhook
    try {
      await sendStatusWebhook(webhookUrl, channelId, 'error', 0, errorMessage, authToken);
    } catch (webhookError) {
      logger.error(
        `Failed to send error webhook: ${
          webhookError instanceof Error ? webhookError.message : 'Unknown'
        }`
      );
    }

    throw error;
  } finally {
    cleanupJobDir(jobDir);
  }
}

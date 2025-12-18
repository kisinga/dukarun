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
import { TEMP_DIR, EPOCHS, BATCH_SIZE, logger } from './constants';
import {
  loadMobileNet,
  createCombinedModel,
  processImagesToTensors,
} from './model';
import { fetchManifest, sendStatusWebhook, uploadArtifacts } from './api';
import { downloadDataset, saveModelArtifacts, cleanupJobDir } from './artifacts';

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

    // 4. Load base model and create combined model
    logger.info('Loading MobileNet base model...');
    const mobilenet = await loadMobileNet();

    // 5. Create combined model (MobileNet + classification head)
    // This matches Teachable Machine architecture: accepts raw images [224,224,3]
    logger.info('Creating combined model (MobileNet + GlobalAveragePooling2D + Dense layers)...');
    const model = createCombinedModel(mobilenet, classes.length);

    // 6. Process images to raw image tensors for training
    // Combined model accepts raw images, so we preprocess images directly
    logger.info('Processing images to tensors...');
    const { xs, ys } = await processImagesToTensors(dataset, classes.length);

    // 7. Train
    logger.info('Starting training...');
    await model.fit(xs, ys, {
      epochs: EPOCHS,
      batchSize: BATCH_SIZE,
      callbacks: {
        onEpochEnd: async (epoch: number, logs?: tf.Logs) => {
          if (!logs) return;
          const progress = Math.round(((epoch + 1) / EPOCHS) * 100);
          logger.info(
            `Epoch ${epoch + 1}: loss=${logs.loss?.toFixed(4)}, acc=${logs.acc?.toFixed(4)}`
          );
          if (epoch % 5 === 0) {
            await sendStatusWebhook(webhookUrl, channelId, 'progress', progress, null, authToken);
          }
        },
      },
    });

    // Cleanup tensors
    xs.dispose();
    ys.dispose();

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

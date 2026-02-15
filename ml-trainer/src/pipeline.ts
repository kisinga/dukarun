/**
 * Training pipeline orchestrator (Teachable Machine flow).
 * 1. Send started webhook → 2. Fetch manifest → 3. Download images → 4. Run TM in browser
 * → 5. Normalize export → 6. Upload artifacts → 7. Send completed/error webhook. Cleanup in finally.
 */
import path from 'path';
import fs from 'fs';
import { TrainingConfig } from './types';
import { TEMP_DIR, logger } from './constants';
import { fetchManifest, sendStatusWebhook, uploadArtifacts } from './api';
import { downloadDataset, cleanupJobDir } from './artifacts';
import { runTeachableMachine } from './teachable-machine-runner';
import { normalizeExport } from './export-normalizer';
/**
 * Main training entry point. Same contract as before: channelId, manifestUrl, webhookUrl, authToken.
 * Runs the browser-based Teachable Machine pipeline and uploads via completeTraining.
 */
export async function startTraining(config: TrainingConfig): Promise<void> {
  const { channelId, manifestUrl, webhookUrl, authToken } = config;
  const jobDir = path.join(TEMP_DIR, channelId);
  const downloadDir = path.join(jobDir, 'downloads');

  try {
    await sendStatusWebhook(webhookUrl, channelId, 'started', 0, null, authToken);

    logger.info('Fetching training manifest...');
    const manifest = await fetchManifest(manifestUrl, authToken);
    const classes = manifest.products.map((p) => p.productId);

    if (manifest.products.length < 2) {
      throw new Error(
        `Insufficient training data: Need at least 2 products, got ${manifest.products.length}`
      );
    }

    if (!fs.existsSync(jobDir)) {
      fs.mkdirSync(jobDir, { recursive: true });
    }
    fs.mkdirSync(downloadDir, { recursive: true });

    const { totalImages } = await downloadDataset(manifest.products, jobDir);

    await sendStatusWebhook(webhookUrl, channelId, 'progress', 10, null, authToken);

    const executablePath = process.env.PUPPETEER_EXECUTABLE_PATH || undefined;
    const { exportPath } = await runTeachableMachine({
      jobDir,
      manifest,
      downloadDir,
      executablePath,
    });

    await sendStatusWebhook(webhookUrl, channelId, 'progress', 85, null, authToken);

    const { artifactsDir, fileNames } = normalizeExport({
      exportPath,
      channelId,
      labels: classes,
      productCount: manifest.products.length,
      imageCount: totalImages,
    });

    logger.info('Uploading artifacts to backend...');
    await uploadArtifacts(webhookUrl, channelId, artifactsDir, fileNames, authToken);

    await sendStatusWebhook(webhookUrl, channelId, 'completed', 100, null, authToken);
    logger.info('Training completed successfully');
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error(`Training failed: ${errorMessage}`, error);

    try {
      await sendStatusWebhook(webhookUrl, channelId, 'error', 0, errorMessage, authToken);
    } catch (webhookError) {
      logger.error(
        `Failed to send error webhook: ${webhookError instanceof Error ? webhookError.message : 'Unknown'}`
      );
    }

    throw error;
  } finally {
    cleanupJobDir(jobDir);
  }
}

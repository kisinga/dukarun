import * as tf from '@tensorflow/tfjs-node';
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import winston from 'winston';
import FormData from 'form-data';
import { promisify } from 'util';
import { pipeline as streamPipeline } from 'stream';
import { env } from './config/environment.config';

const pipeline = promisify(streamPipeline);

// Setup logger
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [new winston.transports.Console()],
});

// Constants
const MOBILENET_URL =
  'https://storage.googleapis.com/tfjs-models/tfjs/mobilenet_v1_0.25_224/model.json';
const EPOCHS = 20;
const BATCH_SIZE = 16;
const IMAGE_SIZE = 224;
const TEMP_DIR = path.join(__dirname, '../temp');

// Ensure temp dir exists
if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
}

interface TrainingConfig {
  channelId: string;
  manifestUrl: string;
  webhookUrl: string;
  authToken?: string;
}

interface DatasetItem {
  path: string;
  labelIndex: number;
}

interface ProductManifestEntry {
  productId: string;
  productName: string;
  images: Array<{
    assetId: string;
    url: string;
    filename: string;
  }>;
}

interface TrainingManifest {
  channelId: string;
  version: string;
  extractedAt: string;
  products: ProductManifestEntry[];
}

/**
 * Main training function
 */
export async function startTraining(config: TrainingConfig): Promise<void> {
  const { channelId, manifestUrl, webhookUrl, authToken } = config;
  const jobDir = path.join(TEMP_DIR, channelId);

  try {
    // 1. Send "started" webhook
    await sendWebhook(webhookUrl, channelId, 'started', 0, null, authToken);

    // 2. Fetch manifest using POST (more reliable for GraphQL)
    // Parse the manifest URL to extract the GraphQL endpoint and query
    const urlObj = new URL(manifestUrl);
    const graphqlEndpoint = `${urlObj.protocol}//${urlObj.host}${urlObj.pathname}`;
    const queryParam = urlObj.searchParams.get('query');

    logger.info(`Fetching manifest from ${graphqlEndpoint}`);
    logger.info(`Query: ${queryParam?.substring(0, 100)}...`);

    const manifestResponse = await axios.post(
      graphqlEndpoint,
      { query: queryParam },
      {
        headers: {
          Authorization: `Bearer ${authToken || env.ml.serviceToken}`,
          'Content-Type': 'application/json',
        },
        timeout: 30000, // 30 second timeout
      }
    );

    // Log raw response for debugging
    logger.info(`Manifest response status: ${manifestResponse.status}`);
    logger.info(
      `Manifest response structure: ${JSON.stringify(Object.keys(manifestResponse.data || {}))}`
    );

    // Parse manifest from GraphQL response
    const manifest: TrainingManifest = manifestResponse.data?.data?.mlTrainingManifest;

    if (!manifest) {
      // Log what we actually received for debugging
      logger.error(`Invalid manifest response: ${JSON.stringify(manifestResponse.data)}`);
      throw new Error(
        `Failed to fetch training manifest. Response: ${JSON.stringify(
          manifestResponse.data?.errors || 'No data returned'
        )}`
      );
    }

    if (!manifest.products || manifest.products.length < 2) {
      throw new Error(
        `Insufficient training data: Need at least 2 products, got ${
          manifest.products?.length || 0
        }`
      );
    }

    // 3. Prepare data
    if (!fs.existsSync(jobDir)) fs.mkdirSync(jobDir, { recursive: true });

    const classes = manifest.products.map(p => p.productId);
    const dataset: DatasetItem[] = [];

    // Download images
    logger.info(`Downloading images for ${manifest.products.length} products...`);
    let totalImages = 0;

    for (const product of manifest.products) {
      logger.info(`Downloading ${product.images.length} images for product ${product.productId}`);
      for (const image of product.images) {
        const imagePath = path.join(jobDir, `${product.productId}_${image.assetId}.jpg`);
        logger.debug(`Downloading: ${image.url}`);
        await downloadImage(image.url, imagePath);
        dataset.push({
          path: imagePath,
          labelIndex: classes.indexOf(product.productId),
        });
        totalImages++;
      }
    }
    logger.info(`Downloaded ${totalImages} images successfully`);

    if (totalImages === 0) throw new Error('No images found in manifest');

    // 4. Load MobileNet with retry logic
    logger.info('Loading MobileNet base model...');
    const mobilenet = await loadMobileNetWithRetry();

    // Get output from internal layer (transfer learning)
    const layer = mobilenet.getLayer('conv_pw_13_relu');
    const truncatedModel = tf.model({
      inputs: mobilenet.inputs,
      outputs: layer.output,
    });

    // 5. Connect new head
    const model = tf.sequential();
    model.add(tf.layers.flatten({ inputShape: truncatedModel.outputs[0].shape.slice(1) }));
    model.add(tf.layers.dense({ units: 100, activation: 'relu' }));
    model.add(tf.layers.dense({ units: classes.length, activation: 'softmax' }));

    // Optimization
    const optimizer = tf.train.adam(0.0001);
    model.compile({
      optimizer,
      loss: 'categoricalCrossentropy',
      metrics: ['accuracy'],
    });

    // 6. Process data into tensors
    logger.info('Processing tensors...');
    const { xs, ys } = await processImagesToTensors(dataset, classes.length, truncatedModel);

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
            // Report every 5 epochs to avoid spamming
            await sendWebhook(webhookUrl, channelId, 'progress', progress, null, authToken);
          }
        },
      },
    });

    // Dispose tensors
    xs.dispose();
    ys.dispose();

    // 8. Save Model
    logger.info('Saving trained model...');
    const artifactsDir = path.join(jobDir, 'artifacts');
    if (!fs.existsSync(artifactsDir)) fs.mkdirSync(artifactsDir);

    // Save model.json and weights
    await model.save(`file://${artifactsDir}`);

    // Create metadata.json with stats for backend
    const metadata = {
      modelName: `dukarun-channel-${channelId}`,
      labels: classes,
      imageSize: IMAGE_SIZE,
      trainedAt: new Date().toISOString(),
      productCount: manifest.products.length,
      imageCount: totalImages,
    };
    fs.writeFileSync(path.join(artifactsDir, 'metadata.json'), JSON.stringify(metadata));

    // 9. Upload Results
    logger.info('Uploading results...');
    await uploadResults(webhookUrl, channelId, artifactsDir, authToken);

    logger.info('Training completed successfully');
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error(`Training failed: ${errorMessage}`, error);

    // Send error webhook - don't let webhook failure mask the original error
    try {
      logger.info(`Sending error webhook for channel ${channelId}: ${errorMessage}`);
      await sendWebhook(webhookUrl, channelId, 'error', 0, errorMessage, authToken);
      logger.info('Error webhook sent successfully');
    } catch (webhookError) {
      logger.error(
        `Failed to send error webhook: ${
          webhookError instanceof Error ? webhookError.message : 'Unknown'
        }`
      );
    }

    throw error;
  } finally {
    // Cleanup temp files
    if (fs.existsSync(jobDir)) {
      // fs.rmSync(jobDir, { recursive: true, force: true });
      // Keeping for debug for now
    }
  }
}

async function loadMobileNetWithRetry(): Promise<tf.LayersModel> {
  const maxRetries = 3;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const model = await tf.loadLayersModel(MOBILENET_URL);
      logger.info('MobileNet loaded successfully');
      return model;
    } catch (loadError) {
      const errMsg = loadError instanceof Error ? loadError.message : String(loadError);
      logger.warn(`MobileNet load attempt ${attempt}/${maxRetries} failed: ${errMsg}`);
      if (attempt === maxRetries) {
        throw new Error(`Failed to load MobileNet after ${maxRetries} attempts: ${errMsg}`);
      }
      // Wait before retry
      await new Promise(r => setTimeout(r, 2000 * attempt));
    }
  }
  throw new Error('Failed to load MobileNet');
}

async function downloadImage(url: string, destPath: string): Promise<void> {
  try {
    const response = await axios({
      url,
      method: 'GET',
      responseType: 'stream',
      timeout: 30000, // 30 second timeout
    });
    await pipeline(response.data, fs.createWriteStream(destPath));
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    logger.warn(`Failed to download image ${url}: ${errorMessage}`);
    throw err; // Re-throw so we know about failures
  }
}

async function processImagesToTensors(
  dataset: DatasetItem[],
  numClasses: number,
  featureExtractor: tf.LayersModel
): Promise<{ xs: tf.Tensor; ys: tf.Tensor }> {
  const features: tf.Tensor[] = [];
  const labels: number[] = [];

  // Process images outside tf.tidy() to avoid disposing intermediate tensors
  for (const item of dataset) {
    if (!fs.existsSync(item.path)) continue;

    const buffer = fs.readFileSync(item.path);
    // Use tf.tidy() for each image processing to clean up intermediate tensors
    const feature = tf.tidy(() => {
      const tensor = tf.node
        .decodeImage(buffer)
        .resizeNearestNeighbor([IMAGE_SIZE, IMAGE_SIZE])
        .toFloat()
        .div(255.0)
        .expandDims();

      // Predict and ensure we have a single tensor (not array)
      const prediction = featureExtractor.predict(tensor);
      const featureTensor = Array.isArray(prediction) ? prediction[0] : prediction;

      // Clone the feature tensor so it survives outside tf.tidy()
      return featureTensor.clone();
    });

    features.push(feature);
    labels.push(item.labelIndex);
  }

  // Concatenate features and create labels outside tf.tidy()
  const xs = tf.concat(features);
  const ys = tf.oneHot(tf.tensor1d(labels, 'int32'), numClasses);

  // Dispose intermediate feature tensors (they're now in xs)
  features.forEach(f => f.dispose());

  return { xs, ys };
}

async function sendWebhook(
  url: string,
  channelId: string,
  status: string,
  progress: number,
  error: string | null,
  token?: string
): Promise<void> {
  try {
    // Use token from parameter, or fall back to environment variable
    const authToken = token || env.ml.serviceToken;
    if (!authToken) {
      logger.warn('No auth token available for webhook');
      return;
    }

    // Construct GraphQL mutation for status update
    const mutation = `
      mutation UpdateStatus($channelId: ID!, $status: String!, $progress: Int, $error: String) {
        updateTrainingStatus(channelId: $channelId, status: $status, progress: $progress, error: $error)
      }
    `;

    await axios.post(
      url,
      {
        query: mutation,
        variables: {
          channelId,
          status,
          progress: progress || 0,
          error: error || null,
        },
      },
      {
        headers: { Authorization: `Bearer ${authToken}` },
      }
    );
    logger.info(`Webhook sent successfully: status=${status}, progress=${progress}`);
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    logger.error(`Failed to send status webhook: ${errorMessage}`);
    if (axios.isAxiosError(err) && err.response) {
      logger.error(`Webhook response: ${JSON.stringify(err.response.data)}`);
    }
  }
}

async function uploadResults(
  webhookUrl: string,
  channelId: string,
  artifactsDir: string,
  token?: string
): Promise<void> {
  const form = new FormData();

  // These field names MUST match what the backend mutation expects
  form.append(
    'operations',
    JSON.stringify({
      query: `
      mutation CompleteTraining($channelId: ID!, $modelJson: Upload!, $weightsFile: Upload!, $metadata: Upload!) {
        completeTraining(channelId: $channelId, modelJson: $modelJson, weightsFile: $weightsFile, metadata: $metadata)
      }
    `,
      variables: {
        channelId,
        modelJson: null,
        weightsFile: null,
        metadata: null,
      },
    })
  );

  form.append(
    'map',
    JSON.stringify({
      '0': ['variables.modelJson'],
      '1': ['variables.weightsFile'],
      '2': ['variables.metadata'],
    })
  );

  form.append('0', fs.createReadStream(path.join(artifactsDir, 'model.json')));
  form.append('1', fs.createReadStream(path.join(artifactsDir, 'weights.bin')));
  form.append('2', fs.createReadStream(path.join(artifactsDir, 'metadata.json')));

  // webhookUrl is the GraphQL endpoint (e.g., http://backend:3000/admin-api)
  const graphqlUrl = webhookUrl;

  // Use token from parameter, or fall back to environment variable
  const authToken = token || env.ml.serviceToken;
  if (!authToken) {
    throw new Error('No auth token available for upload');
  }

  logger.info(`Uploading to ${graphqlUrl}`);

  const response = await axios.post(graphqlUrl, form, {
    headers: {
      Authorization: `Bearer ${authToken}`,
      ...form.getHeaders(),
    },
  });

  // Check for GraphQL errors in response
  if (response.data?.errors) {
    const errorMessages = response.data.errors.map((e: any) => e.message).join(', ');
    logger.error(`GraphQL upload errors: ${errorMessages}`);
    throw new Error(`Failed to complete training upload: ${errorMessages}`);
  }

  if (!response.data?.data?.completeTraining) {
    logger.error(
      `Upload response missing completeTraining result: ${JSON.stringify(response.data)}`
    );
    throw new Error('Upload completed but completeTraining mutation returned false or null');
  }

  logger.info('Model files uploaded successfully');
}

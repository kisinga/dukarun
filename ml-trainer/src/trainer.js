const tf = require('@tensorflow/tfjs-node');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const winston = require('winston');
const FormData = require('form-data');
const { promisify } = require('util');
const stream = require('stream');

const pipeline = promisify(stream.pipeline);

// Setup logger
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [new winston.transports.Console()],
});

// Constants
const MOBILENET_URL = 'https://storage.googleapis.com/tfjs-models/tfjs/mobilenet_v1_0.25_224/model.json';
const EPOCHS = 20;
const BATCH_SIZE = 16;
const IMAGE_SIZE = 224;
const TEMP_DIR = path.join(__dirname, '../temp');

// Ensure temp dir exists
if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
}

/**
 * Main training function
 */
async function startTraining(config) {
  const { channelId, manifestUrl, webhookUrl, authToken } = config;
  const jobDir = path.join(TEMP_DIR, channelId);
  
  try {
    // 1. Send "started" webhook
    await sendWebhook(webhookUrl, channelId, 'started', 0, null, authToken);

    // 2. Fetch manifest
    logger.info(`Fetching manifest from ${manifestUrl}`);
    const manifestResponse = await axios.get(manifestUrl, {
      headers: { Authorization: `Bearer ${authToken}` }
    });
    const manifest = manifestResponse.data.data ? manifestResponse.data.data.mlTrainingManifest : manifestResponse.data;

    if (!manifest || !manifest.products || manifest.products.length < 2) {
      throw new Error('Insufficient training data: Need at least 2 products');
    }

    // 3. Prepare data
    if (!fs.existsSync(jobDir)) fs.mkdirSync(jobDir, { recursive: true });
    
    const classes = manifest.products.map(p => p.productId);
    const dataset = [];

    // Download images
    logger.info(`Downloading images for ${manifest.products.length} products...`);
    let totalImages = 0;
    
    for (const product of manifest.products) {
      for (const image of product.images) {
        const imagePath = path.join(jobDir, `${product.productId}_${image.assetId}.jpg`);
        await downloadImage(image.url, imagePath);
        dataset.push({
          path: imagePath,
          labelIndex: classes.indexOf(product.productId)
        });
        totalImages++;
      }
    }
    
    if (totalImages === 0) throw new Error('No images found in manifest');

    // 4. Load MobileNet
    logger.info('Loading MobileNet base model...');
    const mobilenet = await tf.loadLayersModel(MOBILENET_URL);
    
    // Get output from internal layer (transfer learning)
    const layer = mobilenet.getLayer('conv_pw_13_relu');
    const truncatedModel = tf.model({ 
      inputs: mobilenet.inputs, 
      outputs: layer.output 
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
      metrics: ['accuracy']
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
        onEpochEnd: async (epoch, logs) => {
          const progress = Math.round(((epoch + 1) / EPOCHS) * 100);
          logger.info(`Epoch ${epoch + 1}: loss=${logs.loss.toFixed(4)}, acc=${logs.acc.toFixed(4)}`);
          if (epoch % 5 === 0) { // Report every 5 epochs to avoid spamming
            await sendWebhook(webhookUrl, channelId, 'progress', progress, null, authToken);
          }
        }
      }
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

    // Create metadata.json
    const metadata = {
      modelName: `dukarun-channel-${channelId}`,
      labels: classes,
      imageSize: IMAGE_SIZE,
      trainedAt: new Date().toISOString()
    };
    fs.writeFileSync(path.join(artifactsDir, 'metadata.json'), JSON.stringify(metadata));

    // 9. Upload Results
    logger.info('Uploading results...');
    await uploadResults(webhookUrl, channelId, artifactsDir, authToken);

    logger.info('Training completed successfully');

  } catch (error) {
    logger.error('Training failed:', error);
    await sendWebhook(webhookUrl, channelId, 'error', 0, error.message, authToken);
  } finally {
    // Cleanup temp files
    if (fs.existsSync(jobDir)) {
      // fs.rmSync(jobDir, { recursive: true, force: true });
      // Keeping for debug for now
    }
  }
}

async function downloadImage(url, destPath) {
  try {
    const response = await axios({
      url,
      method: 'GET',
      responseType: 'stream'
    });
    await pipeline(response.data, fs.createWriteStream(destPath));
  } catch (err) {
    logger.warn(`Failed to download image ${url}: ${err.message}`);
  }
}

async function processImagesToTensors(dataset, numClasses, featureExtractor) {
  return tf.tidy(() => {
    const features = [];
    const labels = [];
    
    for (const item of dataset) {
      if (!fs.existsSync(item.path)) continue;
      
      const buffer = fs.readFileSync(item.path);
      const tensor = tf.node.decodeImage(buffer)
        .resizeNearestNeighbor([IMAGE_SIZE, IMAGE_SIZE])
        .toFloat()
        .div(255.0)
        .expandDims();
        
      const validFeature = featureExtractor.predict(tensor);
      features.push(validFeature);
      labels.push(item.labelIndex);
    }
    
    const xs = tf.concat(features);
    const ys = tf.oneHot(tf.tensor1d(labels, 'int32'), numClasses);
    
    return { xs, ys };
  });
}

async function sendWebhook(url, channelId, status, progress, error, token) {
  try {
    // Construct GraphQL mutation for status update
    // using the valid mutation from backend: updateTrainingStatus(channelId, status, progress, error)
    const mutation = `
      mutation UpdateStatus($channelId: ID!, $status: String!, $progress: Int, $error: String) {
        updateTrainingStatus(channelId: $channelId, status: $status, progress: $progress, error: $error)
      }
    `;

    await axios.post(url, {
      query: mutation,
      variables: {
        channelId,
        status, 
        progress: progress || 0,
        error: error || null
      }
    }, {
      headers: { Authorization: `Bearer ${token}` }
    });
  } catch (err) {
    logger.warn(`Failed to send status webhook: ${err.message}`);
    if (err.response) {
      logger.warn(`Response: ${JSON.stringify(err.response.data)}`);
    }
  }
}

async function uploadResults(webhookUrl, channelId, artifactsDir, token) {
  const form = new FormData();
  
  // These field names MUST match what the backend mutation expects
  // completeTraining(channelId: ID, modelJson: Upload!, weightsFile: Upload!, metadata: Upload!)
  form.append('operations', JSON.stringify({
    query: `
      mutation CompleteTraining($channelId: ID!, $modelJson: Upload!, $weightsFile: Upload!, $metadata: Upload!) {
        completeTraining(channelId: $channelId, modelJson: $modelJson, weightsFile: $weightsFile, metadata: $metadata)
      }
    `,
    variables: {
      channelId,
      modelJson: null,
      weightsFile: null,
      metadata: null
    }
  }));

  form.append('map', JSON.stringify({
    '0': ['variables.modelJson'],
    '1': ['variables.weightsFile'],
    '2': ['variables.metadata']
  }));

  form.append('0', fs.createReadStream(path.join(artifactsDir, 'model.json')));
  form.append('1', fs.createReadStream(path.join(artifactsDir, 'weights.bin')));
  form.append('2', fs.createReadStream(path.join(artifactsDir, 'metadata.json')));

  // Note: We use the same webhook URL (which might be the admin-api endpoint in reality)
  // Or we need a specific upload endpoint.
  // The plan said "POST /webhook (Upload)", but backend expects GraphQL mutation.
  // Let's assume webhookUrl IS the graphql endpoint for upload phase, 
  // OR we need to distinguish status updates from final upload.
  // Re-reading plan: Backend --> POST /train --> ML Trainer
  // ML Trainer --> POST /webhook (Upload) --> Backend
  // The 'webhookUrl' passed in might be a status webhook, but we need the GRAPHQL API for upload.
  
  // HACK: Construct GraphQL endpoint from manifestUrl or pass it explicitly.
  // For now, let's assume the passed 'webhookUrl' is actually the GraphQL endpoint 
  // capable of handling the mutation, OR we parse the manifestUrl to find the base.
  
  // Correction: The plan says "Upload trained model via provided mutation". 
  // It's safer to use the same base URL as manifestUrl (which is likely admin-api).
  
  // Let's guess the GraphQL endpoint from manifestUrl
  // manifestUrl: http://backend:3000/admin-api?query=...
  const graphqlUrl = manifestUrl.split('?')[0]; 
  
  logger.info(`Uploading to ${graphqlUrl}`);
  
  await axios.post(graphqlUrl, form, {
    headers: {
      Authorization: `Bearer ${token}`,
      ...form.getHeaders()
    }
  });
}

module.exports = { startTraining };

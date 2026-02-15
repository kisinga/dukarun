# Dukarun ML Trainer Microservice

Dedicated TypeScript/Node.js microservice that drives [Teachable Machine](https://teachablemachine.withgoogle.com/train/image) via Puppeteer to train image classification models, then uploads the exported model to the backend.

## Features

- **Teachable Machine**: Uses Google's Teachable Machine (Image project) in a headless browser to perform training.
- **Same contract**: Still consumes manifest (product IDs + image URLs), reports progress via webhooks, and uploads `model.json`, `weights.bin`, and `metadata.json` via the existing `completeTraining` mutation.
- **Compatible output**: Export is normalized to the format expected by the frontend (labels = product IDs, metadata shape unchanged).

## API

### POST /v1/train

Triggers a training job. The service processes this asynchronously.

**Request Body:**
```json
{
  "channelId": "123",
  "manifestUrl": "http://backend:3000/admin-api?query=...",
  "webhookUrl": "http://backend:3000/admin-api",
  "authToken": "secure-token"
}
```

**Response:**
```json
{
  "message": "Training job accepted",
  "jobId": "123"
}
```

## Development

### Prerequisites

- Node.js 20+
- TypeScript 5.x
- Chromium (for Puppeteer). On first `npm install`, Puppeteer downloads Chromium automatically unless `PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=1` is set.

### Setup

```bash
# Install dependencies (includes Puppeteer and Chromium)
npm install

# Build TypeScript
npm run build

# Run in dev mode (with hot reload)
npm run dev

# Run production build
npm start
```

## Docker

The service runs in Docker with Chromium installed in the image (no TensorFlow native deps).

```bash
docker compose up -d ml-trainer
```

Set `PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium` in the container so Puppeteer uses the system Chromium.

## Architecture

1. **Manifest**: Backend provides a manifest URL; trainer fetches it (product IDs and image URLs).
2. **Download**: Trainer downloads all images into `jobDir/images/0/`, `1/`, … (one folder per product/class).
3. **Browser**: Launches headless Chrome, opens Teachable Machine Image project, uploads images per class, clicks Train, waits for completion.
4. **Export**: Triggers Export → TensorFlow.js → Download; captures the downloaded zip/file.
5. **Normalize**: Unzips if needed, renames weights to `weights.bin`, updates `model.json` paths, writes `metadata.json` (labels, productCount, imageCount, etc.).
6. **Upload**: Calls existing `uploadArtifacts` → `completeTraining` mutation with the three files.

No changes to backend or frontend; the upload and webhook contract is unchanged.

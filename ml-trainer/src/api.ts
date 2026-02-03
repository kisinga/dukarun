/**
 * Backend API communication
 */
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import FormData from 'form-data';
import { TrainingManifest, ArtifactFileNames } from './types';
import { logger } from './constants';
import { env } from './config/environment.config';

/**
 * Fetch training manifest from backend GraphQL API
 */
export async function fetchManifest(
  manifestUrl: string,
  authToken?: string
): Promise<TrainingManifest> {
  const urlObj = new URL(manifestUrl);
  const graphqlEndpoint = `${urlObj.protocol}//${urlObj.host}${urlObj.pathname}`;
  const queryParam = urlObj.searchParams.get('query');

  logger.info(`Fetching manifest from ${graphqlEndpoint}`);

  const response = await axios.post(
    graphqlEndpoint,
    { query: queryParam },
    {
      headers: {
        Authorization: `Bearer ${authToken || env.ml.serviceToken}`,
        'Content-Type': 'application/json',
      },
      timeout: 30000,
    }
  );

  const manifest = response.data?.data?.mlTrainingManifest;

  if (!manifest) {
    logger.error(`Invalid manifest response: ${JSON.stringify(response.data)}`);
    throw new Error(
      `Failed to fetch training manifest. Response: ${JSON.stringify(
        response.data?.errors || 'No data returned'
      )}`
    );
  }

  if (!manifest.products || manifest.products.length < 2) {
    throw new Error(
      `Insufficient training data: Need at least 2 products, got ${manifest.products?.length || 0}`
    );
  }

  return manifest;
}

/**
 * Send training status webhook to backend
 */
export async function sendStatusWebhook(
  url: string,
  channelId: string,
  status: string,
  progress: number,
  error: string | null,
  token?: string
): Promise<void> {
  const authToken = token || env.ml.serviceToken;
  if (!authToken) {
    logger.warn('No auth token available for webhook');
    return;
  }

  try {
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
    logger.info(`Webhook sent: status=${status}, progress=${progress}`);
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    logger.error(`Failed to send status webhook: ${errorMessage}`);
    if (axios.isAxiosError(err) && err.response) {
      logger.error(`Webhook response: ${JSON.stringify(err.response.data)}`);
    }
  }
}

/**
 * Upload model artifacts to backend via GraphQL multipart upload
 */
export async function uploadArtifacts(
  webhookUrl: string,
  channelId: string,
  artifactsDir: string,
  fileNames: ArtifactFileNames,
  token?: string
): Promise<void> {
  const authToken = token || env.ml.serviceToken;
  if (!authToken) {
    throw new Error('No auth token available for upload');
  }

  const form = new FormData();

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

  form.append('0', fs.createReadStream(path.join(artifactsDir, fileNames.modelJson)));
  form.append('1', fs.createReadStream(path.join(artifactsDir, fileNames.weights)));
  form.append('2', fs.createReadStream(path.join(artifactsDir, fileNames.metadata)));

  logger.info(`Uploading artifacts to ${webhookUrl}`);

  const response = await axios.post(webhookUrl, form, {
    headers: {
      Authorization: `Bearer ${authToken}`,
      ...form.getHeaders(),
    },
  });

  if (response.data?.errors) {
    const errorMessages = response.data.errors.map((e: any) => e.message).join(', ');
    logger.error(`GraphQL upload errors: ${errorMessages}`);
    throw new Error(`Failed to complete training upload: ${errorMessages}`);
  }

  if (!response.data?.data?.completeTraining) {
    throw new Error('Upload completed but completeTraining mutation returned false or null');
  }

  logger.info('Model artifacts uploaded successfully');
}











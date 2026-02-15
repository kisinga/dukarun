/**
 * Normalize Teachable Machine export to the format expected by completeTraining:
 * model.json, weights.bin, metadata.json (with our ModelMetadata shape).
 */
import fs from 'fs';
import path from 'path';
import AdmZip from 'adm-zip';
import { ModelMetadata, ArtifactFileNames } from './types';
import { IMAGE_SIZE, logger } from './constants';

export const ARTIFACT_FILE_NAMES: ArtifactFileNames = {
  modelJson: 'model.json',
  weights: 'weights.bin',
  metadata: 'metadata.json',
};

export interface NormalizeExportInput {
  /** Path to TM export: either a directory containing model.json (and .bin) or a .zip file. */
  exportPath: string;
  channelId: string;
  /** Class labels (product IDs) in same order as TM classes. */
  labels: string[];
  productCount: number;
  imageCount: number;
}

export interface NormalizeExportResult {
  artifactsDir: string;
  fileNames: ArtifactFileNames;
}

/**
 * Unzip if path is .zip and return the directory containing model.json and weights.
 */
function ensureExtracted(exportPath: string): string {
  const stat = fs.statSync(exportPath);
  if (stat.isDirectory()) {
    return exportPath;
  }
  if (stat.isFile() && exportPath.toLowerCase().endsWith('.zip')) {
    const extractDir = exportPath.replace(/\.zip$/i, '_extracted');
    if (fs.existsSync(extractDir)) {
      fs.rmSync(extractDir, { recursive: true, force: true });
    }
    fs.mkdirSync(extractDir, { recursive: true });
    const zip = new AdmZip(exportPath);
    zip.extractAllTo(extractDir, true);
    logger.info(`Extracted TM export to ${extractDir}`);
    return extractDir;
  }
  throw new Error(`Expected a directory or .zip file: ${exportPath}`);
}

/**
 * Normalize TM export: ensure weights.bin and model.json paths, write metadata.json.
 * Returns the artifacts directory and file names for uploadArtifacts.
 */
export function normalizeExport(input: NormalizeExportInput): NormalizeExportResult {
  const workDir = ensureExtracted(input.exportPath);

  const modelJsonPath = path.join(workDir, 'model.json');
  if (!fs.existsSync(modelJsonPath)) {
    throw new Error(`model.json not found in ${workDir}`);
  }

  const files = fs.readdirSync(workDir);
  const weightFiles = files.filter((f) => f.endsWith('.bin') && f !== 'weights.bin');

  const weightsPath = path.join(workDir, 'weights.bin');
  if (weightFiles.length === 1) {
    const src = path.join(workDir, weightFiles[0]);
    if (path.resolve(src) !== path.resolve(weightsPath)) {
      fs.copyFileSync(src, weightsPath);
      fs.unlinkSync(src);
    }
  } else if (weightFiles.length > 1) {
    const buffers: Buffer[] = [];
    for (const wf of weightFiles.sort()) {
      buffers.push(fs.readFileSync(path.join(workDir, wf)));
      fs.unlinkSync(path.join(workDir, wf));
    }
    fs.writeFileSync(weightsPath, Buffer.concat(buffers));
  } else {
    throw new Error(`No .bin weight file(s) found in ${workDir}`);
  }

  const modelJson = JSON.parse(fs.readFileSync(modelJsonPath, 'utf8'));
  if (modelJson.weightsManifest?.[0]) {
    modelJson.weightsManifest[0].paths = ['weights.bin'];
    fs.writeFileSync(modelJsonPath, JSON.stringify(modelJson));
  }

  const trainingId = `${input.channelId}-${Date.now()}`;
  const metadata: ModelMetadata = {
    modelName: `product-classifier-${input.channelId}`,
    trainingId,
    labels: input.labels,
    imageSize: IMAGE_SIZE,
    trainedAt: new Date().toISOString(),
    productCount: input.productCount,
    imageCount: input.imageCount,
    files: {
      modelJson: ARTIFACT_FILE_NAMES.modelJson,
      weights: ARTIFACT_FILE_NAMES.weights,
      metadata: ARTIFACT_FILE_NAMES.metadata,
    },
  };
  const metadataPath = path.join(workDir, 'metadata.json');
  fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));

  logger.info('Normalized TM export:');
  logger.info(`  model.json: ${fs.statSync(modelJsonPath).size} bytes`);
  logger.info(`  weights.bin: ${fs.statSync(weightsPath).size} bytes`);
  logger.info(`  metadata.json: ${fs.statSync(metadataPath).size} bytes`);

  return {
    artifactsDir: workDir,
    fileNames: { ...ARTIFACT_FILE_NAMES },
  };
}

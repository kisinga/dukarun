import path from 'path';
import fs from 'fs';
import winston from 'winston';

// Training hyperparameters
export const MOBILENET_URL =
  'https://storage.googleapis.com/tfjs-models/tfjs/mobilenet_v1_0.25_224/model.json';
export const EPOCHS = 20;
export const BATCH_SIZE = 16;
export const IMAGE_SIZE = 224;

// File system
export const TEMP_DIR = path.join(__dirname, '../temp');

// Ensure temp dir exists on module load
if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
}

// Logger singleton
export const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [new winston.transports.Console()],
});




/**
 * Constants for ML training pipeline (Teachable Machine flow).
 * IMAGE_SIZE matches Teachable Machine / frontend expectation (224).
 */
import winston from 'winston';

/** Input image size (Teachable Machine / MobileNet standard). */
export const IMAGE_SIZE = 224;

/** Temporary directory for downloaded images and model artifacts. */
export const TEMP_DIR = process.env.ML_TEMP_DIR || '/tmp/ml-training';

/** Winston logger for the ml-trainer service. */
export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.printf(({ timestamp, level, message, ...meta }) => {
      const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
      return `[${timestamp}] ${level.toUpperCase()}: ${message}${metaStr}`;
    })
  ),
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.printf(({ timestamp, level, message, ...meta }) => {
          const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
          return `[${timestamp}] ${level}: ${message}${metaStr}`;
        })
      ),
    }),
  ],
});

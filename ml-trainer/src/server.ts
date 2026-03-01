import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import winston from 'winston';
import { startTraining } from './pipeline';
import { env } from './config/environment.config';

// Setup logging
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.Console({
      format: winston.format.simple(),
    }),
  ],
});

const app = express();
const PORT = env.app.ML_PORT

// In-memory job tracking for idempotency
// Maps channelId -> { status: 'running' | 'completed' | 'failed', startedAt: Date }
interface JobStatus {
  status: 'running' | 'completed' | 'failed';
  startedAt: Date;
  completedAt?: Date;
  failedAt?: Date;
  error?: string;
}

const activeJobs = new Map<string, JobStatus>();

// CORS: restrict to allowed origins (backend URL, localhost). Empty = no browser CORS.
const corsOrigins = env.app.corsOrigins
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);
const corsOptions: cors.CorsOptions = {
  origin:
    corsOrigins.length > 0
      ? corsOrigins
      : ['http://localhost:3000', 'http://127.0.0.1:3000', 'http://backend:3000'],
  credentials: true,
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
};
app.use(cors(corsOptions));
app.use(express.json());

// Service token auth for /v1/train and /v1/jobs
function requireServiceToken(req: Request, res: Response, next: NextFunction): void {
  const expected = env.ml.serviceToken;
  if (!expected) {
    res.status(503).json({ error: 'Service not configured: ML_SERVICE_TOKEN not set' });
    return;
  }
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Authorization required: Bearer token expected' });
    return;
  }
  const token = authHeader.slice(7);
  if (token !== expected) {
    res.status(403).json({ error: 'Invalid service token' });
    return;
  }
  next();
}

// Routes
app.get('/health', (req: Request, res: Response) => {
  res.status(200).json({ status: 'ok', uptime: process.uptime() });
});

app.get('/v1/jobs', requireServiceToken, (req: Request, res: Response) => {
  const jobs = Array.from(activeJobs.entries()).map(([channelId, job]) => ({
    channelId,
    status: job.status,
    startedAt: job.startedAt,
    completedAt: job.completedAt,
    failedAt: job.failedAt,
    error: job.error,
  }));
  res.status(200).json(jobs);
});

app.post('/v1/train', requireServiceToken, async (req: Request, res: Response) => {
  const { channelId, manifestUrl, webhookUrl, authToken } = req.body;

  if (!channelId || !manifestUrl || !webhookUrl) {
    return res.status(400).json({
      error: 'Missing required fields: channelId, manifestUrl, webhookUrl',
    });
  }

  // Check for duplicate concurrent job
  const existingJob = activeJobs.get(channelId);
  if (existingJob && existingJob.status === 'running') {
    logger.warn(`Training job already in progress for channel ${channelId}`);
    return res.status(409).json({
      error: 'Training job already in progress for this channel',
      jobId: channelId,
      startedAt: existingJob.startedAt,
    });
  }

  logger.info(`Received training request for channel ${channelId}`);

  // Mark job as running
  activeJobs.set(channelId, {
    status: 'running',
    startedAt: new Date(),
  });

  // Start training asynchronously (don't wait for completion)
  startTraining({ channelId, manifestUrl, webhookUrl, authToken })
    .then(() => {
      // Mark as completed
      const job = activeJobs.get(channelId);
      if (job) {
        activeJobs.set(channelId, {
          ...job,
          status: 'completed',
          completedAt: new Date(),
        });
      }
      logger.info(`Training completed for channel ${channelId}`);

      // Clean up after 1 hour
      setTimeout(() => {
        activeJobs.delete(channelId);
      }, 60 * 60 * 1000);
    })
    .catch((err: Error) => {
      logger.error(`Training failed for channel ${channelId}:`, err);
      // Mark as failed
      const job = activeJobs.get(channelId);
      if (job) {
        activeJobs.set(channelId, {
          ...job,
          status: 'failed',
          failedAt: new Date(),
          error: err.message,
        });
      }

      // Clean up after 1 hour
      setTimeout(() => {
        activeJobs.delete(channelId);
      }, 60 * 60 * 1000);
    });

  // Return success immediately indicating job accepted
  res.status(202).json({
    message: 'Training job accepted',
    jobId: channelId, // Using channelId as simplified jobId for now
  });
});

// Error handling
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  logger.error(err.stack);
  res.status(500).json({ error: 'Internal Server Error' });
});

app.listen(PORT, () => {
  logger.info(`ML Trainer Service listening on port ${PORT}`);
});

const express = require('express');
const cors = require('cors');
const winston = require('winston');
const { startTraining } = require('./trainer');

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
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', uptime: process.uptime() });
});

app.post('/v1/train', async (req, res) => {
  const { channelId, manifestUrl, webhookUrl, authToken } = req.body;

  if (!channelId || !manifestUrl || !webhookUrl) {
    return res.status(400).json({ 
      error: 'Missing required fields: channelId, manifestUrl, webhookUrl' 
    });
  }

  logger.info(`Received training request for channel ${channelId}`);

  // Start training asynchronously (don't wait for completion)
  // In a real production system, this would push to a job queue (BullMQ/Redis)
  startTraining({ channelId, manifestUrl, webhookUrl, authToken })
    .catch(err => {
      logger.error(`Training failed for channel ${channelId}:`, err);
    });

  // Return success immediately indicating job accepted
  res.status(202).json({ 
    message: 'Training job accepted',
    jobId: channelId // Using channelId as simplified jobId for now
  });
});

// Error handling
app.use((err, req, res, next) => {
  logger.error(err.stack);
  res.status(500).json({ error: 'Internal Server Error' });
});

app.listen(PORT, () => {
  logger.info(`ML Trainer Service listening on port ${PORT}`);
});

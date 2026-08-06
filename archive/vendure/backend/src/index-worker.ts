import { bootstrapWorker } from '@vendure/core';
import { config } from './vendure-config';
// Initialize environment configuration early
import './infrastructure/config/environment.config';
// Initialize OpenTelemetry telemetry before worker bootstrap
import { BRAND_CONFIG } from './constants/brand.constants';
import { initializeTelemetry } from './infrastructure/observability/telemetry.init';

// Set process type for reliable worker context detection
process.env.VENDURE_PROCESS_TYPE = 'worker';

// Initialize telemetry (must be done before any other application code)
initializeTelemetry(`${BRAND_CONFIG.servicePrefix}-worker`);

const workerRuntimeConfig = {
  ...config,
  dbConnectionOptions: {
    ...config.dbConnectionOptions,
    migrationsRun: false,
    synchronize: false,
  },
};

bootstrapWorker(workerRuntimeConfig)
  .then(worker => worker.startJobQueue())
  .catch(err => {
    // Use console.error for bootstrap failures (logger not yet initialized)
    console.error('❌ Failed to start worker:', err);
    process.exit(1);
  });

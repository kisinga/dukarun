import { bootstrap } from '@vendure/core';
import { config } from './vendure-config';
// Initialize environment configuration early
import './infrastructure/config/environment.config';
// Initialize OpenTelemetry telemetry before application bootstrap
import { BRAND_CONFIG } from './constants/brand.constants';
import { initializeTelemetry } from './infrastructure/observability/telemetry.init';
import { initializeVendureBootstrap } from './utils/bootstrap-init';
import { ensureKenyaContext } from './utils/kenya-context.seed';
import { ensureChannelFinancialDefaults } from './utils/financial-bootstrap';

// Set process type for reliable worker context detection
process.env.VENDURE_PROCESS_TYPE = 'server';

// Initialize telemetry (must be done before any other application code)
initializeTelemetry(`${BRAND_CONFIG.servicePrefix}-server`);

const shouldRunBootstrapInit = process.env.SKIP_BOOTSTRAP_INIT !== '1';

// Initialize database (when required), then bootstrap for runtime
(shouldRunBootstrapInit
  ? initializeVendureBootstrap(config)
  : Promise.resolve().then(() => {
      console.log('⏭️  SKIP_BOOTSTRAP_INIT=1 detected, skipping bootstrap initialization');
    })
)
  .then(async () => {
    // Phase 2: Bootstrap fully for runtime (migrations already run, sync disabled)
    const runtimeConfig = {
      ...config,
      dbConnectionOptions: {
        ...config.dbConnectionOptions,
        migrationsRun: false, // Migrations already run by initializeVendureBootstrap
        synchronize: false, // Disable sync for production safety
      },
    };

    console.log('🚀 Starting Vendure server...');
    const app = await bootstrap(runtimeConfig);

    await ensureKenyaContext(app);
    await ensureChannelFinancialDefaults(app);

    return app;
  })
  .catch(err => {
    // Use console.error for bootstrap failures (logger not yet initialized)
    console.error('❌ Failed to start application:', err);
    process.exit(1);
  });

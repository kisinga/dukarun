/**
 * OpenTelemetry Telemetry Initialization
 *
 * This module initializes OpenTelemetry SDK before the application bootstrap.
 * It must be imported and executed before any other application code runs.
 *
 * Features:
 * - Automatic instrumentation for HTTP, GraphQL, PostgreSQL, Redis
 * - OTLP gRPC exporter to SigNoz
 * - Resource attributes (service name, version, environment)
 * - Graceful shutdown handling
 */

import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-grpc';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-grpc';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-grpc';
import type { Instrumentation } from '@opentelemetry/instrumentation';
import { registerInstrumentations } from '@opentelemetry/instrumentation';
import { ExpressInstrumentation } from '@opentelemetry/instrumentation-express';
import { GraphQLInstrumentation } from '@opentelemetry/instrumentation-graphql';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { IORedisInstrumentation } from '@opentelemetry/instrumentation-ioredis';
import { PgInstrumentation } from '@opentelemetry/instrumentation-pg';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';
import { BRAND_CONFIG } from '../../constants/brand.constants';
import { env } from '../config/environment.config';

let sdk: NodeSDK | null = null;
let initialized = false;
let shuttingDown = false;

/**
 * Initialize OpenTelemetry SDK
 * This should be called before application bootstrap
 */
export function initializeTelemetry(
  serviceName: string = `${BRAND_CONFIG.servicePrefix}-backend`
): void {
  // Skip initialization if observability is disabled
  if (!env.observability.enabled) {
    console.log('[Telemetry] Observability disabled, skipping OpenTelemetry initialization');
    return;
  }

  // Prevent double initialization
  if (initialized) {
    console.warn('[Telemetry] OpenTelemetry already initialized, skipping');
    return;
  }

  try {
    console.log('[Telemetry] Initializing OpenTelemetry SDK...');
    console.log(`[Telemetry] Service: ${env.observability.serviceName}`);
    console.log(`[Telemetry] Endpoint: ${env.observability.otlpGrpcEndpoint}`);

    // Create resource with service information
    const resource = resourceFromAttributes({
      [SemanticResourceAttributes.SERVICE_NAME]: env.observability.serviceName || serviceName,
      [SemanticResourceAttributes.SERVICE_VERSION]: env.observability.serviceVersion,
      [SemanticResourceAttributes.DEPLOYMENT_ENVIRONMENT]: env.app.nodeEnv,
    });

    // Create OTLP exporters
    const traceExporter = new OTLPTraceExporter({
      url: env.observability.otlpGrpcEndpoint,
    });

    const metricExporter = new OTLPMetricExporter({
      url: env.observability.otlpGrpcEndpoint,
    });

    const logExporter = new OTLPLogExporter({
      url: env.observability.otlpGrpcEndpoint,
    });

    // Register instrumentations
    const instrumentations: Instrumentation[] = [
      new HttpInstrumentation(),
      new ExpressInstrumentation(),
      new GraphQLInstrumentation(),
      new PgInstrumentation(),
      new IORedisInstrumentation(),
    ];

    registerInstrumentations({
      instrumentations: instrumentations,
    });

    // Initialize SDK
    sdk = new NodeSDK({
      resource,
      traceExporter,
      metricReader: new PeriodicExportingMetricReader({
        exporter: metricExporter,
        exportIntervalMillis: 5000,
      }),
      // Note: Log processors are configured via environment in newer SDK versions
    });

    // Start the SDK
    sdk.start();
    initialized = true;

    console.log('[Telemetry] OpenTelemetry SDK initialized successfully');

    // Handle graceful shutdown (ensure we only react once per process)
    const handleSignal = (signal: NodeJS.Signals | string) => {
      if (shuttingDown) {
        console.log(`[Telemetry] Shutdown already in progress, ignoring ${signal}`);
        return;
      }
      shuttingDown = true;
      console.log(`[Telemetry] Received ${signal}, shutting down OpenTelemetry SDK...`);
      shutdown().finally(() => {
        console.log('[Telemetry] Shutdown complete, exiting process');
        // Force process exit so dev workflows (npm/concurrently) don't hang
        process.exit(0);
      });
    };

    process.once('SIGTERM', handleSignal);
    process.once('SIGINT', handleSignal);
  } catch (error) {
    console.error('[Telemetry] Failed to initialize OpenTelemetry SDK:', error);
    // Don't throw - allow application to continue without telemetry
  }
}

/**
 * Shutdown OpenTelemetry SDK gracefully
 */
export function shutdown(): Promise<void> {
  return new Promise(resolve => {
    if (!sdk || !initialized) {
      resolve();
      return;
    }

    console.log('[Telemetry] Shutting down OpenTelemetry SDK...');
    sdk
      .shutdown()
      .then(() => {
        console.log('[Telemetry] OpenTelemetry SDK shut down successfully');
        initialized = false;
        sdk = null;
        resolve();
      })
      .catch(error => {
        console.error('[Telemetry] Error during shutdown:', error);
        resolve(); // Resolve anyway to allow process exit
      });
  });
}

/**
 * Check if telemetry is initialized
 */
export function isInitialized(): boolean {
  return initialized;
}

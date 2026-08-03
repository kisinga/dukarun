import { Module, Global } from '@nestjs/common';
import { TracingService } from './tracing.service';
import { MetricsService } from './metrics.service';
import { LoggingService } from './logging.service';

/**
 * Observability Module
 *
 * Provides centralized observability services for the application:
 * - TracingService: Manual span creation and management
 * - MetricsService: Custom business and performance metrics
 * - LoggingService: Structured logging with trace correlation
 *
 * This module is marked as @Global() so it can be imported once
 * and used throughout the application without re-importing.
 */
@Global()
@Module({
  providers: [TracingService, MetricsService, LoggingService],
  exports: [TracingService, MetricsService, LoggingService],
})
export class ObservabilityModule {}

import { Injectable } from '@nestjs/common';
import { Counter, Gauge, Histogram, Meter, metrics } from '@opentelemetry/api';
import { BRAND_CONFIG } from '../../constants/brand.constants';
import { env } from '../config/environment.config';

/**
 * Metrics Service
 *
 * Provides custom metrics for business and performance monitoring.
 * Metrics are automatically exported to SigNoz via OTLP.
 *
 * Example:
 * ```typescript
 * this.metricsService.recordOrderCreated('channel-1', 'cash', 5000);
 * this.metricsService.recordRequestDuration('createOrder', 0.25);
 * ```
 */
@Injectable()
export class MetricsService {
  private readonly meter: Meter;
  private readonly counters: Map<string, Counter> = new Map();
  private readonly histograms: Map<string, Histogram> = new Map();
  private readonly gauges: Map<string, Gauge> = new Map();

  constructor() {
    if (!env.observability.enabled) {
      // Create a no-op meter if observability is disabled
      this.meter = {
        createCounter: () =>
          ({
            add: () => {},
          }) as Counter,
        createHistogram: () =>
          ({
            record: () => {},
          }) as Histogram,
        createGauge: () =>
          ({
            record: () => {},
          }) as Gauge,
        createUpDownCounter: () =>
          ({
            add: () => {},
          }) as any,
        createObservableGauge: () =>
          ({
            addCallback: () => {},
          }) as any,
        createObservableCounter: () =>
          ({
            addCallback: () => {},
          }) as any,
        createObservableUpDownCounter: () =>
          ({
            addCallback: () => {},
          }) as any,
      } as unknown as Meter;
      return;
    }

    this.meter = metrics.getMeter(`${BRAND_CONFIG.servicePrefix}-metrics`);
    this.initializeMetrics();
  }

  /**
   * Initialize all metrics
   */
  private initializeMetrics(): void {
    // Business metrics
    this.createCounter('orders_created_total', 'Total number of orders created', [
      'channel_id',
      'payment_method',
    ]);
    this.createCounter('payments_processed_total', 'Total number of payments processed', [
      'channel_id',
      'method',
    ]);
    this.createCounter('ledger_postings_total', 'Total ledger postings', ['type', 'channel_id']);

    // Performance metrics
    this.createHistogram('request_duration_seconds', 'Request duration in seconds', [
      'route',
      'method',
      'status',
    ]);
    this.createHistogram('order_value_cents', 'Order value in cents', ['channel_id']);
    this.createHistogram('db_query_duration_seconds', 'Database query duration', [
      'operation',
      'table',
    ]);

    // Resource metrics
    this.createGauge('active_connections', 'Number of active database connections');
    this.createGauge('redis_connections', 'Number of active Redis connections');
  }

  /**
   * Create or get a counter metric
   */
  private createCounter(name: string, description: string, labelNames: string[] = []): Counter {
    if (this.counters.has(name)) {
      return this.counters.get(name)!;
    }

    const counter = this.meter.createCounter(name, {
      description,
    });

    this.counters.set(name, counter);
    return counter;
  }

  /**
   * Create or get a histogram metric
   */
  private createHistogram(name: string, description: string, labelNames: string[] = []): Histogram {
    if (this.histograms.has(name)) {
      return this.histograms.get(name)!;
    }

    const histogram = this.meter.createHistogram(name, {
      description,
    });

    this.histograms.set(name, histogram);
    return histogram;
  }

  /**
   * Create or get a gauge metric
   */
  private createGauge(name: string, description: string): Gauge {
    if (this.gauges.has(name)) {
      return this.gauges.get(name)!;
    }

    const gauge = this.meter.createGauge(name, {
      description,
    });

    this.gauges.set(name, gauge);
    return gauge;
  }

  /**
   * Record an order creation
   */
  recordOrderCreated(channelId: string, paymentMethod: string, valueCents: number): void {
    if (!env.observability.enabled) return;

    const counter = this.counters.get('orders_created_total');
    if (counter) {
      counter.add(1, { channel_id: channelId, payment_method: paymentMethod });
    }

    const histogram = this.histograms.get('order_value_cents');
    if (histogram) {
      histogram.record(valueCents, { channel_id: channelId });
    }
  }

  /**
   * Record a payment processing
   */
  recordPaymentProcessed(channelId: string, method: string): void {
    if (!env.observability.enabled) return;

    const counter = this.counters.get('payments_processed_total');
    if (counter) {
      counter.add(1, { channel_id: channelId, method });
    }
  }

  /**
   * Record a ledger posting
   */
  recordLedgerPosting(type: string, channelId: string): void {
    if (!env.observability.enabled) return;

    const counter = this.counters.get('ledger_postings_total');
    if (counter) {
      counter.add(1, { type, channel_id: channelId });
    }
  }

  /**
   * Record request duration
   */
  recordRequestDuration(
    route: string,
    method: string,
    status: number,
    durationSeconds: number
  ): void {
    if (!env.observability.enabled) return;

    const histogram = this.histograms.get('request_duration_seconds');
    if (histogram) {
      histogram.record(durationSeconds, {
        route,
        method,
        status: status.toString(),
      });
    }
  }

  /**
   * Record database query duration
   */
  recordDbQueryDuration(operation: string, table: string, durationSeconds: number): void {
    if (!env.observability.enabled) return;

    const histogram = this.histograms.get('db_query_duration_seconds');
    if (histogram) {
      histogram.record(durationSeconds, { operation, table });
    }
  }

  /**
   * Set active database connections gauge
   */
  setActiveConnections(count: number): void {
    if (!env.observability.enabled) return;

    const gauge = this.gauges.get('active_connections');
    if (gauge) {
      gauge.record(count);
    }
  }

  /**
   * Set Redis connections gauge
   */
  setRedisConnections(count: number): void {
    if (!env.observability.enabled) return;

    const gauge = this.gauges.get('redis_connections');
    if (gauge) {
      gauge.record(count);
    }
  }
}

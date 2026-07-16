import { inject, Injectable, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Span, SpanStatusCode, trace } from '@opentelemetry/api';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { registerInstrumentations } from '@opentelemetry/instrumentation';
import { FetchInstrumentation } from '@opentelemetry/instrumentation-fetch';
import { XMLHttpRequestInstrumentation } from '@opentelemetry/instrumentation-xml-http-request';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { WebTracerProvider } from '@opentelemetry/sdk-trace-web';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';
import { environment } from '../../../environments/environment';

/**
 * Tracing Service
 *
 * Provides frontend tracing capabilities using OpenTelemetry.
 * Automatically traces HTTP requests and allows manual span creation
 * for user actions.
 *
 * Example:
 * ```typescript
 * const span = this.tracingService.startSpan('createOrder', { orderId: '123' });
 * try {
 *   // Your logic
 *   this.tracingService.endSpan(span, true);
 * } catch (error) {
 *   this.tracingService.endSpan(span, false, error);
 * }
 * ```
 */
@Injectable({
  providedIn: 'root',
})
export class TracingService {
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private tracer = trace.getTracer(environment.serviceName || 'dukarun-frontend');
  private initialized = false;

  /**
   * Initialize OpenTelemetry tracing
   * Call this in app.component.ts ngOnInit or app.config.ts
   */
  initialize(): void {
    if (this.initialized) {
      return;
    }

    // Browser-only: OpenTelemetry web SDK touches window/location; skip on the server.
    if (!this.isBrowser) {
      return;
    }

    // Only enable if configured
    if (!environment.enableTracing) {
      console.log('[Tracing] Tracing disabled in environment');
      return;
    }

    if (!environment.signozEndpoint) {
      console.warn('[Tracing] SigNoz endpoint not configured');
      return;
    }

    try {
      console.log('[Tracing] Initializing OpenTelemetry SDK...');
      console.log(`[Tracing] Endpoint: ${environment.signozEndpoint}`);

      // Export to SigNoz via OTLP HTTP
      const traceExporter = new OTLPTraceExporter({
        url: environment.signozEndpoint,
      });

      const serviceName = environment.serviceName || 'dukarun-frontend';
      const serviceVersion = environment.serviceVersion || '2.0.0';

      const provider = new WebTracerProvider({
        resource: resourceFromAttributes({
          [SemanticResourceAttributes.SERVICE_NAME]: serviceName,
          [SemanticResourceAttributes.SERVICE_VERSION]: serviceVersion,
        }),
        spanProcessors: [new BatchSpanProcessor(traceExporter)],
      });

      // Register automatic instrumentations
      registerInstrumentations({
        instrumentations: [
          new FetchInstrumentation({
            // Automatically trace all fetch/HTTP calls
            // SigNoz endpoint is proxied via nginx (same-origin), so no CORS needed
            propagateTraceHeaderCorsUrls: [new RegExp(window.location.origin)],
          }),
          new XMLHttpRequestInstrumentation({
            // Automatically trace XMLHttpRequest calls
            // SigNoz endpoint is proxied via nginx (same-origin), so no CORS needed
            propagateTraceHeaderCorsUrls: [new RegExp(window.location.origin)],
          }),
        ],
      });

      // Register provider without Zone.js context manager (zoneless Angular)
      // The default context manager works fine for zoneless applications
      provider.register();

      this.tracer = trace.getTracer(serviceName);
      this.initialized = true;

      console.log('[Tracing] OpenTelemetry SDK initialized successfully');
    } catch (error) {
      console.error('[Tracing] Failed to initialize OpenTelemetry SDK:', error);
      // Don't throw - allow application to continue without tracing
    }
  }

  /**
   * Start a new span for a user action
   *
   * @param name - Span name (e.g., 'createOrder', 'addToCart')
   * @param attributes - Optional attributes to add to the span
   * @returns Span instance
   */
  startSpan(name: string, attributes?: Record<string, string | number | boolean>): Span {
    if (!this.initialized) {
      // Return a no-op span if not initialized
      return {
        spanContext: () => ({ traceId: '', spanId: '', traceFlags: 0 }),
        setAttribute: () => {},
        setAttributes: () => {},
        addEvent: () => {},
        addLink: () => {},
        addLinks: () => {},
        setStatus: () => {},
        updateName: () => {},
        end: () => {},
        isRecording: () => false,
        recordException: () => {},
      } as unknown as Span;
    }

    const span = this.tracer.startSpan(name);

    if (attributes) {
      Object.entries(attributes).forEach(([key, value]) => {
        span.setAttribute(key, value);
      });
    }

    return span;
  }

  /**
   * End a span with success or error status
   *
   * @param span - Span to end
   * @param success - Whether the operation succeeded
   * @param error - Optional error object if operation failed
   */
  endSpan(span: Span, success: boolean = true, error?: Error): void {
    if (!this.initialized) {
      return;
    }

    if (error) {
      span.recordException(error);
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error.message,
      });
    } else {
      span.setStatus({
        code: success ? SpanStatusCode.OK : SpanStatusCode.ERROR,
      });
    }

    span.end();
  }

  /**
   * Add an event to a span
   *
   * @param span - Span to add event to
   * @param name - Event name
   * @param attributes - Optional event attributes
   */
  addEvent(span: Span, name: string, attributes?: Record<string, string | number | boolean>): void {
    if (!this.initialized) {
      return;
    }

    span.addEvent(name, attributes);
  }

  /**
   * Set attributes on a span
   *
   * @param span - Span to set attributes on
   * @param attributes - Attributes to set
   */
  setAttributes(span: Span, attributes: Record<string, string | number | boolean>): void {
    if (!this.initialized) {
      return;
    }

    Object.entries(attributes).forEach(([key, value]) => {
      span.setAttribute(key, value);
    });
  }
}

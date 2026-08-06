import { Injectable } from '@nestjs/common';
import { context, Span, SpanStatusCode, trace } from '@opentelemetry/api';
import { BRAND_CONFIG } from '../../constants/brand.constants';
import { env } from '../config/environment.config';

/**
 * Tracing Service
 *
 * Provides manual span creation and management for business operations.
 * Use this service to add custom instrumentation to critical business logic.
 *
 * Example:
 * ```typescript
 * const span = this.tracingService.startSpan('createOrder', { orderId: '123' });
 * try {
 *   // Your business logic
 *   this.tracingService.addEvent(span, 'order.items.added', { count: 5 });
 *   this.tracingService.endSpan(span, true);
 * } catch (error) {
 *   this.tracingService.endSpan(span, false, error);
 * }
 * ```
 */
@Injectable()
export class TracingService {
  private readonly tracer = trace.getTracer(`${BRAND_CONFIG.servicePrefix}-tracer`);

  /**
   * Start a new span for a business operation
   *
   * @param name - Span name (e.g., 'createOrder', 'processPayment')
   * @param attributes - Optional attributes to add to the span
   * @returns Span instance
   */
  startSpan(name: string, attributes?: Record<string, string | number | boolean>): Span {
    if (!env.observability.enabled) {
      // Return a no-op span if observability is disabled
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
      this.setAttributes(span, attributes);
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
    if (!env.observability.enabled) {
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
    if (!env.observability.enabled) {
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
    if (!env.observability.enabled) {
      return;
    }

    Object.entries(attributes).forEach(([key, value]) => {
      span.setAttribute(key, value);
    });
  }

  /**
   * Get the current active span from context
   *
   * @returns Current span or undefined
   */
  getCurrentSpan(): Span | undefined {
    if (!env.observability.enabled) {
      return undefined;
    }

    return trace.getActiveSpan();
  }

  /**
   * Run a function within a span context
   *
   * @param span - Span to use as parent
   * @param fn - Function to execute
   * @returns Result of the function
   */
  async runInSpan<T>(span: Span, fn: () => Promise<T>): Promise<T> {
    if (!env.observability.enabled) {
      return fn();
    }

    return context.with(trace.setSpan(context.active(), span), async () => {
      return fn();
    });
  }
}

import { Injectable, LoggerService, Logger, LogLevel } from '@nestjs/common';
import { trace } from '@opentelemetry/api';
import { env } from '../config/environment.config';

/**
 * Logging Service
 *
 * Enhanced logger that automatically includes trace context in log messages.
 * This allows correlation between logs and traces in SigNoz.
 *
 * Usage:
 * ```typescript
 * private readonly logger = new LoggingService(MyService.name);
 * this.logger.log('Order created', { orderId: '123' });
 * ```
 */
@Injectable()
export class LoggingService implements LoggerService {
  private readonly logger: Logger;
  private context?: string;

  constructor(context?: string) {
    this.context = context;
    // Use NestJS Logger as the underlying logger
    this.logger = context ? new Logger(context) : new Logger();
  }

  /**
   * Get current trace ID from active span
   */
  private getTraceId(): string | undefined {
    if (!env.observability.enabled) {
      return undefined;
    }

    try {
      const span = trace.getActiveSpan();
      if (span) {
        const spanContext = span.spanContext();
        return spanContext.traceId;
      }
    } catch (error) {
      // Silently fail if trace context is not available
    }

    return undefined;
  }

  /**
   * Format log message with trace context
   */
  private formatMessage(message: any, ...optionalParams: any[]): [string, ...any[]] {
    const traceId = this.getTraceId();
    const contextPrefix = this.context ? `[${this.context}]` : '';
    const tracePrefix = traceId ? `[Trace: ${traceId.substring(0, 16)}]` : '';

    const prefix = [contextPrefix, tracePrefix].filter(Boolean).join(' ');

    if (typeof message === 'string') {
      return [`${prefix} ${message}`, ...optionalParams];
    }

    return [`${prefix}`, message, ...optionalParams];
  }

  /**
   * Write a log message
   */
  log(message: any, ...optionalParams: any[]): void {
    const [formattedMessage, ...params] = this.formatMessage(message, ...optionalParams);
    this.logger.log(formattedMessage, ...params);
  }

  /**
   * Write an error log message
   */
  error(message: any, trace?: string, context?: string): void {
    const [formattedMessage, ...params] = this.formatMessage(message);
    this.logger.error(formattedMessage, trace, context || this.context);
  }

  /**
   * Write a warning log message
   */
  warn(message: any, ...optionalParams: any[]): void {
    const [formattedMessage, ...params] = this.formatMessage(message, ...optionalParams);
    this.logger.warn(formattedMessage, ...params);
  }

  /**
   * Write a debug log message
   */
  debug(message: any, ...optionalParams: any[]): void {
    const [formattedMessage, ...params] = this.formatMessage(message, ...optionalParams);
    this.logger.debug(formattedMessage, ...params);
  }

  /**
   * Write a verbose log message
   */
  verbose(message: any, ...optionalParams: any[]): void {
    const [formattedMessage, ...params] = this.formatMessage(message, ...optionalParams);
    this.logger.verbose(formattedMessage, ...params);
  }

  /**
   * Set log levels
   */
  setLogLevels(levels: LogLevel[]): void {
    // NestJS Logger doesn't have setLogLevels, so we skip it
    // Log levels are typically controlled via environment variables
  }
}

import { Injectable, Logger } from '@nestjs/common';

/**
 * Registration Error Service
 *
 * Provides consistent error handling and prefixing for registration operations.
 * All errors should use REGISTRATION_ prefix for easy filtering and debugging.
 */
@Injectable()
export class RegistrationErrorService {
  private readonly logger = new Logger(RegistrationErrorService.name);
  /**
   * Wrap error with REGISTRATION_ prefix if not already present
   */
  wrapError(error: any, operation: string): Error {
    const message = error?.message || 'Unknown error';

    if (message.startsWith('REGISTRATION_')) {
      return error instanceof Error ? error : new Error(message);
    }

    return new Error(`REGISTRATION_${operation}: ${message}`);
  }

  /**
   * Create error with REGISTRATION_ prefix
   */
  createError(operation: string, message: string): Error {
    return new Error(`REGISTRATION_${operation}: ${message}`);
  }

  /**
   * Log error with context
   */
  logError(context: string, error: any, operation: string): void {
    this.logger.error(`[${context}] ${operation} failed:`, error);
    if (error?.stack) {
      this.logger.error(`[${context}] Error stack: ${error.stack}`);
    }
  }
}

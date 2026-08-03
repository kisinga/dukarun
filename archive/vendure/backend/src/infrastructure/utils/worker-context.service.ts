import { Injectable, Logger } from '@nestjs/common';

/**
 * Worker Context Service
 *
 * Provides utilities to detect if code is running in a worker process.
 * Uses environment variable VENDURE_PROCESS_TYPE set at process start as the single source of truth.
 * This variable must be set in index.ts ('server') or index-worker.ts ('worker').
 */
@Injectable()
export class WorkerContextService {
  private readonly logger = new Logger(WorkerContextService.name);

  /**
   * Check if code is running in a worker process
   * @returns true if running in worker, false if in server process
   * @throws Error if VENDURE_PROCESS_TYPE is not set (configuration error)
   */
  isWorkerProcess(): boolean {
    const processType = process.env.VENDURE_PROCESS_TYPE?.trim();

    if (!processType) {
      const error = new Error(
        'VENDURE_PROCESS_TYPE environment variable is not set. ' +
          'This must be set to "server" or "worker" at process start. ' +
          'Check index.ts and index-worker.ts to ensure it is set correctly.'
      );
      this.logger.error(error.message);
      throw error;
    }

    if (processType === 'worker') {
      return true;
    }

    if (processType === 'server') {
      return false;
    }

    // Invalid value - fail fast
    const error = new Error(
      `Invalid VENDURE_PROCESS_TYPE value: "${processType}". Must be "server" or "worker".`
    );
    this.logger.error(error.message);
    throw error;
  }

  /**
   * Assert that code is running in worker process
   * @throws Error if not in worker process
   */
  assertWorkerProcess(): void {
    if (!this.isWorkerProcess()) {
      throw new Error('This operation can only be performed in a worker process');
    }
  }
}

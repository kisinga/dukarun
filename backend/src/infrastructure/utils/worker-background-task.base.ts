import { Logger, OnApplicationBootstrap } from '@nestjs/common';
import { WorkerContextService } from './worker-context.service';

/**
 * Base class for background tasks that should only run in worker processes.
 *
 * Subclasses should implement `initializeTask()` instead of `onApplicationBootstrap()`.
 * The base class ensures the task only runs in worker processes.
 *
 * Usage:
 * ```typescript
 * @Injectable()
 * export class MyBackgroundTask extends WorkerBackgroundTaskBase {
 *   constructor(
 *     workerContext: WorkerContextService,
 *     // ... other dependencies
 *   ) {
 *     super(workerContext, 'MyBackgroundTask');
 *   }
 *
 *   protected initializeTask(): void {
 *     // Your initialization logic here
 *   }
 * }
 * ```
 */
export abstract class WorkerBackgroundTaskBase implements OnApplicationBootstrap {
  protected readonly logger: Logger;

  constructor(
    protected readonly workerContext: WorkerContextService,
    taskName: string
  ) {
    this.logger = new Logger(taskName);
  }

  onApplicationBootstrap(): void {
    if (!this.workerContext.isWorkerProcess()) {
      this.logger.debug('Skipping background task - not running in worker process');
      return;
    }

    this.logger.log('Initializing background task in worker process');
    this.initializeTask();
  }

  /**
   * Initialize the background task.
   * This method is only called when running in a worker process.
   */
  protected abstract initializeTask(): void;
}

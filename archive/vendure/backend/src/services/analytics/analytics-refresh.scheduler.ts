import { Injectable } from '@nestjs/common';
import { WorkerBackgroundTaskBase } from '../../infrastructure/utils/worker-background-task.base';
import { WorkerContextService } from '../../infrastructure/utils/worker-context.service';
import { AnalyticsQueryService } from './analytics-query.service';

const REFRESH_INTERVAL_MS = 60 * 60 * 1000; // 60 minutes
const STARTUP_DELAY_MS = 10_000; // 10 seconds

@Injectable()
export class AnalyticsRefreshScheduler extends WorkerBackgroundTaskBase {
  constructor(
    workerContext: WorkerContextService,
    private readonly analyticsQueryService: AnalyticsQueryService
  ) {
    super(workerContext, 'AnalyticsRefreshScheduler');
  }

  protected initializeTask(): void {
    // Initial refresh after startup delay
    setTimeout(() => this.refresh(), STARTUP_DELAY_MS);

    // Periodic refresh
    setInterval(() => this.refresh(), REFRESH_INTERVAL_MS);
  }

  private async refresh(): Promise<void> {
    const start = Date.now();
    try {
      await this.analyticsQueryService.refreshAll();
      this.logger.log(`Materialized views refreshed in ${Date.now() - start}ms`);
    } catch (err: any) {
      this.logger.error(`Failed to refresh materialized views: ${err?.message}`);
    }
  }
}

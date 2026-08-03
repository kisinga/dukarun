import { PluginCommonModule, VendurePlugin } from '@vendure/core';
import { VENDURE_COMPATIBILITY_VERSION } from '../../constants/vendure-version.constants';
import { WorkerContextService } from '../../infrastructure/utils/worker-context.service';
import { AnalyticsQueryService } from '../../services/analytics/analytics-query.service';
import { AnalyticsRefreshScheduler } from '../../services/analytics/analytics-refresh.scheduler';
import { AnalyticsStatsResolver } from './analytics-stats.resolver';
import { ANALYTICS_STATS_SCHEMA } from './analytics-stats.schema';

@VendurePlugin({
  imports: [PluginCommonModule],
  providers: [
    WorkerContextService,
    AnalyticsQueryService,
    AnalyticsRefreshScheduler,
    AnalyticsStatsResolver,
  ],
  exports: [AnalyticsQueryService],
  adminApiExtensions: {
    schema: ANALYTICS_STATS_SCHEMA,
    resolvers: [AnalyticsStatsResolver],
  },
  compatibility: VENDURE_COMPATIBILITY_VERSION,
})
export class AnalyticsPlugin {}

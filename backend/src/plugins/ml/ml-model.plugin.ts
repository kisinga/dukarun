import { PluginCommonModule, VendurePlugin } from '@vendure/core';
import { VENDURE_COMPATIBILITY_VERSION } from '../../constants/vendure-version.constants';
import { AuditDbConnection } from '../../infrastructure/audit/audit-db.connection';
import { AuditService } from '../../infrastructure/audit/audit.service';
import { UserContextResolver } from '../../infrastructure/audit/user-context.resolver';
import { MlAutoExtractService } from '../../services/ml/ml-auto-extract.service';
import { MlExtractionQueueService } from '../../services/ml/ml-extraction-queue.service';
import { MlExtractionQueueSubscriber } from './ml-extraction-queue.subscriber';
import { ML_MODEL_SCHEMA, MlModelResolver } from './ml-model-resolver';
import { MlTrainingService } from '../../services/ml/ml-training.service';
import { MlWebhookService } from '../../services/ml/ml-webhook.service';
import { ChannelUpdateHelper } from '../../services/channels/channel-update.helper';
import { ChannelEventsPlugin } from '../channels/channel-events.plugin';

/**
 * ML Model Plugin
 *
 * Provides GraphQL API for managing ML models per channel.
 * ML model files are stored as Vendure Assets and linked to channels via custom fields.
 *
 * Usage:
 * 1. Upload files via Admin UI (Catalog → Assets)
 * 2. Use linkMlModelAssets mutation to link them to channel
 * 3. Query model info via Shop API or Admin API
 * 4. Model files are served automatically by AssetServerPlugin
 */
@VendurePlugin({
  imports: [PluginCommonModule, ChannelEventsPlugin],
  providers: [
    // Audit dependencies for ChannelUpdateHelper
    AuditDbConnection,
    UserContextResolver,
    AuditService,
    // Channel update helper
    ChannelUpdateHelper,
    // ML services
    MlModelResolver,
    MlTrainingService,
    MlAutoExtractService,
    MlWebhookService,
    MlExtractionQueueService,
    MlExtractionQueueSubscriber,
  ],
  adminApiExtensions: {
    schema: ML_MODEL_SCHEMA,
    resolvers: [MlModelResolver],
  },
  shopApiExtensions: {
    schema: ML_MODEL_SCHEMA,
    resolvers: [MlModelResolver],
  },
  compatibility: VENDURE_COMPATIBILITY_VERSION,
})
export class MlModelPlugin {}

import { PluginCommonModule, VendurePlugin } from '@vendure/core';
import { VENDURE_COMPATIBILITY_VERSION } from '../../constants/vendure-version.constants';
import { LedgerPlugin } from '../ledger/ledger.plugin';
import { CommunicationPlugin } from '../communication/communication.plugin';
import { NotificationCoreModule } from '../../services/notifications/notification-core.module';
import { ChannelCommunicationService } from '../../services/channels/channel-communication.service';
import { AccountNotificationDeliveryService } from '../../services/channels/account-notification-delivery.service';
import { NotificationSubscriber } from '../../infrastructure/events/notification.subscriber';
import { AuditService } from '../../infrastructure/audit/audit.service';
import { AuditDbConnection } from '../../infrastructure/audit/audit-db.connection';
import { UserContextResolver } from '../../infrastructure/audit/user-context.resolver';

import { WorkerContextService } from '../../infrastructure/utils/worker-context.service';

/**
 * Channel Events Plugin
 *
 * Provides event-driven notifications for channel-specific actions.
 * Uses Vendure's native EventBus with typed event classes.
 *
 * Architecture (simplified):
 * - Services publish typed events to EventBus
 * - NotificationSubscriber listens and dispatches notifications
 * - NotificationService handles user preferences
 */
@VendurePlugin({
  imports: [PluginCommonModule, LedgerPlugin, CommunicationPlugin, NotificationCoreModule],
  providers: [
    // Worker context service (required for background tasks)
    WorkerContextService,

    // Audit dependencies
    AuditDbConnection,
    UserContextResolver,
    AuditService,

    // Account balance notifications to customer (SMS/email; composable for supplier later)
    AccountNotificationDeliveryService,

    // Channel communication (publishes events; NotificationSubscriber handles delivery)
    ChannelCommunicationService,

    // Event subscriber (listens to typed DukaHub events)
    NotificationSubscriber,
  ],
  compatibility: VENDURE_COMPATIBILITY_VERSION,
})
export class ChannelEventsPlugin {}

import { PluginCommonModule, VendurePlugin } from '@vendure/core';
import { VENDURE_COMPATIBILITY_VERSION } from '../../constants/vendure-version.constants';
import { CommunicationPlugin } from '../communication/communication.plugin';
import { NotificationService } from '../../services/notifications/notification.service';
import { PushNotificationService } from '../../services/notifications/push-notification.service';
import { AdminNotificationService } from '../../services/notifications/admin-notification.service';
import { ChannelCommunicationService } from '../../services/channels/channel-communication.service';
import { AccountNotificationDeliveryService } from '../../services/channels/account-notification-delivery.service';
import { NotificationSubscriber } from '../../infrastructure/events/notification.subscriber';
import { AuditService } from '../../infrastructure/audit/audit.service';
import { AuditDbConnection } from '../../infrastructure/audit/audit-db.connection';
import { UserContextResolver } from '../../infrastructure/audit/user-context.resolver';
import { ChannelUserService } from '../../services/auth/channel-user.service';

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
  imports: [PluginCommonModule, CommunicationPlugin],
  providers: [
    // Worker context service (required for background tasks)
    WorkerContextService,

    // Audit dependencies
    AuditDbConnection,
    UserContextResolver,
    AuditService,

    // Core services
    ChannelUserService,

    // Notification services
    NotificationService,
    PushNotificationService,
    AdminNotificationService,

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

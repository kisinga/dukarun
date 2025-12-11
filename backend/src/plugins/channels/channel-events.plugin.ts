import { PluginCommonModule, VendurePlugin } from '@vendure/core';
import { VENDURE_COMPATIBILITY_VERSION } from '../../constants/vendure-version.constants';
import { NotificationService } from '../../services/notifications/notification.service';
import { PushNotificationService } from '../../services/notifications/push-notification.service';
import { SmsProviderFactory } from '../../infrastructure/sms/sms-provider.factory';
import { SmsService } from '../../infrastructure/sms/sms.service';
import { ChannelCommunicationService } from '../../services/channels/channel-communication.service';
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
  imports: [PluginCommonModule],
  providers: [
    // Worker context service (required for background tasks)
    WorkerContextService,

    // Audit dependencies
    AuditDbConnection,
    UserContextResolver,
    AuditService,

    // Channel update helper

    // Core services
    ChannelUserService,

    // SMS infrastructure
    SmsProviderFactory,
    SmsService,

    // Notification services
    NotificationService,
    PushNotificationService,

    // Communication services
    ChannelCommunicationService,

    // Event subscriber (listens to typed DukaHub events)
    NotificationSubscriber,
  ],
  exports: [SmsService],
  compatibility: VENDURE_COMPATIBILITY_VERSION,
})
export class ChannelEventsPlugin {}

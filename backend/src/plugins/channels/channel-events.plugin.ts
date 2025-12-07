import { PluginCommonModule, VendurePlugin } from '@vendure/core';
import { VENDURE_COMPATIBILITY_VERSION } from '../../constants/vendure-version.constants';
import { NotificationService } from '../../services/notifications/notification.service';
import { PushNotificationService } from '../../services/notifications/push-notification.service';
import { SmsProviderFactory } from '../../infrastructure/sms/sms-provider.factory';
import { SmsService } from '../../infrastructure/sms/sms.service';
import { ChannelActionTrackingService } from '../../infrastructure/events/channel-action-tracking.service';
import { ChannelCommunicationService } from '../../services/channels/channel-communication.service';
import { ChannelEventRouterService } from '../../infrastructure/events/channel-event-router.service';
import { ChannelSmsService } from '../../infrastructure/events/channel-sms.service';
import { InAppActionHandler } from '../../infrastructure/events/handlers/in-app-action.handler';
import { PushActionHandler } from '../../infrastructure/events/handlers/push-action.handler';
import { SmsActionHandler } from '../../infrastructure/events/handlers/sms-action.handler';
import { NotificationPreferenceService } from '../../infrastructure/events/notification-preference.service';
import { AuditService } from '../../infrastructure/audit/audit.service';
import { AuditDbConnection } from '../../infrastructure/audit/audit-db.connection';
import { UserContextResolver } from '../../infrastructure/audit/user-context.resolver';
import { ChannelUserService } from '../../services/auth/channel-user.service';
import { ChannelUpdateHelper } from '../../services/channels/channel-update.helper';
import { PhoneNumberResolver } from '../../infrastructure/events/utils/phone-number-resolver';
import { WorkerContextService } from '../../infrastructure/utils/worker-context.service';

/**
 * Channel Events Plugin
 *
 * Provides a centralized, event-driven framework for channel-specific actions.
 * Handles SMS, email, push notifications, and in-app notifications with per-channel
 * configuration and user subscription preferences.
 */
@VendurePlugin({
  imports: [PluginCommonModule],
  providers: [
    // Worker context service (required for background task event routing)
    WorkerContextService,
    // Audit dependencies (must be available for ChannelEventRouterService and ChannelUpdateHelper)
    // AuditDbConnection uses singleton pattern to prevent duplicate initialization
    AuditDbConnection,
    UserContextResolver,
    AuditService,

    // Channel update helper (must be before ChannelActionTrackingService which uses it)
    ChannelUpdateHelper,
    // Core services
    ChannelUserService,
    // ChannelActionTrackingService must come before ChannelEventRouterService (which depends on it)
    ChannelActionTrackingService,
    ChannelEventRouterService,
    SmsProviderFactory, // Required by SmsService
    SmsService, // Required by ChannelSmsService
    ChannelSmsService,
    NotificationPreferenceService,

    // Utilities
    PhoneNumberResolver, // Required by SmsActionHandler

    // Required services for action handlers
    NotificationService, // Required by InAppActionHandler
    PushNotificationService, // Required by PushActionHandler

    // Action handlers
    InAppActionHandler,
    PushActionHandler,
    SmsActionHandler,

    // Communication services
    ChannelCommunicationService,
  ],
  exports: [
    ChannelEventRouterService,
    ChannelActionTrackingService,
    ChannelSmsService,
    NotificationPreferenceService,
    ChannelUpdateHelper, // Export for use in other plugins
  ],
  compatibility: VENDURE_COMPATIBILITY_VERSION,
})
export class ChannelEventsPlugin {}

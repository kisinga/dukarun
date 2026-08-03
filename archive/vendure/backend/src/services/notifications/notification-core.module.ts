import { Module } from '@nestjs/common';
import { PluginCommonModule } from '@vendure/core';
import { CommunicationPlugin } from '../../plugins/communication/communication.plugin';
import { ChannelUserService } from '../auth/channel-user.service';
import { AdminNotificationService } from './admin-notification.service';
import { NotificationCalendarService } from './notification-calendar.service';
import { NotificationSchedulingService } from './notification-scheduling.service';
import { OutboundDeliveryService } from './outbound-delivery.service';
import { PendingNotificationService } from './pending-notification.service';
import { NotificationService } from './notification.service';
import { PushNotificationService } from './push-notification.service';

/**
 * Shared NestJS module for notification infrastructure.
 *
 * VendurePlugin modules that need OutboundDeliveryService / NotificationSchedulingService
 * import this module instead of NotificationPlugin, so the GraphQL resolver/schema from
 * NotificationPlugin is not pulled into their plugin context.
 */
@Module({
  imports: [PluginCommonModule, CommunicationPlugin],
  providers: [
    ChannelUserService,
    NotificationService,
    PushNotificationService,
    OutboundDeliveryService,
    AdminNotificationService,
    PendingNotificationService,
    NotificationCalendarService,
    NotificationSchedulingService,
  ],
  exports: [
    ChannelUserService,
    NotificationService,
    PushNotificationService,
    OutboundDeliveryService,
    AdminNotificationService,
    PendingNotificationService,
    NotificationCalendarService,
    NotificationSchedulingService,
  ],
})
export class NotificationCoreModule {}

import { Module } from '@nestjs/common';
import { CommunicationPlugin } from '../../plugins/communication/communication.plugin';
import { ChannelUserService } from '../auth/channel-user.service';
import { AdminNotificationService } from './admin-notification.service';
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
  imports: [CommunicationPlugin],
  providers: [
    ChannelUserService,
    NotificationService,
    PushNotificationService,
    OutboundDeliveryService,
    AdminNotificationService,
    PendingNotificationService,
    NotificationSchedulingService,
  ],
  exports: [
    NotificationService,
    PushNotificationService,
    OutboundDeliveryService,
    AdminNotificationService,
    PendingNotificationService,
    NotificationSchedulingService,
  ],
})
export class NotificationCoreModule {}

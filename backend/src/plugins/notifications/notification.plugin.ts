import { PluginCommonModule, VendurePlugin } from '@vendure/core';
import { VENDURE_COMPATIBILITY_VERSION } from '../../constants/vendure-version.constants';
import { CommunicationPlugin } from '../communication/communication.plugin';
import { NotificationResolver, notificationSchema } from './notification.resolver';
import {
  NotificationService,
  Notification,
  PushSubscription,
} from '../../services/notifications/notification.service';
import { NotificationTestController } from './notification-test.controller';
import { PushNotificationService } from '../../services/notifications/push-notification.service';
import { AdminNotificationService } from '../../services/notifications/admin-notification.service';
import { OutboundDeliveryService } from '../../services/notifications/outbound-delivery.service';
import { ChannelUserService } from '../../services/auth/channel-user.service';
import { PendingNotification } from '../../services/notifications/pending-notification.entity';
import { PendingNotificationService } from '../../services/notifications/pending-notification.service';
import { NotificationSchedulingService } from '../../services/notifications/notification-scheduling.service';

@VendurePlugin({
  imports: [PluginCommonModule, CommunicationPlugin],
  providers: [
    NotificationResolver,
    NotificationService,
    PushNotificationService,
    OutboundDeliveryService,
    AdminNotificationService,
    ChannelUserService,
    PendingNotificationService,
    NotificationSchedulingService,
  ],
  exports: [NotificationService, OutboundDeliveryService, NotificationSchedulingService],
  controllers: [NotificationTestController],
  entities: [Notification, PushSubscription, PendingNotification],
  adminApiExtensions: {
    resolvers: [NotificationResolver],
    schema: notificationSchema,
  },
  compatibility: VENDURE_COMPATIBILITY_VERSION,
})
export class NotificationPlugin {}

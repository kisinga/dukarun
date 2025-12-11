import { PluginCommonModule, VendurePlugin } from '@vendure/core';
import { VENDURE_COMPATIBILITY_VERSION } from '../../constants/vendure-version.constants';
import { NotificationResolver, notificationSchema } from './notification.resolver';
import {
  NotificationService,
  Notification,
  PushSubscription,
} from '../../services/notifications/notification.service';
import { NotificationTestController } from './notification-test.controller';
import { PushNotificationService } from '../../services/notifications/push-notification.service';
import { AdminNotificationService } from '../../services/notifications/admin-notification.service';
import { ChannelUserService } from '../../services/auth/channel-user.service';

@VendurePlugin({
  imports: [PluginCommonModule],
  providers: [
    NotificationResolver,
    NotificationService,
    PushNotificationService,
    AdminNotificationService,
    ChannelUserService,
  ],
  controllers: [NotificationTestController],
  entities: [Notification, PushSubscription],
  adminApiExtensions: {
    resolvers: [NotificationResolver],
    schema: notificationSchema,
  },
  compatibility: VENDURE_COMPATIBILITY_VERSION,
})
export class NotificationPlugin {}

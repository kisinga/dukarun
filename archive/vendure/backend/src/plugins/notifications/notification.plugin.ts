import { PluginCommonModule, VendurePlugin } from '@vendure/core';
import { VENDURE_COMPATIBILITY_VERSION } from '../../constants/vendure-version.constants';
import { NotificationCoreModule } from '../../services/notifications/notification-core.module';
import { NotificationResolver, notificationSchema } from './notification.resolver';
import { Notification, PushSubscription } from '../../services/notifications/notification.service';
import { NotificationTestController } from './notification-test.controller';
import { PendingNotification } from '../../services/notifications/pending-notification.entity';

@VendurePlugin({
  imports: [PluginCommonModule, NotificationCoreModule],
  providers: [NotificationResolver],
  exports: [NotificationResolver],
  controllers: [NotificationTestController],
  entities: [Notification, PushSubscription, PendingNotification],
  adminApiExtensions: {
    resolvers: [NotificationResolver],
    schema: notificationSchema,
  },
  compatibility: VENDURE_COMPATIBILITY_VERSION,
})
export class NotificationPlugin {}

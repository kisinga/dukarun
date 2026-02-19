import { PluginCommonModule, VendurePlugin } from '@vendure/core';
import { VENDURE_COMPATIBILITY_VERSION } from '../../constants/vendure-version.constants';
import { AuditCorePlugin } from '../audit/audit-core.plugin';
import { AnalyticsPlugin } from '../analytics/analytics.plugin';
import { ChannelSettingsPlugin } from '../channels/channel-settings.plugin';
import { NotificationPlugin } from '../notifications/notification.plugin';
import { PendingRegistrationsService } from './pending-registrations.service';
import { PlatformAdminService } from './platform-admin.service';
import { PlatformStatsService } from './platform-stats.service';
import { SuperAdminResolver } from './super-admin.resolver';
import { SUPER_ADMIN_SCHEMA } from './super-admin.schema';

@VendurePlugin({
  imports: [
    PluginCommonModule,
    AnalyticsPlugin,
    AuditCorePlugin,
    ChannelSettingsPlugin,
    NotificationPlugin,
  ],
  providers: [
    PlatformStatsService,
    PlatformAdminService,
    PendingRegistrationsService,
    SuperAdminResolver,
  ],
  adminApiExtensions: {
    schema: SUPER_ADMIN_SCHEMA,
    resolvers: [SuperAdminResolver],
  },
  compatibility: VENDURE_COMPATIBILITY_VERSION,
})
export class SuperAdminPlugin {}

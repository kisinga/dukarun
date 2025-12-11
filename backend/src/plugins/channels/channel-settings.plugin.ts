import { PluginCommonModule, VendurePlugin } from '@vendure/core';
import { VENDURE_COMPATIBILITY_VERSION } from '../../constants/vendure-version.constants';
import { AuditDbConnection } from '../../infrastructure/audit/audit-db.connection';
import { AuditService } from '../../infrastructure/audit/audit.service';
import { UserContextResolver } from '../../infrastructure/audit/user-context.resolver';
import { ChannelSettingsService } from '../../services/channels/channel-settings.service';

import { ChannelSettingsResolver, channelSettingsSchema } from './channel-settings.resolver';
import { ChannelEventsPlugin } from './channel-events.plugin';

@VendurePlugin({
  imports: [PluginCommonModule, ChannelEventsPlugin],
  providers: [
    // Audit dependencies
    AuditDbConnection,
    UserContextResolver,
    AuditService,
    // Channel update helper

    // Channel settings
    ChannelSettingsResolver,
    ChannelSettingsService,
  ],
  adminApiExtensions: {
    resolvers: [ChannelSettingsResolver],
    schema: channelSettingsSchema,
  },
  compatibility: VENDURE_COMPATIBILITY_VERSION,
})
export class ChannelSettingsPlugin {}

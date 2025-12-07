import { PluginCommonModule, VendurePlugin } from '@vendure/core';
import { VENDURE_COMPATIBILITY_VERSION } from '../../constants/vendure-version.constants';
import { AuditDbConnection } from '../../infrastructure/audit/audit-db.connection';
import { AuditService } from '../../infrastructure/audit/audit.service';
import { UserContextResolver } from '../../infrastructure/audit/user-context.resolver';
import { ChannelSettingsService } from '../../services/channels/channel-settings.service';
import { ChannelUpdateHelper } from '../../services/channels/channel-update.helper';
import { ChannelStatusSubscriber } from '../../infrastructure/channels/channel-status.subscriber';
import { ChannelSettingsResolver, channelSettingsSchema } from './channel-settings.resolver';
import { ChannelEventsPlugin } from './channel-events.plugin';

@VendurePlugin({
  imports: [PluginCommonModule, ChannelEventsPlugin],
  providers: [
    // Audit dependencies (must be available for ChannelSettingsService)
    // AuditDbConnection uses singleton pattern to prevent duplicate initialization
    AuditDbConnection,
    UserContextResolver,
    AuditService,
    // Channel status subscriber (listens to Vendure ChannelEvent)
    ChannelStatusSubscriber,
    // Channel update helper (must be before ChannelSettingsService)
    ChannelUpdateHelper,
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

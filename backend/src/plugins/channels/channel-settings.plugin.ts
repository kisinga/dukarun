import { PluginCommonModule, VendurePlugin } from '@vendure/core';
import { VENDURE_COMPATIBILITY_VERSION } from '../../constants/vendure-version.constants';
import { RoleTemplateAssignment } from '../../domain/role-template/role-template-assignment.entity';
import { RoleTemplate } from '../../domain/role-template/role-template.entity';
import { AuditDbConnection } from '../../infrastructure/audit/audit-db.connection';
import { AuditService } from '../../infrastructure/audit/audit.service';
import { UserContextResolver } from '../../infrastructure/audit/user-context.resolver';
import { ChannelSettingsService } from '../../services/channels/channel-settings.service';

import { ChannelSettingsResolver, channelSettingsSchema } from './channel-settings.resolver';
import { ChannelEventsPlugin } from './channel-events.plugin';
import { ChannelAdminService } from '../../services/channels/channel-admin.service';
import { ChannelPaymentService } from '../../services/channels/channel-payment.service';
import { RoleTemplateService } from '../../services/channels/role-template.service';
import { CommunicationPlugin } from '../communication/communication.plugin';

@VendurePlugin({
  imports: [PluginCommonModule, ChannelEventsPlugin, CommunicationPlugin],
  entities: [RoleTemplate, RoleTemplateAssignment],
  providers: [
    RoleTemplateService,
    // Audit dependencies
    AuditDbConnection,
    UserContextResolver,
    AuditService,
    // Channel settings
    ChannelSettingsResolver,
    ChannelSettingsService,
    ChannelAdminService,
    ChannelPaymentService,
  ],
  exports: [ChannelSettingsService, ChannelAdminService, RoleTemplateService],
  adminApiExtensions: {
    resolvers: [ChannelSettingsResolver],
    schema: channelSettingsSchema,
  },
  compatibility: VENDURE_COMPATIBILITY_VERSION,
})
export class ChannelSettingsPlugin {}

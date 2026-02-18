import { PluginCommonModule, VendurePlugin } from '@vendure/core';
import { VENDURE_COMPATIBILITY_VERSION } from '../../constants/vendure-version.constants';
import { PlatformStatsService } from './platform-stats.service';
import { SuperAdminResolver } from './super-admin.resolver';
import { SUPER_ADMIN_SCHEMA } from './super-admin.schema';

@VendurePlugin({
  imports: [PluginCommonModule],
  providers: [PlatformStatsService, SuperAdminResolver],
  adminApiExtensions: {
    schema: SUPER_ADMIN_SCHEMA,
    resolvers: [SuperAdminResolver],
  },
  compatibility: VENDURE_COMPATIBILITY_VERSION,
})
export class SuperAdminPlugin {}

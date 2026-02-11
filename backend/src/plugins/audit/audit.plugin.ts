import { PluginCommonModule, VendurePlugin } from '@vendure/core';
import { VENDURE_COMPATIBILITY_VERSION } from '../../constants/vendure-version.constants';
import { VendureEventAuditSubscriber } from '../../infrastructure/audit/vendure-events.subscriber';
import { AuditResolver, auditSchema } from './audit.resolver';
import { AuditCorePlugin } from './audit-core.plugin';

/**
 * Audit Plugin
 *
 * Provides comprehensive audit logging and GraphQL API for querying audit logs.
 * Depends on AuditCorePlugin for AuditService (so other plugins can import
 * AuditCorePlugin only and avoid pulling in the auditLogs resolver).
 */
@VendurePlugin({
  imports: [PluginCommonModule, AuditCorePlugin],
  providers: [VendureEventAuditSubscriber, AuditResolver],
  adminApiExtensions: {
    schema: auditSchema,
    resolvers: [AuditResolver],
  },
  compatibility: VENDURE_COMPATIBILITY_VERSION,
})
export class AuditPlugin {}

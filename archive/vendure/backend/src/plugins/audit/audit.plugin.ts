import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { PluginCommonModule, VendurePlugin } from '@vendure/core';
import { VENDURE_COMPATIBILITY_VERSION } from '../../constants/vendure-version.constants';
import { AuditLogInterceptor } from '../../infrastructure/audit/audit-log.interceptor';
import { MutationAuditGuard } from '../../infrastructure/audit/mutation-audit.guard';
import { VendureEventAuditSubscriber } from '../../infrastructure/audit/vendure-events.subscriber';
import { AuditResolver, auditSchema } from './audit.resolver';
import { AuditCorePlugin } from './audit-core.plugin';

/**
 * Audit Plugin
 *
 * Provides comprehensive audit logging and GraphQL API for querying audit logs.
 * Depends on AuditCorePlugin for AuditService (so other plugins can import
 * AuditCorePlugin only and avoid pulling in the auditLogs resolver).
 *
 * Enforces audit logging via:
 * - AuditLogInterceptor: automatically logs mutations with @AuditLog decorator
 * - MutationAuditGuard: fallback logging for all other mutations (including Vendure built-ins)
 */
@VendurePlugin({
  imports: [PluginCommonModule, AuditCorePlugin],
  providers: [
    VendureEventAuditSubscriber,
    AuditResolver,
    AuditLogInterceptor,
    MutationAuditGuard,
    {
      provide: APP_INTERCEPTOR,
      useClass: AuditLogInterceptor,
    },
    {
      provide: APP_GUARD,
      useClass: MutationAuditGuard,
    },
  ],
  adminApiExtensions: {
    schema: auditSchema,
    resolvers: [AuditResolver],
  },
  compatibility: VENDURE_COMPATIBILITY_VERSION,
})
export class AuditPlugin {}

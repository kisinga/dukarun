import { PluginCommonModule, VendurePlugin } from '@vendure/core';
import { VENDURE_COMPATIBILITY_VERSION } from '../../constants/vendure-version.constants';
import { AdminLoginAttemptService } from '../../infrastructure/audit/admin-login-attempt.service';
import { AuditDbConnection } from '../../infrastructure/audit/audit-db.connection';
import { AuditService } from '../../infrastructure/audit/audit.service';
import { UserContextResolver } from '../../infrastructure/audit/user-context.resolver';

/**
 * Audit core plugin – providers only (no GraphQL).
 * Import this when you need AuditService without the auditLogs query.
 * Use AuditPlugin when you need the full audit API (query + logging).
 */
@VendurePlugin({
  imports: [PluginCommonModule],
  providers: [AuditDbConnection, UserContextResolver, AuditService, AdminLoginAttemptService],
  exports: [AuditService, AuditDbConnection, UserContextResolver, AdminLoginAttemptService],
  compatibility: VENDURE_COMPATIBILITY_VERSION,
})
export class AuditCorePlugin {}

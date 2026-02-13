import { AuditLog } from './audit-log.entity';

/**
 * Options for logging a user action
 */
export interface AuditLogOptions {
  entityType?: string;
  entityId?: string;
  data?: Record<string, any>;
  userId?: string; // Override if needed
  /** When RequestContext has no channelId, callers (e.g. interceptor) can pass channelId from mutation args */
  channelId?: number | string;
}

/**
 * Filters for querying audit log
 */
export interface AuditTrailFilters {
  entityType?: string;
  entityId?: string;
  userId?: string;
  eventType?: string;
  startDate?: Date;
  endDate?: Date;
}

export type { AuditLog };

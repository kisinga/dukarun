import { Injectable, Logger } from '@nestjs/common';
import { RequestContext } from '@vendure/core';
import { AuditDbConnection } from './audit-db.connection';
import { AuditLog } from './audit-log.entity';
import { AuditLogOptions, AuditTrailFilters } from './audit.types';
import { UserContextResolver } from './user-context.resolver';
import { getClientIp } from './request-utils';

/**
 * Audit Service
 *
 * Simple, intuitive API for logging audit events.
 * Automatically extracts channelId and userId from RequestContext.
 */
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(
    private readonly auditDbConnection: AuditDbConnection,
    private readonly userContextResolver: UserContextResolver
  ) {}

  /**
   * Log a user action (primary method)
   * Automatically extracts channelId and userId from RequestContext
   */
  async log(ctx: RequestContext, eventType: string, options: AuditLogOptions = {}): Promise<void> {
    try {
      // Get channelId: options (e.g. from mutation args) then RequestContext
      const channelId = options.channelId ?? ctx.channelId ?? ctx.channel?.id;

      if (!channelId) {
        this.logger.warn(
          `Cannot log audit event ${eventType}: channelId not available in RequestContext or options`
        );
        return;
      }

      // If userId is explicitly undefined (not just omitted), treat as system event with no user
      // Otherwise, fall back to context lookup
      const userId =
        options.userId !== undefined ? options.userId : this.userContextResolver.getUserId(ctx);

      if (!this.auditDbConnection.isAvailable()) {
        this.logger.warn('Audit database not available, skipping log');
        return;
      }

      // Check if user is superadmin (for audit tracking)
      const isSuperAdmin = userId ? await this.userContextResolver.isSuperAdmin(ctx) : false;

      // Extract IP address only when user is associated with the event
      const ipAddress = userId ? getClientIp(ctx) : null;

      const auditLog = new AuditLog();
      auditLog.channelId = typeof channelId === 'string' ? parseInt(channelId, 10) : channelId;
      auditLog.eventType = eventType;
      auditLog.entityType = options.entityType ?? null;
      auditLog.entityId = options.entityId ?? null;
      auditLog.userId = userId
        ? typeof userId === 'string'
          ? parseInt(userId, 10)
          : userId
        : null;
      auditLog.ipAddress = ipAddress; // Set IP address (cannot be overridden by options.data)
      auditLog.data = {
        ...(options.data || {}),
        isSuperAdmin, // Explicitly mark superadmin actions
      };
      auditLog.source = 'user_action';
      auditLog.timestamp = new Date();

      await this.auditDbConnection.getConnection().getRepository(AuditLog).save(auditLog);

      this.logger.debug(
        `Successfully logged audit event ${eventType} in channel ${channelId} by user ${userId || 'system'}`
      );
    } catch (error) {
      // Non-blocking: don't fail the operation if audit logging fails
      this.logger.error(
        `Failed to log audit event ${eventType}: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error.stack : undefined
      );
    }
  }

  /**
   * Log a system event (inherits user context from entity)
   */
  async logSystemEvent(
    ctx: RequestContext,
    eventType: string,
    entityType: string,
    entityId: string,
    data?: Record<string, any>
  ): Promise<void> {
    try {
      // Get channelId from RequestContext or data (numeric ID)
      const channelId = ctx.channelId || ctx.channel?.id || data?.channelId;

      if (!channelId) {
        // System events may not have channelId - skip logging if required
        this.logger.debug(`Cannot log system event ${eventType}: channelId not available`);
        return;
      }

      // Try to get user context from entity
      const userId =
        (await this.userContextResolver.getUserIdFromEntity(ctx, entityType, entityId)) ||
        this.userContextResolver.getUserId(ctx);

      if (!this.auditDbConnection.isAvailable()) {
        this.logger.warn('Audit database not available, skipping system event log');
        return;
      }

      // Extract IP address when user is associated with the event
      // For system events, IP may be null if triggered by background processes
      const ipAddress = userId ? getClientIp(ctx) : null;

      const auditLog = new AuditLog();
      auditLog.channelId = typeof channelId === 'string' ? parseInt(channelId, 10) : channelId;
      auditLog.eventType = eventType;
      auditLog.entityType = entityType;
      auditLog.entityId = entityId;
      auditLog.userId = userId
        ? typeof userId === 'string'
          ? parseInt(userId, 10)
          : userId
        : null;
      auditLog.ipAddress = ipAddress; // Set IP address when user is associated
      auditLog.data = data || {};
      auditLog.source = 'system_event';
      auditLog.timestamp = new Date();

      const savedLog = await this.auditDbConnection
        .getConnection()
        .getRepository(AuditLog)
        .save(auditLog);

      this.logger.log(
        `Successfully logged system event ${eventType} for ${entityType}:${entityId} in channel ${channelId}, log ID: ${savedLog.id}`
      );
    } catch (error) {
      // Non-blocking: don't fail the operation if audit logging fails
      this.logger.error(
        `Failed to log system event ${eventType}: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error.stack : undefined
      );
    }
  }

  /**
   * Query audit log
   * Automatically filters by channel from RequestContext
   */
  async getAuditTrail(
    ctx: RequestContext,
    filters: AuditTrailFilters & { limit?: number; skip?: number } = {}
  ): Promise<AuditLog[]> {
    try {
      // Get channelId from RequestContext (numeric ID)
      const channelId = ctx.channelId || ctx.channel?.id;

      if (!channelId) {
        this.logger.debug('Cannot query audit trail: channelId not available in RequestContext');
        return [];
      }

      if (!this.auditDbConnection.isAvailable()) {
        this.logger.warn('Audit database not available, returning empty audit trail');
        return [];
      }

      // Ensure channelId is numeric for comparison
      const numericChannelId = typeof channelId === 'string' ? parseInt(channelId, 10) : channelId;

      this.logger.debug(
        `Querying audit trail for channelId: ${numericChannelId} (type: ${typeof numericChannelId})`
      );

      const queryBuilder = this.auditDbConnection
        .getConnection()
        .getRepository(AuditLog)
        .createQueryBuilder('audit')
        .where('audit.channelId = :channelId', { channelId: numericChannelId })
        .orderBy('audit.timestamp', 'DESC');

      if (filters.entityType) {
        queryBuilder.andWhere('audit.entityType = :entityType', { entityType: filters.entityType });
      }

      if (filters.entityId) {
        queryBuilder.andWhere('audit.entityId = :entityId', { entityId: filters.entityId });
      }

      if (filters.userId) {
        queryBuilder.andWhere('audit.userId = :userId', { userId: filters.userId });
      }

      if (filters.eventType) {
        queryBuilder.andWhere('audit.eventType = :eventType', { eventType: filters.eventType });
      }

      if (filters.startDate) {
        queryBuilder.andWhere('audit.timestamp >= :startDate', { startDate: filters.startDate });
      }

      if (filters.endDate) {
        queryBuilder.andWhere('audit.timestamp <= :endDate', { endDate: filters.endDate });
      }

      // Apply pagination at database level for better performance
      if (filters.skip) {
        queryBuilder.skip(filters.skip);
      }

      if (filters.limit) {
        queryBuilder.take(filters.limit);
      }

      const results = await queryBuilder.getMany();
      this.logger.debug(`Found ${results.length} audit logs for channelId: ${numericChannelId}`);
      return results;
    } catch (error) {
      this.logger.error(
        `Failed to query audit trail: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error.stack : undefined
      );
      return [];
    }
  }

  /**
   * Query audit log for a specific channel by ID (e.g. for Super Admin).
   * Does not use RequestContext channel; callers must enforce permission.
   */
  async getAuditTrailForChannel(
    channelId: number | string,
    filters: AuditTrailFilters & { limit?: number; skip?: number } = {}
  ): Promise<AuditLog[]> {
    if (!this.auditDbConnection.isAvailable()) {
      this.logger.warn('Audit database not available, returning empty audit trail');
      return [];
    }
    const numericChannelId = typeof channelId === 'string' ? parseInt(channelId, 10) : channelId;
    if (Number.isNaN(numericChannelId)) {
      return [];
    }
    const ctx = {} as RequestContext;
    return this.getAuditTrail(
      Object.assign(ctx, { channelId: numericChannelId, channel: { id: numericChannelId } }),
      filters
    );
  }
}

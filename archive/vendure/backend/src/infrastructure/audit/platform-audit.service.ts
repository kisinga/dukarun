import { Injectable, Logger } from '@nestjs/common';
import { RequestContext } from '@vendure/core';
import { AuditDbConnection } from './audit-db.connection';
import { PlatformAuditLog } from './platform-audit-log.entity';
import { UserContextResolver } from './user-context.resolver';
import { getClientIp } from './request-utils';

export interface PlatformAuditLogOptions {
  entityType?: string;
  entityId?: string;
  data?: Record<string, any>;
  userId?: string;
}

export interface PlatformAuditTrailFilters {
  entityType?: string;
  entityId?: string;
  userId?: string;
  eventType?: string;
  startDate?: Date;
  endDate?: Date;
  limit?: number;
  skip?: number;
}

@Injectable()
export class PlatformAuditService {
  private readonly logger = new Logger(PlatformAuditService.name);

  constructor(
    private readonly auditDbConnection: AuditDbConnection,
    private readonly userContextResolver: UserContextResolver
  ) {}

  /**
   * Log a platform (super-admin) action. Non-blocking; failures are logged only.
   */
  async log(
    ctx: RequestContext,
    eventType: string,
    options: PlatformAuditLogOptions = {}
  ): Promise<void> {
    try {
      const userId =
        options.userId !== undefined ? options.userId : this.userContextResolver.getUserId(ctx);

      if (!this.auditDbConnection.isAvailable()) {
        this.logger.warn('Audit database not available, skipping platform audit log');
        return;
      }

      const ipAddress = userId ? getClientIp(ctx) : null;

      const auditLog = new PlatformAuditLog();
      auditLog.eventType = eventType;
      auditLog.entityType = options.entityType ?? null;
      auditLog.entityId = options.entityId ?? null;
      auditLog.userId = userId
        ? typeof userId === 'string'
          ? parseInt(userId, 10)
          : parseInt(String(userId), 10)
        : null;
      auditLog.ipAddress = ipAddress;
      auditLog.data = options.data ?? {};
      auditLog.source = 'super_admin';
      auditLog.timestamp = new Date();

      await this.auditDbConnection.getConnection().getRepository(PlatformAuditLog).save(auditLog);

      this.logger.debug(`Platform audit: ${eventType} by user ${userId ?? 'system'}`);
    } catch (error) {
      this.logger.error(
        `Failed to log platform audit event ${eventType}: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error.stack : undefined
      );
    }
  }

  /**
   * Query platform audit trail with filters and pagination.
   */
  async getTrail(filters: PlatformAuditTrailFilters = {}): Promise<PlatformAuditLog[]> {
    try {
      if (!this.auditDbConnection.isAvailable()) {
        this.logger.warn('Audit database not available, returning empty platform audit trail');
        return [];
      }

      const qb = this.auditDbConnection
        .getConnection()
        .getRepository(PlatformAuditLog)
        .createQueryBuilder('log')
        .orderBy('log.timestamp', 'DESC');

      if (filters.entityType) {
        qb.andWhere('log.entityType = :entityType', {
          entityType: filters.entityType,
        });
      }
      if (filters.entityId) {
        qb.andWhere('log.entityId = :entityId', { entityId: filters.entityId });
      }
      if (filters.userId) {
        qb.andWhere('log.userId = :userId', {
          userId: parseInt(String(filters.userId), 10),
        });
      }
      if (filters.eventType) {
        qb.andWhere('log.eventType = :eventType', {
          eventType: filters.eventType,
        });
      }
      if (filters.startDate) {
        qb.andWhere('log.timestamp >= :startDate', {
          startDate: filters.startDate,
        });
      }
      if (filters.endDate) {
        qb.andWhere('log.timestamp <= :endDate', { endDate: filters.endDate });
      }
      if (filters.skip != null) {
        qb.skip(filters.skip);
      }
      if (filters.limit != null) {
        qb.take(filters.limit);
      }

      return qb.getMany();
    } catch (error) {
      this.logger.error(
        `Failed to query platform audit trail: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error.stack : undefined
      );
      return [];
    }
  }
}

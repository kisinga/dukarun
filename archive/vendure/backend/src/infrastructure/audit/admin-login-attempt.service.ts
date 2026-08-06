import { Injectable, Logger } from '@nestjs/common';
import { RequestContext, User } from '@vendure/core';
import { AuditDbConnection } from './audit-db.connection';
import { AdminLoginAttempt } from './admin-login-attempt.entity';
import { getClientIp } from './request-utils';

export interface RecordLoginAttemptPayload {
  username: string;
  success: boolean;
  failureReason?: string;
  user?: User;
  authMethod: 'native' | 'otp';
  userAgent?: string;
  isSuperAdmin?: boolean;
}

export interface GetAttemptsOptions {
  limit?: number;
  skip?: number;
  since?: Date;
}

@Injectable()
export class AdminLoginAttemptService {
  private readonly logger = new Logger(AdminLoginAttemptService.name);

  constructor(private readonly auditDbConnection: AuditDbConnection) {}

  async record(ctx: RequestContext, payload: RecordLoginAttemptPayload): Promise<void> {
    if (!this.auditDbConnection.isAvailable()) {
      return;
    }
    try {
      const attempt = new AdminLoginAttempt();
      attempt.eventKind = 'login';
      attempt.timestamp = new Date();
      attempt.ipAddress = getClientIp(ctx);
      attempt.username = payload.username;
      attempt.success = payload.success;
      attempt.failureReason = payload.failureReason ?? null;
      attempt.userId = payload.user
        ? typeof payload.user.id === 'string'
          ? parseInt(payload.user.id, 10)
          : payload.user.id
        : null;
      attempt.authMethod = payload.authMethod;
      attempt.userAgent = payload.userAgent ?? null;
      attempt.isSuperAdmin = payload.isSuperAdmin ?? null;

      await this.auditDbConnection.getConnection().getRepository(AdminLoginAttempt).save(attempt);
    } catch (error) {
      this.logger.warn(
        `Failed to record admin login attempt: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  async recordRateLimit(ctx: RequestContext, payload: { identifier: string }): Promise<void> {
    if (!this.auditDbConnection.isAvailable()) {
      return;
    }
    try {
      const req = (ctx as any).req;
      const userAgent = req?.headers?.['user-agent'] ?? null;
      const attempt = new AdminLoginAttempt();
      attempt.eventKind = 'otp_rate_limited';
      attempt.timestamp = new Date();
      attempt.ipAddress = getClientIp(ctx);
      attempt.username = payload.identifier;
      attempt.success = false;
      attempt.failureReason = 'otp_rate_limited';
      attempt.userId = null;
      attempt.authMethod = 'otp';
      attempt.userAgent = userAgent;
      attempt.isSuperAdmin = null;

      await this.auditDbConnection.getConnection().getRepository(AdminLoginAttempt).save(attempt);
    } catch (error) {
      this.logger.warn(
        `Failed to record rate limit event: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  async getAttempts(options: GetAttemptsOptions = {}): Promise<AdminLoginAttempt[]> {
    if (!this.auditDbConnection.isAvailable()) {
      return [];
    }
    try {
      const qb = this.auditDbConnection
        .getConnection()
        .getRepository(AdminLoginAttempt)
        .createQueryBuilder('a')
        .orderBy('a.timestamp', 'DESC');

      if (options.since) {
        qb.andWhere('a.timestamp >= :since', { since: options.since });
      }
      if (options.skip != null) {
        qb.skip(options.skip);
      }
      if (options.limit != null) {
        qb.take(options.limit);
      }

      return qb.getMany();
    } catch (error) {
      this.logger.error(
        `Failed to get admin login attempts: ${error instanceof Error ? error.message : String(error)}`
      );
      return [];
    }
  }
}

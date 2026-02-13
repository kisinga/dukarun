import { Logger } from '@nestjs/common';
import { Args, Query, Resolver } from '@nestjs/graphql';
import {
  Administrator,
  Allow,
  Ctx,
  Permission,
  RequestContext,
  TransactionalConnection,
} from '@vendure/core';
import { gql } from 'graphql-tag';
import { AuditLog } from '../../infrastructure/audit/audit-log.entity';
import { AuditService } from '../../infrastructure/audit/audit.service';
import { AuditTrailFilters } from '../../infrastructure/audit/audit.types';

export const auditSchema = gql`
  extend type Query {
    auditLogs(options: AuditLogOptions): [AuditLog!]!
    administratorByUserId(userId: ID): Administrator
  }

  type AuditLog {
    id: ID!
    timestamp: DateTime!
    channelId: ID!
    eventType: String!
    entityType: String
    entityId: String
    userId: ID
    ipAddress: String
    data: JSON!
    source: String!
  }

  input AuditLogOptions {
    entityType: String
    entityId: String
    userId: ID
    eventType: String
    startDate: DateTime
    endDate: DateTime
    limit: Int
    skip: Int
  }
`;

@Resolver()
export class AuditResolver {
  private readonly logger = new Logger(AuditResolver.name);

  constructor(
    private readonly auditService: AuditService,
    private readonly connection: TransactionalConnection
  ) {}

  @Query()
  @Allow(Permission.ReadSettings, Permission.ReadOrder) // Allow both settings and order permissions
  async auditLogs(
    @Ctx() ctx: RequestContext,
    @Args('options')
    options?: {
      entityType?: string;
      entityId?: string;
      userId?: string;
      eventType?: string;
      startDate?: Date;
      endDate?: Date;
      limit?: number;
      skip?: number;
    }
  ): Promise<AuditLog[]> {
    const channelId = ctx.channelId || ctx.channel?.id;
    this.logger.log(
      `auditLogs query called with channelId: ${channelId}, options: ${JSON.stringify(options)}`
    );
    // Build filters from options
    const filters: AuditTrailFilters & { limit?: number; skip?: number } = {};

    if (options?.entityType) {
      filters.entityType = options.entityType;
    }

    if (options?.entityId) {
      filters.entityId = options.entityId;
    }

    if (options?.userId) {
      filters.userId = options.userId;
    }

    if (options?.eventType) {
      filters.eventType = options.eventType;
    }

    if (options?.startDate) {
      filters.startDate =
        options.startDate instanceof Date ? options.startDate : new Date(options.startDate);
    }

    if (options?.endDate) {
      filters.endDate =
        options.endDate instanceof Date ? options.endDate : new Date(options.endDate);
    }

    // Add pagination to filters (handled at database level for better performance)
    if (options?.skip !== undefined) {
      filters.skip = options.skip;
    }

    if (options?.limit !== undefined) {
      filters.limit = options.limit;
    }

    // Get audit logs (automatically filtered by channel from RequestContext)
    const logs = await this.auditService.getAuditTrail(ctx, filters);
    this.logger.log(`auditLogs query returning ${logs.length} logs for channelId: ${channelId}`);
    return logs;
  }

  @Query()
  @Allow(Permission.ReadSettings, Permission.ReadOrder)
  async administratorByUserId(
    @Ctx() ctx: RequestContext,
    @Args('userId') userId: string
  ): Promise<Administrator | null> {
    if (!userId) return null;
    const administrator = await this.connection.getRepository(ctx, Administrator).findOne({
      where: { user: { id: userId } },
      relations: ['user', 'user.roles', 'user.roles.channels'],
    });
    return administrator ?? null;
  }
}

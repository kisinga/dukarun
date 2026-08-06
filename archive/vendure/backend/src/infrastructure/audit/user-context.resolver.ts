import { Injectable, Logger } from '@nestjs/common';
import {
  RequestContext,
  TransactionalConnection,
  Order,
  Payment,
  Customer,
  Administrator,
  AdministratorService,
} from '@vendure/core';
import { IsNull } from 'typeorm';

/**
 * User Context Resolver
 *
 * Simple helper to resolve user context from RequestContext or entity custom fields.
 */
@Injectable()
export class UserContextResolver {
  private readonly logger = new Logger(UserContextResolver.name);

  constructor(
    private readonly connection: TransactionalConnection,
    private readonly administratorService: AdministratorService
  ) {}

  /**
   * Get user ID from RequestContext (for user actions)
   * Includes superadmin users - they are logged with their user ID
   */
  getUserId(ctx: RequestContext): string | null {
    return ctx.activeUserId?.toString() || null;
  }

  /**
   * Check if the user in RequestContext is a superadmin
   * Superadmins have no channel restrictions and can access all channels
   * In Vendure, superadmins typically have roles that are not channel-scoped
   */
  async isSuperAdmin(ctx: RequestContext): Promise<boolean> {
    try {
      if (!ctx.activeUserId) {
        return false;
      }

      // Load administrator with roles relation
      const administrator = await this.connection.getRepository(ctx, Administrator).findOne({
        where: { user: { id: ctx.activeUserId }, deletedAt: IsNull() },
        relations: ['user', 'user.roles', 'user.roles.channels'],
      });

      if (!administrator || !administrator.user) {
        return false;
      }

      // Check if user has roles without channel restrictions
      // Superadmins have roles that are not channel-scoped (no channels assigned)
      const userRoles = (administrator.user as any).roles || [];
      return userRoles.some((role: any) => !role.channels || role.channels.length === 0);
    } catch (error) {
      this.logger.warn(
        `Failed to check if user is superadmin: ${error instanceof Error ? error.message : String(error)}`
      );
      return false;
    }
  }

  /**
   * Get user ID from entity custom fields (for system events)
   * Looks up the entity and checks its custom fields for user attribution.
   */
  async getUserIdFromEntity(
    ctx: RequestContext,
    entityType: string,
    entityId: string
  ): Promise<string | null> {
    try {
      switch (entityType) {
        case 'Order': {
          const order = await this.connection.getRepository(ctx, Order).findOne({
            where: { id: entityId },
            select: ['id', 'customFields'],
          });
          if (order) {
            const customFields = order.customFields as any;
            return (
              customFields?.lastModifiedByUserId?.toString() ||
              customFields?.createdByUserId?.toString() ||
              null
            );
          }
          break;
        }
        case 'Payment': {
          const payment = await this.connection.getRepository(ctx, Payment).findOne({
            where: { id: entityId },
            select: ['id', 'customFields'],
          });
          if (payment) {
            const customFields = payment.customFields as any;
            return customFields?.addedByUserId?.toString() || null;
          }
          break;
        }
        case 'Customer': {
          const customer = await this.connection.getRepository(ctx, Customer).findOne({
            where: { id: entityId },
            select: ['id', 'customFields'],
          });
          if (customer) {
            const customFields = customer.customFields as any;
            return (
              customFields?.creditApprovedByUserId?.toString() ||
              customFields?.createdByUserId?.toString() ||
              null
            );
          }
          break;
        }
      }
    } catch (error) {
      this.logger.warn(
        `Failed to get user context from entity ${entityType}:${entityId}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
    return null;
  }
}

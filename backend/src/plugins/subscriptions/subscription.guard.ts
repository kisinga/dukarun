import { CanActivate, ExecutionContext, Injectable, Logger } from '@nestjs/common';
import { GqlExecutionContext } from '@nestjs/graphql';
import { Permission } from '@vendure/common/lib/generated-types';
import { Reflector } from '@nestjs/core';
import { SubscriptionService } from '../../services/subscriptions/subscription.service';
import { getVendureRequestContext } from '../../infrastructure/audit/get-request-context';
import {
  SUBSCRIPTION_ACCESS_METADATA,
  SubscriptionAccessLevel,
} from './subscription-access.decorator';
import { resolveRegistryAccessLevel } from './operation-access.registry';

/**
 * Global guard that enforces subscription access at the GraphQL operation boundary.
 *
 * Each top-level query/mutation declares its required access level via either:
 *   - the `@SubscriptionAccess()` decorator, or
 *   - the `OPERATION_ACCESS_REGISTRY` for Vendure built-ins, or
 *   - a safe default (`write` for mutations, `read` for queries).
 *
 * Unknown nested field resolvers are ignored; enforcement only happens at the
 * root Query/Mutation level.
 */
@Injectable()
export class SubscriptionGuard implements CanActivate {
  private readonly logger = new Logger(SubscriptionGuard.name);

  constructor(
    private readonly subscriptionService: SubscriptionService,
    private readonly reflector: Reflector
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if ((context.getType() as string) !== 'graphql') {
      return true;
    }

    const gqlContext = GqlExecutionContext.create(context);
    const info = gqlContext.getInfo();
    const operation = info?.operation;
    if (!operation) {
      return true;
    }

    // Only enforce on root Query/Mutation fields. Nested field resolvers inherit
    // the access decision of their parent operation.
    const parentTypeName = info.parentType?.name;
    if (parentTypeName !== 'Query' && parentTypeName !== 'Mutation') {
      return true;
    }

    const fieldName = info.fieldName;

    // Resolve the request context early so API-scoped registry entries can be
    // matched correctly. Public operations are still allowed when context is missing.
    const ctx = getVendureRequestContext(context);
    const apiType = ctx?.apiType;
    const requiredLevel = this.resolveRequiredLevel(
      context,
      operation.operation,
      fieldName,
      apiType
    );

    if (requiredLevel === 'public') {
      return true;
    }

    if (!ctx) {
      this.logger.warn(`Blocked ${operation.operation} ${fieldName} - request context missing`);
      throw new Error('Subscription access could not be verified. Please try again.');
    }

    if (ctx.userHasPermissions([Permission.SuperAdmin])) {
      return true;
    }

    const channelId = ctx.channelId;
    if (!channelId) {
      this.logger.warn(`Blocked ${operation.operation} ${fieldName} - channel context missing`);
      throw new Error('Channel context is required for this action.');
    }

    try {
      const status = await this.subscriptionService.checkSubscriptionStatus(ctx, String(channelId));

      if (requiredLevel === 'read' && !status.canRead) {
        this.logger.warn(
          `Blocked ${operation.operation} ${fieldName} for channel ${channelId} - subscription suspended, reason: ${status.reason}`
        );
        throw new Error(
          'Subscription suspended. Please contact support or renew your subscription to reactivate access.'
        );
      }

      if (requiredLevel === 'write' && !status.canWrite) {
        this.logger.warn(
          `Blocked mutation ${fieldName} for channel ${channelId} - subscription status: ${status.status}, reason: ${status.reason}`
        );
        throw new Error(
          `Subscription access denied. Current status: ${status.status}. Please renew your subscription to continue.`
        );
      }

      return true;
    } catch (error) {
      if (
        error instanceof Error &&
        (error.message.includes('Subscription suspended') ||
          error.message.includes('Subscription access denied') ||
          error.message.includes('Channel context is required'))
      ) {
        throw error;
      }

      this.logger.error(
        `Error checking subscription status: ${error instanceof Error ? error.message : String(error)}`
      );
      throw new Error('Subscription access could not be verified. Please try again.');
    }
  }

  private resolveRequiredLevel(
    context: ExecutionContext,
    operationType: string,
    fieldName: string,
    apiType?: string
  ): SubscriptionAccessLevel {
    const metadata = this.reflector.get<SubscriptionAccessLevel>(
      SUBSCRIPTION_ACCESS_METADATA,
      context.getHandler()
    );

    if (metadata) {
      return metadata;
    }

    return (
      resolveRegistryAccessLevel(fieldName, apiType) ??
      (operationType === 'mutation' ? 'write' : 'read')
    );
  }
}

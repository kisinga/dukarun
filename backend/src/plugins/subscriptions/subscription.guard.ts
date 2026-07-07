import { CanActivate, ExecutionContext, Injectable, Logger } from '@nestjs/common';
import { GqlExecutionContext } from '@nestjs/graphql';
import { Permission } from '@vendure/common/lib/generated-types';
import { SubscriptionService } from '../../services/subscriptions/subscription.service';
import { getVendureRequestContext } from '../../infrastructure/audit/get-request-context';

/**
 * Guard to enforce read-only mode for expired subscriptions
 *
 * Allows queries but blocks mutations when subscription is expired or cancelled.
 * Exceptions are made for subscription-related mutations.
 */
@Injectable()
export class SubscriptionGuard implements CanActivate {
  private readonly logger = new Logger(SubscriptionGuard.name);
  private readonly allowedMutations = new Set([
    'login',
    'logout',
    'requestRegistrationOTP',
    'verifyRegistrationOTP',
    'requestLoginOTP',
    'verifyLoginOTP',
    'initiateSubscriptionPurchase',
    'verifySubscriptionPayment',
    'cancelSubscription',
  ]);

  constructor(private subscriptionService: SubscriptionService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Only run for GraphQL; HTTP routes (e.g. cache-sync SSE) have no operation.
    // ContextType in NestJS may not include 'graphql' in its union; runtime can still be 'graphql'.
    if ((context.getType() as string) !== 'graphql') {
      return true;
    }

    const gqlContext = GqlExecutionContext.create(context);
    const info = gqlContext.getInfo();
    const operation = info?.operation;
    if (!operation) {
      return true;
    }

    // Skip if not a mutation
    if (operation.operation !== 'mutation') {
      return true; // Allow all queries
    }

    // Get mutation name
    const mutationName = info.fieldName;

    // Allow auth mutations (no channel/session yet) and billing mutations for renewal.
    if (this.allowedMutations.has(mutationName)) {
      return true;
    }

    const ctx = getVendureRequestContext(context);
    if (!ctx) {
      this.logger.warn(`Blocked mutation ${mutationName} - request context missing`);
      throw new Error('Subscription access could not be verified. Please try again.');
    }

    // Superadmins are never subject to subscription restrictions
    if (ctx.userHasPermissions([Permission.SuperAdmin])) {
      return true;
    }

    const channelId = ctx.channelId;
    if (!channelId) {
      this.logger.warn(`Blocked mutation ${mutationName} - channel context missing`);
      throw new Error('Channel context is required for this action.');
    }

    try {
      const status = await this.subscriptionService.checkSubscriptionStatus(ctx, String(channelId));

      if (!status.canWrite) {
        this.logger.warn(
          `Blocked mutation ${mutationName} for channel ${channelId} - subscription status: ${status.status}, reason: ${status.reason}`
        );
        throw new Error(
          `Subscription access denied. Current status: ${status.status}. Please renew your subscription to continue.`
        );
      }

      return true;
    } catch (error) {
      if (
        error instanceof Error &&
        (error.message.includes('Subscription access denied') ||
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
}

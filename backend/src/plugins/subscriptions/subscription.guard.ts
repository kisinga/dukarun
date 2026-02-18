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

    // Extract the actual Vendure RequestContext from the Express request.
    const ctx = getVendureRequestContext(context);
    if (!ctx) {
      return true;
    }

    // Skip if not a mutation
    if (operation.operation !== 'mutation') {
      return true; // Allow all queries
    }

    // Superadmins are never subject to subscription restrictions
    if (ctx.userHasPermissions([Permission.SuperAdmin])) {
      return true;
    }

    // Get channel ID from context
    const channelId = ctx.channelId;
    if (!channelId) {
      // No channel context, allow (might be system operation)
      return true;
    }

    // Get mutation name
    const mutationName = info.fieldName;

    // Allow auth mutations (user has no session yet during login/logout)
    // and subscription-related mutations even if expired.
    // Also allow ML service mutations (they use service token auth, not user sessions)
    const subscriptionMutations = [
      'login', // Must always be allowed — no session exists yet at login time
      'logout',
      'initiateSubscriptionPurchase',
      'verifySubscriptionPayment',
      'cancelSubscription',
      'updateChannelSettings', // Allow updating subscription settings
      'completeTraining', // ML service - uses service token auth
      'linkMlModelAssets', // ML service - uses service token auth
      'setMlModelStatus', // ML service - uses service token auth
    ];

    if (subscriptionMutations.includes(mutationName)) {
      return true;
    }

    try {
      // Check subscription status
      const status = await this.subscriptionService.checkSubscriptionStatus(ctx, String(channelId));

      if (!status.canPerformAction) {
        this.logger.warn(
          `Blocked mutation ${mutationName} for channel ${channelId} - subscription status: ${status.status}`
        );
        throw new Error(
          `Subscription expired. Please renew your subscription to continue. Current status: ${status.status}`
        );
      }

      return true;
    } catch (error) {
      // If error is already our subscription error, re-throw it
      if (error instanceof Error && error.message.includes('Subscription expired')) {
        throw error;
      }

      // For other errors, log and allow (fail-safe)
      this.logger.error(
        `Error checking subscription status: ${error instanceof Error ? error.message : String(error)}`
      );
      return true;
    }
  }
}

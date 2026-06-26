import { Injectable, computed, inject, signal } from '@angular/core';
import {
  GET_SUBSCRIPTION_TIERS,
  GET_CHANNEL_SUBSCRIPTION,
  CHECK_SUBSCRIPTION_STATUS,
  INITIATE_SUBSCRIPTION_PURCHASE,
  VERIFY_SUBSCRIPTION_PAYMENT,
  CANCEL_SUBSCRIPTION,
} from '../graphql/operations.graphql';
import { ApolloService } from './apollo.service';
import { CompanyService } from './company.service';

export interface SubscriptionTier {
  id: string;
  code: string;
  name: string;
  description?: string;
  priceMonthly: number;
  priceYearly: number;
  features?: any;
  isActive: boolean;
}

export interface SubscriptionStatus {
  isValid: boolean;
  status: 'trial' | 'active' | 'expired' | 'cancelled';
  daysRemaining?: number;
  expiresAt?: Date;
  trialEndsAt?: Date;
  canPerformAction: boolean;
  isEarlyTester?: boolean;
}

/**
 * Service for subscription management with Paystack integration
 *
 * ARCHITECTURE:
 * - Manages subscription tiers, status, and payment flow
 * - Integrates with Paystack for STK push payments
 * - Enforces read-only mode for expired subscriptions
 * - Automatically scoped to active channel via CompanyService
 */
@Injectable({
  providedIn: 'root',
})
export class SubscriptionService {
  private readonly apolloService = inject(ApolloService);
  private readonly companyService = inject(CompanyService);

  // State signals
  private readonly tiersSignal = signal<SubscriptionTier[]>([]);
  private readonly subscriptionStatusSignal = signal<SubscriptionStatus | null>(null);
  private readonly isLoadingSignal = signal(false);
  private readonly errorSignal = signal<string | null>(null);
  private readonly isProcessingPaymentSignal = signal(false);

  // Caching
  private subscriptionStatusCache: {
    status: SubscriptionStatus | null;
    timestamp: number;
    channelId: string;
  } | null = null;
  private readonly CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

  // Public readonly signals
  readonly tiers = this.tiersSignal.asReadonly();
  readonly subscriptionStatus = this.subscriptionStatusSignal.asReadonly();
  readonly isLoading = this.isLoadingSignal.asReadonly();
  readonly error = this.errorSignal.asReadonly();
  readonly isProcessingPayment = this.isProcessingPaymentSignal.asReadonly();

  // Computed signals
  readonly isTrialActive = computed(() => {
    const status = this.subscriptionStatusSignal();
    return status?.status === 'trial' && status.isValid;
  });

  readonly isSubscriptionActive = computed(() => {
    const status = this.subscriptionStatusSignal();
    return status?.status === 'active' && status.isValid;
  });

  readonly isExpired = computed(() => {
    const status = this.subscriptionStatusSignal();
    return status?.status === 'expired' || status?.status === 'cancelled';
  });

  readonly canPerformAction = computed(() => {
    const status = this.subscriptionStatusSignal();
    return status?.canPerformAction ?? false;
  });

  readonly hasIndefiniteTrial = computed(() => {
    const status = this.subscriptionStatusSignal();
    return status?.status === 'trial' && !status.trialEndsAt;
  });

  /**
   * Fetch all active subscription tiers
   */
  async getSubscriptionTiers(): Promise<SubscriptionTier[]> {
    try {
      this.isLoadingSignal.set(true);
      this.errorSignal.set(null);

      const client = this.apolloService.getClient();
      const result = await client.query({
        query: GET_SUBSCRIPTION_TIERS,
        fetchPolicy: 'network-only',
      });

      const tiers = result.data?.getSubscriptionTiers ?? [];
      this.tiersSignal.set(tiers as SubscriptionTier[]);
      return tiers as SubscriptionTier[];
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Failed to fetch subscription tiers';
      this.errorSignal.set(errorMessage);
      console.error('Failed to fetch subscription tiers:', error);
      return [];
    } finally {
      this.isLoadingSignal.set(false);
    }
  }

  /**
   * Get current channel's subscription details
   */
  async getChannelSubscription(channelId?: string): Promise<any> {
    try {
      this.isLoadingSignal.set(true);
      this.errorSignal.set(null);

      const targetChannelId = channelId || this.companyService.activeCompanyId();
      if (!targetChannelId) {
        throw new Error('No active channel');
      }

      const client = this.apolloService.getClient();
      const result = await client.query({
        query: GET_CHANNEL_SUBSCRIPTION,
        variables: { channelId: targetChannelId },
        fetchPolicy: 'network-only',
      });

      return result.data?.getChannelSubscription ?? null;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Failed to fetch subscription details';
      this.errorSignal.set(errorMessage);
      console.error('Failed to fetch channel subscription:', error);
      return null;
    } finally {
      this.isLoadingSignal.set(false);
    }
  }

  /**
   * Check subscription status for current channel
   * Uses caching (5 minute TTL) to avoid excessive API calls
   */
  async checkSubscriptionStatus(channelId?: string): Promise<SubscriptionStatus | null> {
    try {
      const targetChannelId = channelId || this.companyService.activeCompanyId();
      if (!targetChannelId) {
        throw new Error('No active channel');
      }

      // Check cache first (must match channel ID)
      if (
        this.subscriptionStatusCache &&
        this.subscriptionStatusCache.channelId === targetChannelId &&
        Date.now() - this.subscriptionStatusCache.timestamp < this.CACHE_TTL_MS
      ) {
        return this.subscriptionStatusCache.status;
      }

      this.isLoadingSignal.set(true);
      this.errorSignal.set(null);

      const client = this.apolloService.getClient();
      const result = await client.query({
        query: CHECK_SUBSCRIPTION_STATUS,
        variables: { channelId: targetChannelId },
        fetchPolicy: 'network-only',
      });

      // Check for GraphQL errors first
      if (result.error) {
        const errorMessage = result.error.message || 'Unknown error';
        console.warn('GraphQL error when checking subscription status:', errorMessage);
        return null;
      }

      const status = (result.data?.checkSubscriptionStatus ?? null) as SubscriptionStatus | null;
      if (!status) {
        // Status is null but no GraphQL errors - log warning and return null gracefully
        console.warn('Subscription status unavailable for channel:', targetChannelId);
        return null;
      }

      // Update cache
      this.subscriptionStatusCache = {
        status,
        timestamp: Date.now(),
        channelId: targetChannelId,
      };

      this.subscriptionStatusSignal.set(status);
      return status;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Failed to check subscription status';
      this.errorSignal.set(errorMessage);
      console.error('Failed to check subscription status:', error);
      return null;
    } finally {
      this.isLoadingSignal.set(false);
    }
  }

  /**
   * Initiate subscription purchase
   */
  async initiatePurchase(
    tierId: string,
    billingCycle: 'monthly' | 'yearly',
    phoneNumber: string,
    email: string,
    paymentMethod?: string,
  ): Promise<{
    success: boolean;
    reference?: string;
    authorizationUrl?: string;
    message?: string;
  }> {
    try {
      this.isProcessingPaymentSignal.set(true);
      this.errorSignal.set(null);

      // Log the tierId being passed for debugging
      console.log(
        '[SubscriptionService] initiatePurchase called with tierId:',
        tierId,
        'type:',
        typeof tierId,
      );

      // Validate tier ID exists
      if (!tierId) {
        console.error('[SubscriptionService] Invalid tierId provided: null or undefined');
        throw new Error('Invalid subscription tier ID: missing ID');
      }

      // Validate tier ID is not "-1"
      const tierIdStr = String(tierId).trim();
      if (tierIdStr === '-1') {
        console.error('[SubscriptionService] Invalid tierId provided: -1', {
          tierId,
          tierIdStr,
          type: typeof tierId,
        });
        const error = new Error('Invalid subscription tier ID: "-1" is not a valid tier ID');
        this.errorSignal.set(error.message);
        throw error;
      }

      // Validate tier ID is a valid UUID format
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(tierIdStr)) {
        console.error(
          `[SubscriptionService] Invalid tierId format provided: ${tierId} (type: ${typeof tierId})`,
        );
        const error = new Error(
          `Invalid subscription tier ID format: "${tierId}" is not a valid UUID`,
        );
        this.errorSignal.set(error.message);
        throw error;
      }

      const channelId = this.companyService.activeCompanyId();
      if (!channelId) {
        throw new Error('No active channel');
      }

      // Final safety check before GraphQL call - ensure tierId is valid
      if (!tierIdStr || tierIdStr === '-1' || !uuidRegex.test(tierIdStr)) {
        console.error(
          '[SubscriptionService] CRITICAL: Invalid tierId passed validation but reached GraphQL call:',
          tierIdStr,
        );
        const error = new Error('Invalid subscription tier ID: validation failed');
        this.errorSignal.set(error.message);
        throw error;
      }

      console.log('[SubscriptionService] Calling GraphQL with valid tierId:', tierIdStr);
      const client = this.apolloService.getClient();
      const result = await client.mutate({
        mutation: INITIATE_SUBSCRIPTION_PURCHASE,
        variables: {
          channelId,
          tierId: tierIdStr, // Use the validated string version
          billingCycle,
          phoneNumber,
          email,
          paymentMethod: paymentMethod || undefined,
        },
      });

      const response = result.data?.initiateSubscriptionPurchase;
      if (!response) {
        throw new Error('No response from server');
      }

      return {
        success: response.success,
        reference: response.reference || undefined,
        authorizationUrl: response.authorizationUrl || undefined,
        message: response.message || undefined,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to initiate purchase';
      this.errorSignal.set(errorMessage);
      console.error('Failed to initiate purchase:', error);
      return { success: false, message: errorMessage };
    } finally {
      this.isProcessingPaymentSignal.set(false);
    }
  }

  /**
   * Verify payment status (polling after payment initiation)
   */
  async verifyPayment(reference: string): Promise<boolean> {
    try {
      this.isProcessingPaymentSignal.set(true);
      this.errorSignal.set(null);

      const channelId = this.companyService.activeCompanyId();
      if (!channelId) {
        throw new Error('No active channel');
      }

      const client = this.apolloService.getClient();
      const result = await client.mutate({
        mutation: VERIFY_SUBSCRIPTION_PAYMENT,
        variables: {
          channelId,
          reference,
        },
      });

      const success = result.data?.verifySubscriptionPayment ?? false;

      if (success) {
        // Clear cache and refresh subscription status after successful payment
        this.subscriptionStatusCache = null;
        await this.checkSubscriptionStatus();
        // Refresh active channel data
        await this.companyService.fetchActiveChannel();
        // Note: Notifications will be reloaded by dashboard layout component
      }

      return success;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to verify payment';
      this.errorSignal.set(errorMessage);
      console.error('Failed to verify payment:', error);
      return false;
    } finally {
      this.isProcessingPaymentSignal.set(false);
    }
  }

  /**
   * Cancel subscription (disable auto-renewal)
   */
  async cancelSubscription(channelId?: string): Promise<boolean> {
    try {
      this.isLoadingSignal.set(true);
      this.errorSignal.set(null);

      const targetChannelId = channelId || this.companyService.activeCompanyId();
      if (!targetChannelId) {
        throw new Error('No active channel');
      }

      const client = this.apolloService.getClient();
      const result = await client.mutate({
        mutation: CANCEL_SUBSCRIPTION,
        variables: {
          channelId: targetChannelId,
        },
      });

      const success = result.data?.cancelSubscription ?? false;

      if (success) {
        // Refresh subscription status
        await this.checkSubscriptionStatus();
      }

      return success;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to cancel subscription';
      this.errorSignal.set(errorMessage);
      console.error('Failed to cancel subscription:', error);
      return false;
    } finally {
      this.isLoadingSignal.set(false);
    }
  }

  /**
   * Check access level (for read-only mode enforcement)
   */
  checkAccessLevel(): 'full' | 'read-only' {
    const status = this.subscriptionStatusSignal();
    if (!status || !status.canPerformAction) {
      return 'read-only';
    }
    return 'full';
  }
}

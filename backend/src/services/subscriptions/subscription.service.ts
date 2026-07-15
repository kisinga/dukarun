import { Injectable, Logger } from '@nestjs/common';
import {
  Channel,
  ChannelService,
  EventBus,
  RequestContext,
  TransactionalConnection,
} from '@vendure/core';
import { SubscriptionAlertEvent } from '../../infrastructure/events/custom-events';
import { RedisCacheService } from '../../infrastructure/storage/redis-cache.service';
import {
  SubscriptionTier,
  SubscriptionTierFeatures,
  SubscriptionTierLimits,
} from '../../plugins/subscriptions/subscription.entity';
import { generatePaystackEmailFromPhone } from '../../utils/email.utils';
import { PaystackService } from '../payments/paystack.service';
import {
  getDefaultGracePeriodEnd,
  parseDate,
  SubscriptionAccess,
  SubscriptionPolicyReason,
  SubscriptionPolicyStatus,
} from './subscription-access.policy';
import {
  clearSubscriptionAccess,
  getSubscriptionAccess,
} from '../../plugins/subscriptions/subscription.context';

/**
 * Subscription lifecycle management: tiers, purchases, Paystack payments, trial/grace periods,
 * and read/write access decisions.
 *
 * Tiers are created via createSubscriptionTier (SuperAdmin). To seed the canonical Pro/Business
 * tiers directly in SQL, run an upsert like:
 *
 * ```sql
 * INSERT INTO "subscription_tier" (
 *   "code", "name", "description", "priceMonthly", "priceYearly", "features", "isActive"
 * ) VALUES
 * (
 *   'pro', 'Pro', 'Essential Shop Operations...', 150000, 1440000,
 *   '{"features":["Sell with camera..."]}', true
 * ),
 * (
 *   'business', 'Business', 'Financial Control & Growth...', 250000, 2400000,
 *   '{"features":["Everything in Pro..."]}', true
 * )
 * ON CONFLICT ("code") DO UPDATE SET
 *   "name" = EXCLUDED."name",
 *   "description" = EXCLUDED."description",
 *   "priceMonthly" = EXCLUDED."priceMonthly",
 *   "priceYearly" = EXCLUDED."priceYearly",
 *   "features" = EXCLUDED."features",
 *   "isActive" = EXCLUDED."isActive";
 * ```
 */

export interface SubscriptionStatus {
  isValid: boolean;
  access: SubscriptionAccess;
  status: SubscriptionPolicyStatus;
  reason: SubscriptionPolicyReason;
  daysRemaining?: number;
  expiresAt?: Date;
  trialEndsAt?: Date;
  exemptionEndsAt?: Date;
  exemptionReason?: string;
  gracePeriodEnd?: Date;
  canWrite: boolean;
  canRead: boolean;
  canPerformAction: boolean;
}

export interface InitiatePurchaseResult {
  success: boolean;
  reference?: string;
  authorizationUrl?: string;
  message?: string;
}

interface PaymentStatusCacheEntry {
  status: 'success' | 'pending' | 'failed';
  timestamp: number;
}

@Injectable()
export class SubscriptionService {
  private readonly logger = new Logger(SubscriptionService.name);
  private readonly trialDays = parseInt(process.env.SUBSCRIPTION_TRIAL_DAYS || '30', 10);
  private readonly CACHE_TTL_SECONDS = 10; // 10 seconds (for Redis SETEX)
  private readonly CACHE_NAMESPACE = 'payment:status';
  private readonly expiryTransitionLock = new Set<string>();

  constructor(
    private channelService: ChannelService,
    private connection: TransactionalConnection,
    private paystackService: PaystackService,
    private eventBus: EventBus,
    private redisCache: RedisCacheService
  ) {}

  /**
   * Check subscription status for a channel
   */
  async checkSubscriptionStatus(
    ctx: RequestContext,
    channelId: string
  ): Promise<SubscriptionStatus> {
    const channel = await this.channelService.findOne(ctx, channelId);
    if (!channel) {
      throw new Error(`Channel ${channelId} not found`);
    }

    const customFields = channel.customFields as Record<string, unknown>;
    let decision = getSubscriptionAccess(ctx, channelId, customFields);

    if (
      decision.status === 'expired' &&
      customFields.subscriptionStatus !== 'expired' &&
      customFields.subscriptionStatus !== 'cancelled'
    ) {
      await this.handleExpiredSubscription(ctx, channelId);
      clearSubscriptionAccess(ctx, channelId);
      const updatedChannel = await this.channelService.findOne(ctx, channelId);
      decision = getSubscriptionAccess(
        ctx,
        channelId,
        updatedChannel?.customFields as Record<string, unknown>
      );
    }

    return decision;
  }

  /**
   * Check if channel is in trial period
   */
  async isInTrial(ctx: RequestContext, channel: Channel): Promise<boolean> {
    const decision = getSubscriptionAccess(
      ctx,
      channel.id.toString(),
      channel.customFields as Record<string, unknown>
    );
    return decision.status === 'trial' && decision.access === 'full';
  }

  /**
   * Check if subscription is active
   */
  async isSubscriptionActive(ctx: RequestContext, channel: Channel): Promise<boolean> {
    const decision = getSubscriptionAccess(
      ctx,
      channel.id.toString(),
      channel.customFields as Record<string, unknown>
    );
    return decision.status === 'active' && decision.access === 'full';
  }

  /**
   * Initiate subscription purchase
   * Note: email parameter is kept for API compatibility but generates unique email from phone number for Paystack
   */
  async initiatePurchase(
    ctx: RequestContext,
    channelId: string,
    tierId: string,
    billingCycle: 'monthly' | 'yearly',
    phoneNumber: string,
    email: string, // Kept for API compatibility, not used
    paymentMethod?: string
  ): Promise<InitiatePurchaseResult> {
    try {
      // Validate tierId before database query
      if (!tierId || tierId === '-1') {
        this.logger.warn(`Invalid tierId provided: ${tierId}`);
        return {
          success: false,
          message: `Invalid subscription tier ID: "${tierId}" is not a valid tier ID`,
        };
      }

      // Validate tierId is a valid UUID format
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(tierId)) {
        this.logger.warn(`Invalid tierId format provided: ${tierId}`);
        return {
          success: false,
          message: `Invalid subscription tier ID format: "${tierId}" is not a valid UUID`,
        };
      }

      // Get channel and tier
      const channel = await this.channelService.findOne(ctx, channelId);
      if (!channel) {
        return { success: false, message: 'Channel not found' };
      }

      const tierRepo = this.connection.rawConnection.getRepository(SubscriptionTier);
      const tier = await tierRepo.findOne({ where: { id: tierId } });
      if (!tier) {
        return { success: false, message: 'Subscription tier not found' };
      }

      const amount = billingCycle === 'monthly' ? tier.priceMonthly : tier.priceYearly;
      const amountInKes = amount / 100; // Convert from cents to KES

      // Create or get Paystack customer
      let customerCode = (channel.customFields as any).paystackCustomerCode;
      if (!customerCode) {
        try {
          // Generate unique email from phone number for Paystack (email parameter kept for API compatibility only)
          const paystackEmail = generatePaystackEmailFromPhone(phoneNumber);
          const customer = await this.paystackService.createCustomer(
            paystackEmail,
            undefined,
            undefined,
            phoneNumber,
            { channelId, tierId, billingCycle }
          );
          customerCode = customer.data.customer_code;

          // Update channel with customer code
          await this.channelService.update(ctx, {
            id: channelId,
            customFields: {
              paystackCustomerCode: customerCode,
            },
          });
        } catch (error) {
          this.logger.error(
            `Failed to create Paystack customer: ${error instanceof Error ? error.message : String(error)}`
          );
          return { success: false, message: 'Failed to create customer in Paystack' };
        }
      }

      // Generate reference
      const reference = `SUB-${channelId}-${Date.now()}`;

      // Route based on payment method
      // If paymentMethod is 'checkout' or any other value (not 'mobile_money'), use checkout redirect
      // If paymentMethod is 'mobile_money' or not specified, use STK push
      const useCheckout = paymentMethod && paymentMethod !== 'mobile_money';

      if (useCheckout) {
        // Redirect to Paystack checkout for card and other payment methods
        try {
          // Generate unique email from phone number for Paystack
          const paystackEmail = generatePaystackEmailFromPhone(phoneNumber);
          const transactionResponse = await this.paystackService.initializeTransaction(
            amountInKes,
            paystackEmail,
            phoneNumber,
            {
              channelId,
              tierId,
              billingCycle,
              type: 'subscription',
              reference,
            }
          );

          return {
            success: true,
            reference: transactionResponse.data.reference,
            authorizationUrl: transactionResponse.data.authorization_url,
            message: 'Payment link generated. Please complete payment.',
          };
        } catch (error) {
          this.logger.error(
            `Failed to initialize transaction: ${error instanceof Error ? error.message : String(error)}`
          );
          return {
            success: false,
            message: error instanceof Error ? error.message : 'Failed to initialize payment',
          };
        }
      }

      // Use STK push for mobile money (default behavior)
      try {
        // Generate unique email from phone number for Paystack
        const paystackEmail = generatePaystackEmailFromPhone(phoneNumber);
        const chargeResponse = await this.paystackService.chargeMobile(
          amountInKes,
          phoneNumber,
          paystackEmail,
          reference,
          {
            channelId,
            tierId,
            billingCycle,
            type: 'subscription',
          }
        );

        // Verify that STK push was actually initiated
        // Paystack returns various statuses when STK push is sent:
        // - "pending": waiting for user action
        // - "sent": STK push sent to user's phone
        // - "pay_offline": user needs to complete payment on their phone (STK push sent)
        // - "success": payment already completed
        // If status indicates failure or unexpected state, fall back to payment link
        const responseStatus = chargeResponse.data?.status?.toLowerCase();
        const validStkStatuses = ['pending', 'sent', 'pay_offline', 'success'];

        if (!responseStatus || !validStkStatuses.includes(responseStatus)) {
          // STK push was not successfully initiated, fall back to payment link
          this.logger.warn(
            `STK push failed (status: ${responseStatus}), falling back to payment link`,
            { reference, status: responseStatus }
          );
          throw new Error(`STK push not initiated: status ${responseStatus}`);
        }

        return {
          success: true,
          reference: chargeResponse.data.reference,
          message: 'Payment initiated. Please check your phone for STK push prompt.',
        };
      } catch (error) {
        // Fallback to payment link if STK push fails
        const errorMessage = error instanceof Error ? error.message : String(error);
        const isTimeout = errorMessage.includes('timed out');

        if (isTimeout) {
          this.logger.warn(`STK push timed out, falling back to payment link`, { reference });
        } else {
          this.logger.warn(`STK push failed, falling back to payment link`, {
            reference,
            error: errorMessage,
          });
        }

        // Attempt to generate payment link as fallback
        try {
          // Generate unique email from phone number for Paystack
          const paystackEmail = generatePaystackEmailFromPhone(phoneNumber);
          const transactionResponse = await this.paystackService.initializeTransaction(
            amountInKes,
            paystackEmail,
            phoneNumber,
            {
              channelId,
              tierId,
              billingCycle,
              type: 'subscription',
              reference,
            }
          );

          return {
            success: true,
            reference: transactionResponse.data.reference,
            authorizationUrl: transactionResponse.data.authorization_url,
            message: 'Payment link generated. Please complete payment.',
          };
        } catch (fallbackError) {
          // If fallback also fails, return error
          const fallbackErrorMessage =
            fallbackError instanceof Error ? fallbackError.message : String(fallbackError);
          this.logger.error(`Both STK push and payment link generation failed`, {
            reference,
            originalError: errorMessage,
            fallbackError: fallbackErrorMessage,
          });
          return {
            success: false,
            message: `Payment initiation failed. Please try again or contact support.`,
          };
        }
      }
    } catch (error) {
      this.logger.error(
        `Failed to initiate purchase: ${error instanceof Error ? error.message : String(error)}`
      );
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Failed to initiate purchase',
      };
    }
  }

  /**
   * Process successful payment
   */
  async processSuccessfulPayment(
    ctx: RequestContext,
    channelId: string,
    paystackData: {
      reference: string;
      amount: number;
      customerCode?: string;
      subscriptionCode?: string;
    }
  ): Promise<void> {
    const channel = await this.channelService.findOne(ctx, channelId);
    if (!channel) {
      throw new Error(`Channel ${channelId} not found`);
    }

    const customFields = channel.customFields as any;
    const subscriptionTierRef = customFields.subscriptionTier ?? null;
    const tierId =
      (typeof subscriptionTierRef === 'string' && subscriptionTierRef) ||
      (typeof subscriptionTierRef === 'object' && subscriptionTierRef?.id) ||
      customFields.subscriptionTierId ||
      customFields.subscriptionTierId?.id ||
      customFields.subscriptiontierid ||
      null;
    if (!tierId) {
      throw new Error('No subscription tier associated with channel');
    }

    const tierRepo = this.connection.rawConnection.getRepository(SubscriptionTier);
    const tier = await tierRepo.findOne({ where: { id: tierId } });
    if (!tier) {
      throw new Error('Subscription tier not found');
    }

    // Prepaid extension logic: New Expiry = MAX(Current Expiry, Trial End, Now) + Billing Cycle.
    const billingCycle = customFields.billingCycle || 'monthly';
    const currentExpiry = customFields.subscriptionExpiresAt
      ? new Date(customFields.subscriptionExpiresAt)
      : null;
    const trialEnd = customFields.trialEndsAt ? new Date(customFields.trialEndsAt) : null;
    // Use Math.max to find the latest date, defaulting to now if dates are null/undefined
    const baseDate = new Date(
      Math.max(currentExpiry?.getTime() || 0, trialEnd?.getTime() || 0, Date.now())
    );

    // Add billing period to base date
    const expiresAt = new Date(baseDate);
    if (billingCycle === 'monthly') {
      expiresAt.setMonth(expiresAt.getMonth() + 1);
    } else {
      expiresAt.setFullYear(expiresAt.getFullYear() + 1);
    }

    // Update channel subscription fields
    const updateData: any = {
      subscriptionStatus: 'active',
      subscriptionStartedAt: customFields.subscriptionStartedAt || new Date(),
      subscriptionExpiresAt: expiresAt,
      subscriptionExemptUntil: null,
      subscriptionExemptReason: null,
      subscriptionGracePeriodEnd: null,
      subscriptionExpiredReminderSentAt: null,
      lastPaymentDate: new Date(),
      lastPaymentAmount: paystackData.amount,
    };

    if (paystackData.customerCode) {
      updateData.paystackCustomerCode = paystackData.customerCode;
    }

    if (paystackData.subscriptionCode) {
      updateData.paystackSubscriptionCode = paystackData.subscriptionCode;
    }

    await this.channelService.update(ctx, {
      id: channelId,
      customFields: updateData,
    });

    // Renewal updated the channel fields; clear any cached decision so the same
    // request (and subsequent requests) see the renewed state immediately.
    clearSubscriptionAccess(ctx, channelId);

    // Publish subscription renewed event
    this.eventBus.publish(
      new SubscriptionAlertEvent(ctx, channelId, 'renewed', {
        expiresAt: expiresAt.toISOString(),
        billingCycle,
        amount: paystackData.amount,
      })
    );

    this.logger.log(`Subscription activated for channel ${channelId}`);
  }

  /**
   * Check payment status for a transaction reference
   * This is the single source of truth for payment verification
   *
   * Flow:
   * 1. Check channel state - if subscription already active (webhook processed), return success
   * 2. Check cache - if recently verified (within TTL), return cached result
   * 3. Call Paystack - if status unknown, verify with Paystack API
   * 4. Cache result and return
   */
  async checkPaymentStatus(
    ctx: RequestContext,
    channelId: string,
    reference: string
  ): Promise<{ success: boolean; status: 'success' | 'pending' | 'failed'; message?: string }> {
    try {
      // Step 1: Check channel state first (webhook may have already processed payment)
      const channel = await this.channelService.findOne(ctx, channelId);
      if (channel) {
        const customFields = channel.customFields as any;
        const subscriptionStatus = customFields.subscriptionStatus;
        const lastPaymentDate = customFields.lastPaymentDate;

        // If subscription is active and payment was recent (within last 5 minutes), likely this payment
        if (subscriptionStatus === 'active' && lastPaymentDate) {
          const paymentDate = new Date(lastPaymentDate);
          const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);

          if (paymentDate > fiveMinutesAgo) {
            return { success: true, status: 'success', message: 'Payment already processed' };
          }
        }
      }

      // Step 2: Check cache
      const cached = await this.redisCache.get<PaymentStatusCacheEntry>(
        this.CACHE_NAMESPACE,
        reference
      );
      if (cached) {
        // Check if cache entry is still valid (within TTL)
        const age = Date.now() - cached.timestamp;
        const ageSeconds = age / 1000;
        if (ageSeconds < this.CACHE_TTL_SECONDS) {
          return {
            success: cached.status === 'success',
            status: cached.status,
            message: cached.status === 'success' ? 'Payment verified' : 'Payment pending',
          };
        }
        // Cache entry expired, will be handled by Redis TTL or fallback cleanup
      }

      // Step 3: Verify with Paystack API
      const verification = await this.paystackService.verifyTransaction(reference);

      let status: 'success' | 'pending' | 'failed';
      let success = false;

      if (verification.data.status === 'success') {
        status = 'success';
        success = true;

        // Process successful payment
        const customerCode =
          verification.data.customer?.customer_code ||
          (verification.data.metadata as any)?.customerCode;

        await this.processSuccessfulPayment(ctx, channelId, {
          reference,
          amount: verification.data.amount,
          customerCode: customerCode,
        });
      } else if (verification.data.status === 'pending' || verification.data.status === 'sent') {
        status = 'pending';
        success = false;
      } else {
        status = 'failed';
        success = false;
        this.logger.warn(
          `Payment ${reference} verification failed with status: ${verification.data.status}`
        );
      }

      // Step 4: Cache result
      await this.redisCache.set(
        this.CACHE_NAMESPACE,
        reference,
        {
          status,
          timestamp: Date.now(),
        },
        this.CACHE_TTL_SECONDS
      );

      return {
        success,
        status,
        message: success
          ? 'Payment verified successfully'
          : status === 'pending'
            ? 'Payment is pending'
            : 'Payment verification failed',
      };
    } catch (error) {
      this.logger.error(
        `Error checking payment status for ${reference}: ${error instanceof Error ? error.message : String(error)}`
      );

      // Cache failure to prevent repeated API calls
      await this.redisCache.set(
        this.CACHE_NAMESPACE,
        reference,
        {
          status: 'failed',
          timestamp: Date.now(),
        },
        this.CACHE_TTL_SECONDS
      );

      return {
        success: false,
        status: 'failed',
        message: error instanceof Error ? error.message : 'Failed to verify payment',
      };
    }
  }

  /**
   * Request-driven transition: called when a live request detects that an active
   * or trial subscription has just expired. Computes the grace base date and
   * delegates to {@link enterGracePeriod}.
   */
  async handleExpiredSubscription(ctx: RequestContext, channelId: string): Promise<void> {
    const channel = await this.channelService.findOne(ctx, channelId);
    if (!channel) {
      return;
    }

    const customFields = channel.customFields as Record<string, unknown>;
    if (customFields.subscriptionStatus === 'expired') {
      return; // Already expired
    }

    const expiredReminderSent = !!customFields.subscriptionExpiredReminderSentAt;
    if (expiredReminderSent) {
      // The expired alert was already handled; the worker will drive hard_expired.
      return;
    }

    const expiryDate =
      parseDate(customFields.subscriptionExpiresAt) ?? parseDate(customFields.trialEndsAt);
    const exemptionEndsAt = parseDate(customFields.subscriptionExemptUntil);
    // If the channel was covered by an exemption that has since lapsed, the grace
    // period should start from the exemption end date rather than the original
    // subscription expiry date.
    const graceBaseDate = exemptionEndsAt ?? expiryDate ?? new Date();

    await this.enterGracePeriod(ctx, channelId, {
      baseDate: graceBaseDate,
      expiryDate,
    });

    this.logger.log(`Subscription expired for channel ${channelId}`);
  }

  /**
   * Transition a channel into the expired state with a computed grace period.
   * This is the single writer for subscription expiry transitions.
   *
   * Returns `true` only if this caller was the first to perform the transition
   * (and, for non-silent calls, emit the alert). Callers that lose the race or
   * find the channel already transitioned receive `false` and must not publish
   * duplicate events.
   */
  async enterGracePeriod(
    ctx: RequestContext,
    channelId: string,
    input: { baseDate?: Date; expiryDate?: Date; silent?: boolean }
  ): Promise<boolean> {
    const channel = await this.channelService.findOne(ctx, channelId);
    if (!channel) {
      return false;
    }

    const customFields = channel.customFields as Record<string, unknown>;
    const alreadyExpired =
      customFields.subscriptionStatus === 'expired' && !!customFields.subscriptionGracePeriodEnd;
    if (alreadyExpired) {
      return false;
    }

    if (this.expiryTransitionLock.has(channelId)) {
      return false;
    }
    this.expiryTransitionLock.add(channelId);

    try {
      // Re-check after acquiring the lock so a concurrent caller that already
      // wrote the transition does not repeat the work.
      const lockedChannel = await this.channelService.findOne(ctx, channelId);
      if (!lockedChannel) {
        return false;
      }
      const lockedFields = lockedChannel.customFields as Record<string, unknown>;
      if (
        lockedFields.subscriptionStatus === 'expired' &&
        !!lockedFields.subscriptionGracePeriodEnd
      ) {
        return false;
      }

      const now = new Date();
      const baseDate = input.baseDate ?? now;
      const gracePeriodEnd = getDefaultGracePeriodEnd(baseDate);

      // Atomic cross-process claim: only the winner writes the transition.
      const transitionTtlSeconds = Math.max(
        Math.ceil((gracePeriodEnd.getTime() - now.getTime()) / 1000) + 86400,
        86400
      );
      const claimKey = channelId;
      const claimed = await this.redisCache.setnx(
        'subscription:expiry-transition',
        claimKey,
        true,
        transitionTtlSeconds
      );
      if (!claimed) {
        return false;
      }

      try {
        await this.channelService.update(ctx, {
          id: channelId,
          customFields: {
            subscriptionStatus: 'expired',
            subscriptionGracePeriodEnd: gracePeriodEnd,
          },
        });
      } catch (error) {
        // Release the claim so the next attempt can retry the DB write.
        await this.redisCache.delete('subscription:expiry-transition', claimKey);
        throw error;
      }

      if (!input.silent) {
        if (gracePeriodEnd <= now) {
          this.eventBus.publish(
            new SubscriptionAlertEvent(ctx, channelId, 'hard_expired', {
              gracePeriodEnd: gracePeriodEnd.toISOString(),
              daysRemaining: 0,
              company: (channel as any).code || 'your company',
            })
          );
        } else {
          this.eventBus.publish(
            new SubscriptionAlertEvent(ctx, channelId, 'expired', {
              expiresAt: input.expiryDate?.toISOString(),
              gracePeriodEnd: gracePeriodEnd.toISOString(),
              company: (channel as any).code || 'your company',
            })
          );
        }

        await this.markExpiredReminderSent(ctx, channelId);
      }

      return true;
    } finally {
      this.expiryTransitionLock.delete(channelId);
    }
  }

  /**
   * Suspend a legacy expired channel with no known expiry source. Sets the grace
   * period end to now so it is immediately blocked without granting a fresh grace
   * period. Never suspends an active channel; use {@link enterGracePeriod} for
   * normal expiry transitions.
   *
   * Returns `true` only if this caller performed the suspension so the caller
   * can decide whether to publish a duplicate alert.
   */
  async suspendLegacyExpired(ctx: RequestContext, channelId: string): Promise<boolean> {
    const channel = await this.channelService.findOne(ctx, channelId);
    if (!channel) {
      return false;
    }

    const customFields = channel.customFields as Record<string, unknown>;
    if (customFields.subscriptionStatus !== 'expired') {
      this.logger.warn(
        `Refusing to suspendLegacyExpired channel ${channelId} with status ${customFields.subscriptionStatus}`
      );
      return false;
    }

    if (customFields.subscriptionGracePeriodEnd) {
      // Already transitioned; don't overwrite an existing grace period.
      return false;
    }

    const now = new Date();
    const claimKey = `${channelId}:legacy`;
    const claimed = await this.redisCache.setnx(
      'subscription:expiry-transition',
      claimKey,
      true,
      86400
    );
    if (!claimed) {
      return false;
    }

    try {
      await this.channelService.update(ctx, {
        id: channelId,
        customFields: {
          subscriptionStatus: 'expired',
          subscriptionGracePeriodEnd: now,
        },
      });
    } catch (error) {
      await this.redisCache.delete('subscription:expiry-transition', claimKey);
      throw error;
    }

    return true;
  }

  /**
   * Mark expired reminder as sent
   */
  async markExpiredReminderSent(ctx: RequestContext, channelId: string): Promise<void> {
    await this.channelService.update(ctx, {
      id: channelId,
      customFields: {
        subscriptionExpiredReminderSentAt: new Date(),
      },
    });
  }

  /**
   * Check if we have ever sent an expired reminder for this channel.
   * Used for the one-time bypass when all admins have notifications disabled.
   */
  async hasEverSentExpiredReminder(ctx: RequestContext, channelId: string): Promise<boolean> {
    const channel = await this.channelService.findOne(ctx, channelId);
    if (!channel) return false;
    const lastSent = (channel.customFields as any)?.subscriptionExpiredReminderSentAt;
    return !!lastSent;
  }

  /**
   * Check if channel can perform action (not expired/cancelled)
   */
  async canPerformAction(ctx: RequestContext, channelId: string, action: string): Promise<boolean> {
    const status = await this.checkSubscriptionStatus(ctx, channelId);

    // Allow subscription-related actions even if expired
    const normalizedAction = action.toLowerCase();
    if (normalizedAction.includes('subscription') || normalizedAction.includes('payment')) {
      return true;
    }

    return status.canWrite;
  }

  /**
   * Get subscription tier
   */
  async getSubscriptionTier(tierId: string): Promise<SubscriptionTier | null> {
    if (!tierId || tierId === '-1') {
      return null;
    }
    const tierRepo = this.connection.rawConnection.getRepository(SubscriptionTier);
    return tierRepo.findOne({ where: { id: tierId } });
  }

  /**
   * Get channel subscription details including tier
   */
  async getChannelSubscription(
    ctx: RequestContext,
    channelId: string
  ): Promise<{
    tier: SubscriptionTier | null;
    status: string;
    trialEndsAt?: Date;
    subscriptionStartedAt?: Date;
    subscriptionExpiresAt?: Date;
    billingCycle?: string;
    lastPaymentDate?: Date;
    lastPaymentAmount?: number;
    access: SubscriptionAccess;
    reason: SubscriptionPolicyReason;
    expiresAt?: Date;
    exemptionEndsAt?: Date;
    exemptionReason?: string;
    gracePeriodEnd?: Date;
    canWrite: boolean;
    canRead: boolean;
  }> {
    const channel = await this.channelService.findOne(ctx, channelId);
    if (!channel) {
      throw new Error(`Channel ${channelId} not found`);
    }

    const customFields = channel.customFields as any;
    const subscriptionTierRef = customFields.subscriptionTier ?? null;
    const tierId =
      (typeof subscriptionTierRef === 'string' && subscriptionTierRef) ||
      (typeof subscriptionTierRef === 'object' && subscriptionTierRef?.id) ||
      customFields.subscriptionTierId ||
      customFields.subscriptionTierId?.id ||
      customFields.subscriptiontierid ||
      null;

    // Get tier if tierId exists and is valid (not "-1")
    let tier: SubscriptionTier | null = null;
    if (tierId && tierId !== '-1') {
      tier = await this.getSubscriptionTier(tierId);
    }
    const access = getSubscriptionAccess(ctx, channelId, customFields);

    return {
      tier: tier || null,
      status: access.status,
      trialEndsAt: customFields.trialEndsAt ? new Date(customFields.trialEndsAt) : undefined,
      subscriptionStartedAt: customFields.subscriptionStartedAt
        ? new Date(customFields.subscriptionStartedAt)
        : undefined,
      subscriptionExpiresAt: customFields.subscriptionExpiresAt
        ? new Date(customFields.subscriptionExpiresAt)
        : undefined,
      billingCycle: customFields.billingCycle || undefined,
      lastPaymentDate: customFields.lastPaymentDate
        ? new Date(customFields.lastPaymentDate)
        : undefined,
      lastPaymentAmount: customFields.lastPaymentAmount || undefined,
      access: access.access,
      reason: access.reason,
      expiresAt: access.expiresAt,
      exemptionEndsAt: access.exemptionEndsAt,
      exemptionReason: access.exemptionReason,
      gracePeriodEnd: access.gracePeriodEnd,
      canWrite: access.canWrite,
      canRead: access.canRead,
    };
  }

  /**
   * Get all subscription tiers (active and inactive)
   */
  async getAllSubscriptionTiers(): Promise<SubscriptionTier[]> {
    const tierRepo = this.connection.rawConnection.getRepository(SubscriptionTier);
    return tierRepo.find({ order: { priceMonthly: 'ASC' } });
  }

  /**
   * Get active subscription tiers for public/marketing use (shop API).
   * Returns only display-safe fields; no id, isActive, smsLimit, or timestamps.
   */
  async getActiveSubscriptionTiersForPublic(): Promise<
    {
      code: string;
      name: string;
      description: string | null;
      priceMonthly: number;
      priceYearly: number;
      features: string[];
    }[]
  > {
    const tierRepo = this.connection.rawConnection.getRepository(SubscriptionTier);
    const tiers = await tierRepo.find({
      where: { isActive: true },
      order: { priceMonthly: 'ASC' },
    });
    const MAX_DESCRIPTION_LENGTH = 500;
    return tiers.map(tier => {
      const priceMonthly = Math.max(0, tier.priceMonthly);
      const priceYearly = Math.max(0, tier.priceYearly);
      let description: string | null = tier.description ?? null;
      if (description && description.length > MAX_DESCRIPTION_LENGTH) {
        description = description.slice(0, MAX_DESCRIPTION_LENGTH);
      }
      const rawFeatures = tier.features?.features;
      const features = Array.isArray(rawFeatures)
        ? rawFeatures.filter((f): f is string => typeof f === 'string')
        : [];
      return {
        code: tier.code,
        name: tier.name,
        description,
        priceMonthly,
        priceYearly,
        features,
      };
    });
  }

  /**
   * Normalize tier limits to a clean object with positive integers only.
   */
  private normalizeTierLimits(limits: any): SubscriptionTierLimits | null {
    if (limits == null) return null;
    if (typeof limits !== 'object' || Array.isArray(limits)) return null;

    const result: SubscriptionTierLimits = {};
    for (const key of Object.keys(limits) as Array<keyof SubscriptionTierLimits>) {
      const value = limits[key];
      if (typeof value === 'number' && Number.isInteger(value) && value > 0) {
        result[key] = value;
      }
    }
    return Object.keys(result).length > 0 ? result : null;
  }

  /**
   * Normalize tier features to { features: string[] }.
   * Accepts: { features: ["a","b"] } or { features: [ { text: "a", included: true }, ... ] }.
   * Stored and public API use string[] only.
   */
  private normalizeTierFeatures(features: any): SubscriptionTierFeatures {
    if (features == null) return { features: [] };
    const raw =
      typeof features === 'object' && Array.isArray(features.features) ? features.features : [];
    const list = raw
      .map((f: any) =>
        typeof f === 'string' ? f : f && typeof f.text === 'string' ? f.text : String(f ?? '')
      )
      .filter(Boolean);
    return { features: list };
  }

  /**
   * Create a new subscription tier
   */
  async createSubscriptionTier(
    ctx: RequestContext,
    input: {
      code: string;
      name: string;
      description?: string;
      priceMonthly: number;
      priceYearly: number;
      features?: any;
      smsLimit?: number | null;
      limits?: SubscriptionTierLimits | null;
      isActive?: boolean;
    }
  ): Promise<SubscriptionTier> {
    const tierRepo = this.connection.rawConnection.getRepository(SubscriptionTier);

    // Check if code already exists
    const existing = await tierRepo.findOne({ where: { code: input.code } });
    if (existing) {
      throw new Error(`Subscription tier with code "${input.code}" already exists`);
    }

    const limits = this.normalizeTierLimits(input.limits);
    const tier = tierRepo.create({
      code: input.code,
      name: input.name,
      description: input.description ?? undefined,
      priceMonthly: input.priceMonthly,
      priceYearly: input.priceYearly,
      features: this.normalizeTierFeatures(input.features),
      smsLimit: input.smsLimit ?? 0,
      limits,
      isActive: input.isActive !== undefined ? input.isActive : true,
    });

    const saved = await tierRepo.save(tier);
    this.logger.log(`Created subscription tier: ${saved.code} (${saved.name})`);
    return saved;
  }

  /**
   * Update an existing subscription tier
   */
  async updateSubscriptionTier(
    ctx: RequestContext,
    input: {
      id: string;
      code?: string;
      name?: string;
      description?: string;
      priceMonthly?: number;
      priceYearly?: number;
      features?: any;
      smsLimit?: number | null;
      limits?: SubscriptionTierLimits | null;
      isActive?: boolean;
    }
  ): Promise<SubscriptionTier> {
    const tierRepo = this.connection.rawConnection.getRepository(SubscriptionTier);

    const tier = await tierRepo.findOne({ where: { id: input.id } });
    if (!tier) {
      throw new Error(`Subscription tier with ID "${input.id}" not found`);
    }

    // Check if code is being changed and if new code already exists
    if (input.code && input.code !== tier.code) {
      const existing = await tierRepo.findOne({ where: { code: input.code } });
      if (existing) {
        throw new Error(`Subscription tier with code "${input.code}" already exists`);
      }
      tier.code = input.code;
    }

    if (input.name !== undefined) {
      tier.name = input.name;
    }
    if (input.description !== undefined) {
      tier.description = input.description;
    }
    if (input.priceMonthly !== undefined) {
      tier.priceMonthly = input.priceMonthly;
    }
    if (input.priceYearly !== undefined) {
      tier.priceYearly = input.priceYearly;
    }
    if (input.features !== undefined) {
      tier.features = this.normalizeTierFeatures(input.features);
    }
    if (input.smsLimit !== undefined) {
      tier.smsLimit = input.smsLimit;
      // Keep the new limits object in sync for code that reads limits.smsPerPeriod.
      if (input.limits === undefined) {
        tier.limits = {
          ...(tier.limits ?? {}),
          smsPerPeriod: input.smsLimit ?? 0,
        };
      }
    }
    if (input.limits !== undefined) {
      tier.limits = this.normalizeTierLimits(input.limits);
      // Keep the legacy smsLimit column in sync when limits.smsPerPeriod is provided.
      const inputSmsPerPeriod = (input.limits as any)?.smsPerPeriod;
      if (typeof inputSmsPerPeriod === 'number') {
        tier.smsLimit = inputSmsPerPeriod;
      }
    }
    if (input.isActive !== undefined) {
      tier.isActive = input.isActive;
    }

    const saved = await tierRepo.save(tier);
    this.logger.log(`Updated subscription tier: ${saved.code} (${saved.name})`);
    return saved;
  }

  /**
   * Delete a subscription tier (soft delete by setting isActive=false)
   */
  async deleteSubscriptionTier(ctx: RequestContext, id: string): Promise<boolean> {
    const tierRepo = this.connection.rawConnection.getRepository(SubscriptionTier);

    const tier = await tierRepo.findOne({ where: { id } });
    if (!tier) {
      throw new Error(`Subscription tier with ID "${id}" not found`);
    }

    // Soft delete by setting isActive to false
    tier.isActive = false;
    await tierRepo.save(tier);

    this.logger.log(`Deleted (deactivated) subscription tier: ${tier.code} (${tier.name})`);
    return true;
  }
}

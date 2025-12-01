import { Injectable, Logger } from '@nestjs/common';
import { Channel, ChannelService, RequestContext, TransactionalConnection } from '@vendure/core';
import { ChannelEventRouterService } from '../../infrastructure/events/channel-event-router.service';
import { ActionCategory } from '../../infrastructure/events/types/action-category.enum';
import { ChannelEventType } from '../../infrastructure/events/types/event-type.enum';
import { RedisCacheService } from '../../infrastructure/storage/redis-cache.service';
import { SubscriptionTier } from '../../plugins/subscriptions/subscription.entity';
import { PaystackService } from '../payments/paystack.service';

export interface SubscriptionStatus {
  isValid: boolean;
  status: 'trial' | 'active' | 'expired' | 'cancelled';
  daysRemaining?: number;
  expiresAt?: Date;
  trialEndsAt?: Date;
  canPerformAction: boolean;
  isEarlyTester?: boolean; // true if expiry dates are blank (set by admin)
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
  private readonly SYSTEM_EMAIL = 'malipo@dukarun.com';

  constructor(
    private channelService: ChannelService,
    private connection: TransactionalConnection,
    private paystackService: PaystackService,
    private eventRouter: ChannelEventRouterService,
    private redisCache: RedisCacheService
  ) { }

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

    const customFields = channel.customFields as any;
    const status = customFields.subscriptionStatus || 'trial';

    // Check if in trial
    if (status === 'trial') {
      const trialEndsAt = customFields.trialEndsAt ? new Date(customFields.trialEndsAt) : null;
      if (!trialEndsAt) {
        // Early tester - no expiry set by admin, allow full access indefinitely
        return {
          isValid: true,
          status: 'trial',
          canPerformAction: true,
          isEarlyTester: true,
          // No daysRemaining or trialEndsAt - indicates indefinite access
        };
      }
      if (trialEndsAt > new Date()) {
        const daysRemaining = Math.ceil(
          (trialEndsAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
        );
        return {
          isValid: true,
          status: 'trial',
          daysRemaining,
          trialEndsAt: trialEndsAt ?? undefined,
          canPerformAction: true,
          isEarlyTester: false,
        };
      } else {
        // Trial expired, mark as expired
        await this.handleExpiredSubscription(ctx, channelId);
        return {
          isValid: false,
          status: 'expired',
          canPerformAction: false,
          isEarlyTester: false,
        };
      }
    }

    // Check if subscription is active
    if (status === 'active') {
      const expiresAt = customFields.subscriptionExpiresAt
        ? new Date(customFields.subscriptionExpiresAt)
        : null;
      if (!expiresAt) {
        // Early tester - no expiry set by admin, allow full access indefinitely
        return {
          isValid: true,
          status: 'active',
          canPerformAction: true,
          isEarlyTester: true,
          // No daysRemaining or expiresAt - indicates indefinite access
        };
      }
      if (expiresAt > new Date()) {
        const daysRemaining = Math.ceil((expiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
        return {
          isValid: true,
          status: 'active',
          daysRemaining,
          expiresAt: expiresAt ?? undefined,
          canPerformAction: true,
          isEarlyTester: false,
        };
      } else {
        // Subscription expired
        await this.handleExpiredSubscription(ctx, channelId);
        return {
          isValid: false,
          status: 'expired',
          expiresAt: expiresAt ?? undefined,
          canPerformAction: false,
          isEarlyTester: false,
        };
      }
    }

    // Cancelled or expired
    return {
      isValid: false,
      status: status as 'expired' | 'cancelled',
      canPerformAction: false,
      isEarlyTester: false,
    };
  }

  /**
   * Check if channel is in trial period
   */
  async isInTrial(ctx: RequestContext, channel: Channel): Promise<boolean> {
    const customFields = channel.customFields as any;
    if (customFields.subscriptionStatus !== 'trial') {
      return false;
    }

    const trialEndsAt = customFields.trialEndsAt ? new Date(customFields.trialEndsAt) : null;
    return trialEndsAt ? trialEndsAt > new Date() : false;
  }

  /**
   * Check if subscription is active
   */
  async isSubscriptionActive(ctx: RequestContext, channel: Channel): Promise<boolean> {
    const customFields = channel.customFields as any;
    if (customFields.subscriptionStatus !== 'active') {
      return false;
    }

    const expiresAt = customFields.subscriptionExpiresAt
      ? new Date(customFields.subscriptionExpiresAt)
      : null;
    return expiresAt ? expiresAt > new Date() : false;
  }

  /**
   * Initiate subscription purchase
   * Note: email parameter is kept for API compatibility but always uses system email for Paystack
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
          // Always use system email for Paystack (email parameter kept for API compatibility only)
          const customer = await this.paystackService.createCustomer(
            this.SYSTEM_EMAIL,
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
          // Always use system email for Paystack
          const transactionResponse = await this.paystackService.initializeTransaction(
            amountInKes,
            this.SYSTEM_EMAIL,
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
        // Always use system email for Paystack
        const chargeResponse = await this.paystackService.chargeMobile(
          amountInKes,
          phoneNumber,
          this.SYSTEM_EMAIL,
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
          // Always use system email for Paystack
          const transactionResponse = await this.paystackService.initializeTransaction(
            amountInKes,
            this.SYSTEM_EMAIL,
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

    // Prepaid extension logic: New Expiry = MAX(Current Expiry, Trial End, Now) + Billing Cycle
    // Handles blank expiry dates (early testers) gracefully
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

    this.logger.log(`Subscription activated for channel ${channelId}`);

    // Emit subscription renewed event
    await this.eventRouter
      .routeEvent({
        type: ChannelEventType.SUBSCRIPTION_RENEWED,
        channelId,
        category: ActionCategory.SYSTEM_NOTIFICATIONS,
        context: ctx,
        data: {
          expiresAt: expiresAt.toISOString(),
          billingCycle,
          amount: paystackData.amount,
        },
      })
      .catch(err => {
        this.logger.warn(
          `Failed to emit subscription renewed event: ${err instanceof Error ? err.message : String(err)}`
        );
      });
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
   * Handle expired subscription
   */
  async handleExpiredSubscription(ctx: RequestContext, channelId: string): Promise<void> {
    const channel = await this.channelService.findOne(ctx, channelId);
    if (!channel) {
      return;
    }

    const customFields = channel.customFields as any;
    if (customFields.subscriptionStatus === 'expired') {
      return; // Already expired
    }

    await this.channelService.update(ctx, {
      id: channelId,
      customFields: {
        subscriptionStatus: 'expired',
      },
    });

    this.logger.log(`Subscription expired for channel ${channelId}`);
  }

  /**
   * Check if channel can perform action (not expired/cancelled)
   */
  async canPerformAction(ctx: RequestContext, channelId: string, action: string): Promise<boolean> {
    const status = await this.checkSubscriptionStatus(ctx, channelId);

    // Allow subscription-related actions even if expired
    if (action.includes('subscription') || action.includes('payment')) {
      return true;
    }

    return status.canPerformAction;
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

    return {
      tier: tier || null,
      status: customFields.subscriptionStatus || 'trial',
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
      isActive?: boolean;
    }
  ): Promise<SubscriptionTier> {
    const tierRepo = this.connection.rawConnection.getRepository(SubscriptionTier);

    // Check if code already exists
    const existing = await tierRepo.findOne({ where: { code: input.code } });
    if (existing) {
      throw new Error(`Subscription tier with code "${input.code}" already exists`);
    }

    const tier = tierRepo.create({
      code: input.code,
      name: input.name,
      description: input.description ?? undefined,
      priceMonthly: input.priceMonthly,
      priceYearly: input.priceYearly,
      features: input.features || { features: [] },
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
      tier.features = input.features;
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

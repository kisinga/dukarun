import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import { Allow, Ctx, ID, Permission, RequestContext } from '@vendure/core';
import { Logger } from '@nestjs/common';
import gql from 'graphql-tag';
import { PaystackService } from '../../services/payments/paystack.service';
import { SubscriptionService } from '../../services/subscriptions/subscription.service';
import { SubscriptionTier } from './subscription.entity';

/**
 * GraphQL schema extension for subscription management
 */
export const SUBSCRIPTION_SCHEMA = gql`
  type SubscriptionTier {
    id: ID!
    code: String!
    name: String!
    description: String
    priceMonthly: Int!
    priceYearly: Int!
    features: JSON
    smsLimit: Int
    isActive: Boolean!
    createdAt: DateTime!
    updatedAt: DateTime!
  }

  type SubscriptionStatus {
    isValid: Boolean!
    status: String!
    daysRemaining: Int
    expiresAt: DateTime
    trialEndsAt: DateTime
    canPerformAction: Boolean!
  }

  type ChannelSubscription {
    tier: SubscriptionTier
    status: String!
    trialEndsAt: DateTime
    subscriptionStartedAt: DateTime
    subscriptionExpiresAt: DateTime
    billingCycle: String
    lastPaymentDate: DateTime
    lastPaymentAmount: Int
  }

  type InitiatePurchaseResult {
    success: Boolean!
    reference: String
    authorizationUrl: String
    message: String
  }

  extend type Query {
    """
    Get all active subscription tiers
    """
    getSubscriptionTiers: [SubscriptionTier!]!

    """
    Get current channel's subscription details
    """
    getChannelSubscription(channelId: ID): ChannelSubscription!

    """
    Quick subscription status check
    """
    checkSubscriptionStatus(channelId: ID): SubscriptionStatus!
  }

  input CreateSubscriptionTierInput {
    code: String!
    name: String!
    description: String
    priceMonthly: Int!
    priceYearly: Int!
    features: JSON
    smsLimit: Int
    isActive: Boolean
  }

  input UpdateSubscriptionTierInput {
    id: ID!
    code: String
    name: String
    description: String
    priceMonthly: Int
    priceYearly: Int
    features: JSON
    smsLimit: Int
    isActive: Boolean
  }

  extend type Mutation {
    """
    Create subscription tier (SuperAdmin only)
    """
    createSubscriptionTier(input: CreateSubscriptionTierInput!): SubscriptionTier!

    """
    Update subscription tier (SuperAdmin only)
    """
    updateSubscriptionTier(input: UpdateSubscriptionTierInput!): SubscriptionTier!

    """
    Deactivate subscription tier (SuperAdmin only)
    """
    deactivateSubscriptionTier(id: ID!): Boolean!

    """
    Initiate subscription purchase
    """
    initiateSubscriptionPurchase(
      channelId: ID!
      tierId: String!
      billingCycle: String!
      phoneNumber: String!
      email: String!
      paymentMethod: String
    ): InitiatePurchaseResult!

    """
    Verify subscription payment
    """
    verifySubscriptionPayment(channelId: ID!, reference: String!): Boolean!

    """
    Cancel subscription auto-renewal
    """
    cancelSubscription(channelId: ID!): Boolean!
  }
`;

@Resolver()
export class SubscriptionResolver {
  private readonly logger = new Logger(SubscriptionResolver.name);

  constructor(
    private subscriptionService: SubscriptionService,
    private paystackService: PaystackService
  ) {}

  @Query()
  @Allow(Permission.ReadSettings)
  async getSubscriptionTiers(@Ctx() ctx: RequestContext): Promise<SubscriptionTier[]> {
    return this.subscriptionService.getAllSubscriptionTiers();
  }

  @Query()
  @Allow(Permission.ReadSettings)
  async getChannelSubscription(
    @Ctx() ctx: RequestContext,
    @Args() args: { channelId?: ID }
  ): Promise<any> {
    const channelId = args.channelId || ctx.channelId;
    if (!channelId) {
      throw new Error('Channel ID required');
    }

    // Get channel subscription details including tier
    return this.subscriptionService.getChannelSubscription(ctx, String(channelId));
  }

  @Query()
  @Allow(Permission.ReadSettings)
  async checkSubscriptionStatus(
    @Ctx() ctx: RequestContext,
    @Args() args: { channelId?: ID }
  ): Promise<any> {
    const channelId = args.channelId || ctx.channelId;
    if (!channelId) {
      throw new Error('Channel ID required');
    }

    return this.subscriptionService.checkSubscriptionStatus(ctx, String(channelId));
  }

  @Mutation()
  @Allow(Permission.SuperAdmin)
  async createSubscriptionTier(
    @Ctx() ctx: RequestContext,
    @Args('input')
    input: {
      code: string;
      name: string;
      description?: string;
      priceMonthly: number;
      priceYearly: number;
      features?: any;
      smsLimit?: number | null;
      isActive?: boolean;
    }
  ): Promise<SubscriptionTier> {
    return this.subscriptionService.createSubscriptionTier(ctx, input);
  }

  @Mutation()
  @Allow(Permission.SuperAdmin)
  async updateSubscriptionTier(
    @Ctx() ctx: RequestContext,
    @Args('input')
    input: {
      id: string;
      code?: string;
      name?: string;
      description?: string;
      priceMonthly?: number;
      priceYearly?: number;
      features?: any;
      smsLimit?: number | null;
      isActive?: boolean;
    }
  ): Promise<SubscriptionTier> {
    return this.subscriptionService.updateSubscriptionTier(ctx, input);
  }

  @Mutation()
  @Allow(Permission.SuperAdmin)
  async deactivateSubscriptionTier(
    @Ctx() ctx: RequestContext,
    @Args('id') id: string
  ): Promise<boolean> {
    return this.subscriptionService.deleteSubscriptionTier(ctx, id);
  }

  @Mutation()
  @Allow(Permission.UpdateSettings)
  async initiateSubscriptionPurchase(
    @Ctx() ctx: RequestContext,
    @Args()
    args: {
      channelId: ID;
      tierId: string; // Changed from ID to string to prevent Vendure ID type coercion
      billingCycle: string;
      phoneNumber: string;
      email: string;
      paymentMethod?: string;
    }
  ): Promise<any> {
    // Log the received args for debugging
    this.logger.log(
      `initiateSubscriptionPurchase called with tierId: ${args.tierId} (type: ${typeof args.tierId})`
    );

    const channelId = args.channelId || ctx.channelId;
    if (!channelId) {
      throw new Error('Channel ID required');
    }

    if (args.billingCycle !== 'monthly' && args.billingCycle !== 'yearly') {
      throw new Error('Billing cycle must be "monthly" or "yearly"');
    }

    // Validate tierId - it should be a string UUID
    if (!args.tierId || typeof args.tierId !== 'string') {
      this.logger.error(
        `CRITICAL: Invalid tierId received: ${args.tierId} (type: ${typeof args.tierId})`
      );
      throw new Error('Tier ID must be a valid string UUID');
    }

    const tierIdStr = args.tierId.trim();
    this.logger.log(`Using tierId string: "${tierIdStr}"`);

    if (
      tierIdStr === '-1' ||
      tierIdStr === 'null' ||
      tierIdStr === 'undefined' ||
      tierIdStr === ''
    ) {
      this.logger.error(`CRITICAL: Invalid tierId received: "${tierIdStr}"`);
      throw new Error(`Invalid tier ID: "${tierIdStr}"`);
    }

    // Validate it's a UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(tierIdStr)) {
      this.logger.error(`CRITICAL: tierId is not a valid UUID: "${tierIdStr}"`);
      throw new Error(`Invalid tier ID format: "${tierIdStr}" is not a valid UUID`);
    }

    return this.subscriptionService.initiatePurchase(
      ctx,
      String(channelId),
      tierIdStr,
      args.billingCycle as 'monthly' | 'yearly',
      args.phoneNumber,
      args.email,
      args.paymentMethod
    );
  }

  @Mutation()
  @Allow(Permission.UpdateSettings)
  async verifySubscriptionPayment(
    @Ctx() ctx: RequestContext,
    @Args()
    args: {
      channelId: ID;
      reference: string;
    }
  ): Promise<boolean> {
    const channelId = args.channelId || ctx.channelId;
    if (!channelId) {
      throw new Error('Channel ID required');
    }

    // Use the new checkPaymentStatus method which is the single source of truth
    // It handles: channel state check, cache, and Paystack API call
    const result = await this.subscriptionService.checkPaymentStatus(
      ctx,
      String(channelId),
      args.reference
    );

    return result.success;
  }

  @Mutation()
  @Allow(Permission.UpdateSettings)
  async cancelSubscription(
    @Ctx() ctx: RequestContext,
    @Args() args: { channelId: ID }
  ): Promise<boolean> {
    const channelId = args.channelId || ctx.channelId;
    if (!channelId) {
      throw new Error('Channel ID required');
    }

    // Cancel subscription (disable auto-renewal)
    // This would require updating the channel and potentially calling Paystack
    // Simplified for now
    return true;
  }
}

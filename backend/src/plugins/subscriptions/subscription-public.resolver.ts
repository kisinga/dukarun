import { Query, Resolver } from '@nestjs/graphql';
import { Allow, Ctx, GlobalSettingsService, Permission, RequestContext } from '@vendure/core';
import gql from 'graphql-tag';
import { SubscriptionService } from '../../services/subscriptions/subscription.service';

/**
 * Display-safe subscription tier for public/marketing (shop API).
 * No id, isActive, smsLimit, or timestamps.
 */
export const SUBSCRIPTION_PUBLIC_SCHEMA = gql`
  type PublicSubscriptionTier {
    code: String!
    name: String!
    description: String
    priceMonthly: Int!
    priceYearly: Int!
    features: [String!]!
  }

  type PublicPlatformConfig {
    trialDays: Int!
  }

  extend type Query {
    """
    Get active subscription tiers for marketing (pricing section). Public, no auth required.
    """
    getPublicSubscriptionTiers: [PublicSubscriptionTier!]!

    """
    Get platform config for marketing (e.g. trial length). Public, no auth required.
    """
    getPublicPlatformConfig: PublicPlatformConfig!
  }
`;

@Resolver()
export class SubscriptionPublicResolver {
  constructor(
    private readonly subscriptionService: SubscriptionService,
    private readonly globalSettingsService: GlobalSettingsService
  ) {}

  @Query()
  @Allow(Permission.Public)
  async getPublicSubscriptionTiers() {
    return this.subscriptionService.getActiveSubscriptionTiersForPublic();
  }

  @Query()
  @Allow(Permission.Public)
  async getPublicPlatformConfig(@Ctx() ctx: RequestContext) {
    const settings = await this.globalSettingsService.getSettings(ctx);
    const trialDays = (settings as { customFields?: { trialDays?: number } }).customFields
      ?.trialDays;
    const value = typeof trialDays === 'number' && trialDays >= 0 ? trialDays : 30;
    return { trialDays: value };
  }
}

import { graphql } from '../../core/graphql/generated';

/**
 * Subscription tier operations for the super-admin app.
 */

export const GET_SUBSCRIPTION_TIERS = graphql(`
  query GetSubscriptionTiers {
    getSubscriptionTiers {
      id
      code
      name
      description
      priceMonthly
      priceYearly
      features
      limits
      isActive
      createdAt
      updatedAt
    }
  }
`);

export const CREATE_SUBSCRIPTION_TIER = graphql(`
  mutation CreateSubscriptionTier($input: CreateSubscriptionTierInput!) {
    createSubscriptionTier(input: $input) {
      id
      code
      name
      priceMonthly
      priceYearly
      limits
      isActive
    }
  }
`);

export const UPDATE_SUBSCRIPTION_TIER = graphql(`
  mutation UpdateSubscriptionTier($input: UpdateSubscriptionTierInput!) {
    updateSubscriptionTier(input: $input) {
      id
      code
      name
      priceMonthly
      priceYearly
      limits
      isActive
    }
  }
`);

export const DEACTIVATE_SUBSCRIPTION_TIER = graphql(`
  mutation DeactivateSubscriptionTier($id: String!) {
    deactivateSubscriptionTier(id: $id)
  }
`);

export const EXTEND_TRIAL_PLATFORM = graphql(`
  mutation ExtendTrialPlatform($channelId: ID!, $trialEndsAt: DateTime!) {
    extendTrialPlatform(channelId: $channelId, trialEndsAt: $trialEndsAt) {
      id
      customFields {
        trialEndsAt
        subscriptionStatus
      }
    }
  }
`);

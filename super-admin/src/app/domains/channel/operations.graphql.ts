import { graphql } from '../../core/graphql/generated';

/**
 * Channel operations for the super-admin app.
 */

export const CHANNEL_DETAIL_PLATFORM = graphql(`
  query ChannelDetailPlatform($channelId: ID!) {
    channelDetailPlatform(channelId: $channelId) {
      id
      code
      token
      customFields {
        status
        trialEndsAt
        subscriptionStatus
        subscriptionExpiresAt
        subscriptionExemptUntil
        subscriptionExemptReason
        cashierFlowEnabled
        cashControlEnabled
        enablePrinter
        smsUsedThisPeriod
        smsPeriodEnd
        smsLimitFromTier
        publicStorefrontEnabled
        publicSlug
        publicWhatsAppNumber
      }
      defaultShippingZone {
        id
        name
      }
      defaultTaxZone {
        id
        name
      }
    }
  }
`);

export const PLATFORM_CHANNELS = graphql(`
  query PlatformChannels {
    platformChannels {
      id
      code
      name
      token
      customFields {
        status
        trialEndsAt
        subscriptionStatus
        cashierFlowEnabled
        cashControlEnabled
        enablePrinter
        smsUsedThisPeriod
        smsPeriodEnd
        smsLimitFromTier
      }
    }
  }
`);

export const UPDATE_CHANNEL_ZONES_PLATFORM = graphql(`
  mutation UpdateChannelZonesPlatform($input: UpdateChannelZonesInput!) {
    updateChannelZonesPlatform(input: $input) {
      id
    }
  }
`);

export const UPDATE_CHANNEL_STATUS_PLATFORM = graphql(`
  mutation UpdateChannelStatusPlatform($channelId: ID!, $status: String!) {
    updateChannelStatusPlatform(channelId: $channelId, status: $status) {
      id
      customFields { status }
    }
  }
`);

export const UPDATE_CHANNEL_SUBSCRIPTION_PLATFORM = graphql(`
  mutation UpdateChannelSubscriptionPlatform($input: UpdateChannelSubscriptionInput!) {
    updateChannelSubscriptionPlatform(input: $input) {
      id
      customFields {
        subscriptionStatus
        trialEndsAt
        subscriptionExpiresAt
        subscriptionExemptUntil
        subscriptionExemptReason
      }
    }
  }
`);

export const UPDATE_CHANNEL_FEATURE_FLAGS_PLATFORM = graphql(`
  mutation UpdateChannelFeatureFlagsPlatform($input: UpdateChannelFeatureFlagsInput!) {
    updateChannelFeatureFlagsPlatform(input: $input) {
      id
      customFields {
        cashierFlowEnabled
        cashControlEnabled
        enablePrinter
      }
    }
  }
`);

export const UPDATE_CHANNEL_PUBLIC_STOREFRONT_PLATFORM = graphql(`
  mutation UpdateChannelPublicStorefrontPlatform($input: UpdateChannelPublicStorefrontInput!) {
    updateChannelPublicStorefrontPlatform(input: $input) {
      id
      customFields {
        publicStorefrontEnabled
        publicSlug
        publicWhatsAppNumber
      }
    }
  }
`);

import { graphql } from '../../shared/graphql/generated';

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
      isActive
      createdAt
      updatedAt
    }
  }
`);

export const CHECK_SUBSCRIPTION_STATUS = graphql(`
  query CheckSubscriptionStatus($channelId: ID) {
    checkSubscriptionStatus(channelId: $channelId) {
      isValid
      access
      status
      reason
      daysRemaining
      expiresAt
      trialEndsAt
      exemptionEndsAt
      exemptionReason
      gracePeriodEnd
      canWrite
      canRead
      canPerformAction
    }
  }
`);

export const INITIATE_SUBSCRIPTION_PURCHASE = graphql(`
  mutation InitiateSubscriptionPurchase(
    $channelId: ID!
    $tierId: String!
    $billingCycle: String!
    $phoneNumber: String!
    $email: String!
    $paymentMethod: String
  ) {
    initiateSubscriptionPurchase(
      channelId: $channelId
      tierId: $tierId
      billingCycle: $billingCycle
      phoneNumber: $phoneNumber
      email: $email
      paymentMethod: $paymentMethod
    ) {
      success
      reference
      authorizationUrl
      message
    }
  }
`);

export const VERIFY_SUBSCRIPTION_PAYMENT = graphql(`
  mutation VerifySubscriptionPayment($channelId: ID!, $reference: String!) {
    verifySubscriptionPayment(channelId: $channelId, reference: $reference)
  }
`);

export const CANCEL_SUBSCRIPTION = graphql(`
  mutation CancelSubscription($channelId: ID!) {
    cancelSubscription(channelId: $channelId)
  }
`);

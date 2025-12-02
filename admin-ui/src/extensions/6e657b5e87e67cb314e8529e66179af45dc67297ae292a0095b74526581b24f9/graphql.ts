import gql from 'graphql-tag';

export const GET_SUBSCRIPTION_TIERS = gql`
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
`;

export const GET_SUBSCRIPTION_TIER = gql`
  query GetSubscriptionTier($id: ID!) {
    getSubscriptionTier(id: $id) {
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
`;

export const CREATE_SUBSCRIPTION_TIER = gql`
  mutation CreateSubscriptionTier($input: CreateSubscriptionTierInput!) {
    createSubscriptionTier(input: $input) {
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
`;

export const UPDATE_SUBSCRIPTION_TIER = gql`
  mutation UpdateSubscriptionTier($input: UpdateSubscriptionTierInput!) {
    updateSubscriptionTier(input: $input) {
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
`;

export const DELETE_SUBSCRIPTION_TIER = gql`
  mutation DeleteSubscriptionTier($id: ID!) {
    deleteSubscriptionTier(id: $id)
  }
`;


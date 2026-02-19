import gql from 'graphql-tag';

/**
 * GraphQL schema for Super Admin API.
 * All operations require Permission.SuperAdmin.
 */
export const SUPER_ADMIN_SCHEMA = gql`
  type PlatformChannel {
    id: ID!
    code: String!
    token: String!
    customFields: PlatformChannelCustomFields!
  }

  type PlatformChannelCustomFields {
    status: String!
    trialEndsAt: DateTime
    subscriptionStatus: String
    maxAdminCount: Int!
    cashierFlowEnabled: Boolean!
    cashControlEnabled: Boolean!
    enablePrinter: Boolean!
  }

  type PlatformStats {
    totalChannels: Int!
    channelsByStatus: ChannelsByStatus!
    trialExpiringSoonCount: Int!
    activeSubscriptionsCount: Int!
  }

  type ChannelsByStatus {
    UNAPPROVED: Int!
    APPROVED: Int!
    DISABLED: Int!
    BANNED: Int!
  }

  input UpdateChannelFeatureFlagsInput {
    channelId: ID!
    maxAdminCount: Int
    cashierFlowEnabled: Boolean
    cashControlEnabled: Boolean
    enablePrinter: Boolean
  }

  extend type Query {
    platformChannels: [PlatformChannel!]!
    platformStats: PlatformStats!
    analyticsStatsForChannel(
      channelId: ID!
      timeRange: AnalyticsTimeRange!
      limit: Int
    ): AnalyticsStats!
    auditLogsForChannel(channelId: ID!, options: AuditLogOptions): [AuditLog!]!
  }

  extend type Mutation {
    updateChannelStatusPlatform(channelId: ID!, status: String!): Channel!
    extendTrialPlatform(channelId: ID!, trialEndsAt: DateTime!): Channel!
    updateChannelFeatureFlagsPlatform(input: UpdateChannelFeatureFlagsInput!): Channel!
  }
`;

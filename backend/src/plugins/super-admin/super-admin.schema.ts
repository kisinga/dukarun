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

  type PlatformZone {
    id: ID!
    name: String!
  }

  type PlatformChannelDetail {
    id: ID!
    code: String!
    token: String!
    customFields: PlatformChannelCustomFields!
    defaultShippingZone: PlatformZone
    defaultTaxZone: PlatformZone
  }

  input UpdateChannelZonesInput {
    channelId: ID!
    defaultShippingZoneId: ID
    defaultTaxZoneId: ID
  }

  type PlatformChannelCustomFields {
    status: String!
    trialEndsAt: DateTime
    subscriptionStatus: String
    maxAdminCount: Int!
    cashierFlowEnabled: Boolean!
    cashControlEnabled: Boolean!
    enablePrinter: Boolean!
    smsUsedThisPeriod: Int
    smsPeriodEnd: DateTime
    smsLimitFromTier: Int
  }

  type PlatformStats {
    totalChannels: Int!
    channelsByStatus: ChannelsByStatus!
    trialExpiringSoonCount: Int!
    activeSubscriptionsCount: Int!
  }

  """
  Platform-wide settings (e.g. default trial length for new channels).
  """
  type PlatformSettings {
    trialDays: Int!
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

  type PlatformAdministrator {
    id: ID!
    firstName: String!
    lastName: String!
    emailAddress: String!
    userId: ID!
    identifier: String!
    authorizationStatus: String!
    roleCodes: [String!]!
    channelIds: [ID!]
    isSuperAdmin: Boolean
  }

  type PlatformAdministratorRoleDetail {
    id: ID!
    code: String!
    channelIds: [ID!]!
    permissions: [String!]!
  }

  type PlatformAdministratorDetail {
    id: ID!
    firstName: String!
    lastName: String!
    emailAddress: String!
    userId: ID!
    identifier: String!
    authorizationStatus: String!
    isSuperAdmin: Boolean!
    roles: [PlatformAdministratorRoleDetail!]!
  }

  input PlatformAdministratorListOptions {
    skip: Int
    take: Int
    channelId: ID
    superAdminOnly: Boolean
  }

  type PlatformAdministratorList {
    items: [PlatformAdministrator!]!
    totalItems: Int!
  }

  type PendingRegistrationAdministrator {
    id: ID!
    firstName: String!
    lastName: String!
    emailAddress: String!
  }

  type PendingRegistration {
    userId: ID!
    identifier: String!
    createdAt: DateTime!
    administrator: PendingRegistrationAdministrator!
  }

  type UserAuthorizationResult {
    id: ID!
    identifier: String!
    authorizationStatus: String!
  }

  type AdminLoginAttempt {
    id: ID!
    eventKind: String!
    timestamp: DateTime!
    ipAddress: String
    username: String!
    success: Boolean!
    failureReason: String
    userId: Int
    authMethod: String!
    userAgent: String
    isSuperAdmin: Boolean
  }

  type PlatformAuditLog {
    id: ID!
    timestamp: DateTime!
    eventType: String!
    entityType: String
    entityId: String
    userId: ID
    ipAddress: String
    data: JSON!
    source: String!
  }

  input PlatformAuditLogOptions {
    entityType: String
    entityId: String
    userId: ID
    eventType: String
    startDate: DateTime
    endDate: DateTime
    limit: Int
    skip: Int
  }

  type RegistrationSeedContext {
    zone: RegistrationZone!
    """
    Null when no tax rate exists for the registration zone (e.g. before seed).
    """
    taxRate: RegistrationTaxRate
  }

  type RegistrationZone {
    id: ID!
    name: String!
    members: [RegistrationZoneMember!]!
  }

  type RegistrationZoneMember {
    id: ID!
    name: String!
    code: String!
  }

  type RegistrationTaxRate {
    id: ID!
    name: String!
    categoryName: String!
    value: Float!
  }

  input UpdateRegistrationTaxRateInput {
    percentage: Float!
  }

  type PlatformRoleTemplate {
    id: ID!
    code: String!
    name: String!
    description: String
    permissions: [String!]!
  }

  input CreateRoleTemplateInput {
    code: String!
    name: String!
    description: String
    permissions: [String!]!
  }

  input UpdateRoleTemplateInput {
    name: String
    description: String
    permissions: [String!]
  }

  """
  Process memory usage (Node.js process).
  """
  type ProcessMemory {
    heapUsedMB: Float!
    heapTotalMB: Float!
    rssMB: Float!
  }

  """
  System memory (host/container).
  """
  type SystemMemory {
    totalMB: Float!
    freeMB: Float!
    usedMB: Float!
  }

  """
  Health status of a service (e.g. backend, ml-trainer).
  """
  type ServiceHealth {
    name: String!
    status: String!
    error: String
  }

  """
  Platform monitoring: process/host metrics and service health.
  """
  type PlatformMonitoring {
    processMemory: ProcessMemory!
    systemMemory: SystemMemory!
    uptimeSeconds: Float!
    loadAvg: [Float!]!
    services: [ServiceHealth!]!
  }

  extend type Query {
    registrationSeedContext: RegistrationSeedContext!
    platformZones: [PlatformZone!]!
    platformChannels: [PlatformChannel!]!
    channelDetailPlatform(channelId: ID!): PlatformChannelDetail
    platformStats: PlatformStats!
    analyticsStatsForChannel(
      channelId: ID!
      timeRange: AnalyticsTimeRange!
      limit: Int
    ): AnalyticsStats!
    auditLogsForChannel(channelId: ID!, options: AuditLogOptions): [AuditLog!]!
    administratorsForChannel(channelId: ID!): [PlatformAdministrator!]!
    platformAdministrators(options: PlatformAdministratorListOptions): PlatformAdministratorList!
    notificationsForChannel(channelId: ID!, options: NotificationListOptions): NotificationList!
    pendingRegistrations: [PendingRegistration!]!
    platformRoleTemplates: [PlatformRoleTemplate!]!
    adminLoginAttempts(limit: Int, skip: Int, since: DateTime): [AdminLoginAttempt!]!
    platformAuditLogs(options: PlatformAuditLogOptions): [PlatformAuditLog!]!
    assignablePermissions: [String!]!
    administratorDetail(administratorId: ID!): PlatformAdministratorDetail
    platformSettings: PlatformSettings!
    platformMonitoring: PlatformMonitoring!
  }

  extend type Mutation {
    updateRegistrationTaxRate(input: UpdateRegistrationTaxRateInput!): RegistrationTaxRate!
    updateChannelZonesPlatform(input: UpdateChannelZonesInput!): Channel!
    updateChannelStatusPlatform(channelId: ID!, status: String!): Channel!
    extendTrialPlatform(channelId: ID!, trialEndsAt: DateTime!): Channel!
    updateChannelFeatureFlagsPlatform(input: UpdateChannelFeatureFlagsInput!): Channel!
    approveUser(userId: ID!): UserAuthorizationResult!
    rejectUser(userId: ID!, reason: String): UserAuthorizationResult!
    createRoleTemplate(input: CreateRoleTemplateInput!): PlatformRoleTemplate!
    updateRoleTemplate(id: ID!, input: UpdateRoleTemplateInput!): PlatformRoleTemplate!
    deleteRoleTemplate(id: ID!): Boolean!
    updateAdministratorPermissions(
      administratorId: ID!
      channelId: ID!
      permissions: [String!]!
    ): PlatformAdministratorDetail!
    updatePlatformSettings(trialDays: Int!): PlatformSettings!
  }
`;

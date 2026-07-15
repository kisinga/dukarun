import { graphql } from './generated';

/**
 * All GraphQL operations for the super-admin app.
 * Codegen processes this file and generates types into ./generated/
 */

export const AUTHENTICATE = graphql(`
  mutation Authenticate($username: String!, $password: String!) {
    authenticate(input: { native: { username: $username, password: $password } }) {
      ... on CurrentUser {
        id
      }
    }
  }
`);

export const PLATFORM_ZONES = graphql(`
  query PlatformZones {
    platformZones {
      id
      name
    }
  }
`);

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

export const UPDATE_CHANNEL_ZONES_PLATFORM = graphql(`
  mutation UpdateChannelZonesPlatform($input: UpdateChannelZonesInput!) {
    updateChannelZonesPlatform(input: $input) {
      id
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

export const PLATFORM_STATS = graphql(`
  query PlatformStats {
    platformStats {
      totalChannels
      channelsByStatus {
        UNAPPROVED
        APPROVED
        DISABLED
        BANNED
      }
      trialExpiringSoonCount
      activeSubscriptionsCount
    }
  }
`);

export const PLATFORM_MONITORING = graphql(`
  query PlatformMonitoring {
    platformMonitoring {
      processMemory {
        heapUsedMB
        heapTotalMB
        rssMB
      }
      systemMemory {
        totalMB
        freeMB
        usedMB
      }
      uptimeSeconds
      loadAvg
      services {
        name
        status
        error
      }
    }
  }
`);

export const ADMINISTRATORS_FOR_CHANNEL = graphql(`
  query AdministratorsForChannel($channelId: ID!) {
    administratorsForChannel(channelId: $channelId) {
      id
      firstName
      lastName
      emailAddress
      userId
      identifier
      authorizationStatus
      roleCodes
    }
  }
`);

export const PLATFORM_ADMINISTRATORS = graphql(`
  query PlatformAdministrators($options: PlatformAdministratorListOptions) {
    platformAdministrators(options: $options) {
      items {
        id
        firstName
        lastName
        emailAddress
        userId
        identifier
        authorizationStatus
        roleCodes
        channelIds
        isSuperAdmin
      }
      totalItems
    }
  }
`);

export const NOTIFICATIONS_FOR_CHANNEL = graphql(`
  query NotificationsForChannel($channelId: ID!, $options: NotificationListOptions) {
    notificationsForChannel(channelId: $channelId, options: $options) {
      items {
        id
        userId
        channelId
        type
        title
        message
        read
        createdAt
      }
      totalItems
    }
  }
`);

export const ANALYTICS_STATS_FOR_CHANNEL = graphql(`
  query AnalyticsStatsForChannel($channelId: ID!, $timeRange: AnalyticsTimeRange!, $limit: Int) {
    analyticsStatsForChannel(channelId: $channelId, timeRange: $timeRange, limit: $limit) {
      totalRevenue
      totalOrders
      averageProfitMargin
      salesTrend { date value }
      orderVolumeTrend { date value }
      customerGrowthTrend { date value }
    }
  }
`);

export const AUDIT_LOGS_FOR_CHANNEL = graphql(`
  query AuditLogsForChannel($channelId: ID!, $options: AuditLogOptions) {
    auditLogsForChannel(channelId: $channelId, options: $options) {
      id
      timestamp
      eventType
      entityType
      entityId
      userId
      data
    }
  }
`);

export const ADMIN_LOGIN_ATTEMPTS = graphql(`
  query AdminLoginAttempts($limit: Int, $skip: Int, $since: DateTime) {
    adminLoginAttempts(limit: $limit, skip: $skip, since: $since) {
      id
      eventKind
      timestamp
      ipAddress
      username
      success
      failureReason
      userId
      authMethod
      userAgent
      isSuperAdmin
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

export const PENDING_REGISTRATIONS = graphql(`
  query PendingRegistrations {
    pendingRegistrations {
      userId
      identifier
      createdAt
      administrator {
        id
        firstName
        lastName
        emailAddress
      }
    }
  }
`);

export const APPROVE_USER = graphql(`
  mutation ApproveUser($userId: ID!) {
    approveUser(userId: $userId) {
      id
      identifier
      authorizationStatus
    }
  }
`);

export const REJECT_USER = graphql(`
  mutation RejectUser($userId: ID!, $reason: String) {
    rejectUser(userId: $userId, reason: $reason) {
      id
      identifier
      authorizationStatus
    }
  }
`);

export const REGISTRATION_SEED_CONTEXT = graphql(`
  query RegistrationSeedContext {
    registrationSeedContext {
      zone {
        id
        name
        members {
          id
          name
          code
        }
      }
      taxRate {
        id
        name
        categoryName
        value
      }
    }
  }
`);

export const UPDATE_REGISTRATION_TAX_RATE = graphql(`
  mutation UpdateRegistrationTaxRate($input: UpdateRegistrationTaxRateInput!) {
    updateRegistrationTaxRate(input: $input) {
      id
      name
      categoryName
      value
    }
  }
`);

export const PLATFORM_SETTINGS = graphql(`
  query PlatformSettings {
    platformSettings {
      trialDays
      customerNotificationsEnabled
      communicationChannels {
        sms
        email
        whatsapp
      }
    }
  }
`);

export const UPDATE_PLATFORM_SETTINGS = graphql(`
  mutation UpdatePlatformSettings($trialDays: Int!) {
    updatePlatformSettings(trialDays: $trialDays) {
      trialDays
      customerNotificationsEnabled
      communicationChannels {
        sms
        email
        whatsapp
      }
    }
  }
`);

export const UPDATE_CUSTOMER_NOTIFICATIONS_ENABLED = graphql(`
  mutation UpdateCustomerNotificationsEnabled($enabled: Boolean!) {
    updateCustomerNotificationsEnabled(enabled: $enabled) {
      trialDays
      customerNotificationsEnabled
      communicationChannels {
        sms
        email
        whatsapp
      }
    }
  }
`);

export const UPDATE_COMMUNICATION_CHANNELS = graphql(`
  mutation UpdateCommunicationChannels($input: CommunicationChannelsInput!) {
    updateCommunicationChannels(input: $input) {
      trialDays
      customerNotificationsEnabled
      communicationChannels {
        sms
        email
        whatsapp
      }
    }
  }
`);

export const SEND_TEST_WHATSAPP_NOTIFICATION = graphql(`
  mutation SendTestWhatsAppNotification(
    $phoneNumber: String!
    $message: String!
    $templateKey: String
  ) {
    sendTestWhatsAppNotification(
      phoneNumber: $phoneNumber
      message: $message
      templateKey: $templateKey
    ) {
      success
      channel
      error
      info
    }
  }
`);

export const SEND_TEST_CUSTOMER_NOTIFICATION = graphql(`
  mutation SendTestCustomerNotification(
    $channelId: ID!
    $customerId: ID!
    $triggerKey: String!
  ) {
    sendTestCustomerNotification(
      channelId: $channelId
      customerId: $customerId
      triggerKey: $triggerKey
    ) {
      success
      channel
      error
      info
    }
  }
`);

export const BATCH_MESSAGES = graphql(`
  query BatchMessages($options: BatchMessageListOptions) {
    batchMessages(options: $options) {
      items {
        id
        name
        content
        audience
        channelIds
        channels {
          sms
          whatsapp
        }
        status
        recipientCount
        sentCount
        failedCount
        createdAt
        sentAt
      }
      totalItems
    }
  }
`);

export const SEND_BATCH_MESSAGE = graphql(`
  mutation SendBatchMessage($input: CreateBatchMessageInput!) {
    sendBatchMessage(input: $input) {
      id
      name
      status
      recipientCount
      createdAt
    }
  }
`);

export const ROLE_TEMPLATES = graphql(`
  query PlatformRoleTemplates {
    platformRoleTemplates {
      id
      code
      name
      description
      permissions
    }
  }
`);

export const ASSIGNABLE_PERMISSIONS = graphql(`
  query AssignablePermissions {
    assignablePermissions
  }
`);

export const CREATE_ROLE_TEMPLATE = graphql(`
  mutation CreateRoleTemplate($input: CreateRoleTemplateInput!) {
    createRoleTemplate(input: $input) {
      id
      code
      name
      description
      permissions
    }
  }
`);

export const UPDATE_ROLE_TEMPLATE = graphql(`
  mutation UpdateRoleTemplate($id: ID!, $input: UpdateRoleTemplateInput!) {
    updateRoleTemplate(id: $id, input: $input) {
      id
      code
      name
      description
      permissions
    }
  }
`);

export const DELETE_ROLE_TEMPLATE = graphql(`
  mutation DeleteRoleTemplate($id: ID!) {
    deleteRoleTemplate(id: $id)
  }
`);

export const ADMINISTRATOR_DETAIL = graphql(`
  query AdministratorDetail($administratorId: ID!) {
    administratorDetail(administratorId: $administratorId) {
      id
      firstName
      lastName
      emailAddress
      userId
      identifier
      authorizationStatus
      isSuperAdmin
      roles {
        id
        code
        channelIds
        permissions
      }
    }
  }
`);

export const UPDATE_ADMINISTRATOR_PERMISSIONS = graphql(`
  mutation UpdateAdministratorPermissions(
    $administratorId: ID!
    $channelId: ID!
    $permissions: [String!]!
  ) {
    updateAdministratorPermissions(
      administratorId: $administratorId
      channelId: $channelId
      permissions: $permissions
    ) {
      id
      roles {
        id
        code
        channelIds
        permissions
      }
    }
  }
`);

export const DIVERGENT_ORDERS = graphql(`
  query DivergentOrders($toleranceCents: Int) {
    divergentOrders(toleranceCents: $toleranceCents) {
      items {
        orderId
        orderCode
        customerId
        orderModelOwing
        ledgerOwing
        difference
        orderTotal
      }
      totalItems
    }
  }
`);

export const RECONCILE_ORDER = graphql(`
  mutation ReconcileOrder($input: ReconcileOrderInput!) {
    reconcileOrder(input: $input) {
      orderId
      success
      message
    }
  }
`);

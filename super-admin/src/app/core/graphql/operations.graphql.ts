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
        maxAdminCount
        cashierFlowEnabled
        cashControlEnabled
        enablePrinter
        smsUsedThisPeriod
        smsPeriodEnd
        smsLimitFromTier
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
      token
      customFields {
        status
        trialEndsAt
        subscriptionStatus
        maxAdminCount
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
      customFields { trialEndsAt }
    }
  }
`);

export const UPDATE_CHANNEL_FEATURE_FLAGS_PLATFORM = graphql(`
  mutation UpdateChannelFeatureFlagsPlatform($input: UpdateChannelFeatureFlagsInput!) {
    updateChannelFeatureFlagsPlatform(input: $input) {
      id
      customFields {
        maxAdminCount
        cashierFlowEnabled
        cashControlEnabled
        enablePrinter
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
      smsLimit
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
      smsLimit
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
      smsLimit
      isActive
    }
  }
`);

export const DEACTIVATE_SUBSCRIPTION_TIER = graphql(`
  mutation DeactivateSubscriptionTier($id: ID!) {
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

export const ML_TRAINER_HEALTH = graphql(`
  query MlTrainerHealth {
    mlTrainerHealth {
      status
      uptimeSeconds
      error
    }
  }
`);

export const ML_TRAINING_INFO = graphql(`
  query MlTrainingInfo($channelId: ID!) {
    mlTrainingInfo(channelId: $channelId) {
      status
      progress
      startedAt
      error
      productCount
      imageCount
      hasActiveModel
      lastTrainedAt
      queuedAt
    }
  }
`);

export const ML_TRAINING_DATA_SUMMARY = graphql(`
  query MlTrainingDataSummary($channelId: ID!) {
    mlTrainingDataSummary(channelId: $channelId) {
      extractedAt
      productCount
      imageCount
      products {
        productName
        imageCount
      }
    }
  }
`);

export const ML_SCHEDULER_CONFIG = graphql(`
  query MlSchedulerConfig {
    mlSchedulerConfig {
      intervalMinutes
      cooldownHours
    }
  }
`);

export const ML_TRAINER_JOBS = graphql(`
  query MlTrainerJobs {
    mlTrainerJobs {
      channelId
      status
      startedAt
      completedAt
      failedAt
      error
    }
  }
`);

export const ML_MODEL_INFO = graphql(`
  query MlModelInfo($channelId: ID!) {
    mlModelInfo(channelId: $channelId) {
      hasModel
      version
      status
      modelJsonId
      modelBinId
      metadataId
    }
  }
`);

export const QUEUE_TRAINING = graphql(`
  mutation QueueTraining($channelId: ID!) {
    queueTraining(channelId: $channelId)
  }
`);

export const START_TRAINING = graphql(`
  mutation StartTraining($channelId: ID!) {
    startTraining(channelId: $channelId)
  }
`);

export const EXTRACT_PHOTOS_FOR_TRAINING = graphql(`
  mutation ExtractPhotosForTraining($channelId: ID!) {
    extractPhotosForTraining(channelId: $channelId)
  }
`);

export const SET_ML_MODEL_STATUS = graphql(`
  mutation SetMlModelStatus($channelId: ID!, $status: String!) {
    setMlModelStatus(channelId: $channelId, status: $status)
  }
`);

export const CLEAR_ML_MODEL = graphql(`
  mutation ClearMlModel($channelId: ID!) {
    clearMlModel(channelId: $channelId)
  }
`);

export const REFRESH_TRAINING_COUNTS = graphql(`
  mutation RefreshTrainingCounts($channelId: ID!) {
    refreshTrainingCounts(channelId: $channelId)
  }
`);

export const TRAINING_MANIFEST_EXPORT = graphql(`
  query TrainingManifestExport($channelId: ID!) {
    trainingManifestExport(channelId: $channelId) {
      manifestJson
    }
  }
`);

export const UPLOAD_MODEL_MANUALLY = graphql(`
  mutation UploadModelManually($channelId: ID!, $modelJson: Upload!, $weightsFile: Upload!, $metadata: Upload!) {
    uploadModelManually(channelId: $channelId, modelJson: $modelJson, weightsFile: $weightsFile, metadata: $metadata)
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

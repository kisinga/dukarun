import gql from 'graphql-tag';

export const AUTHENTICATE = gql`
  mutation Authenticate($username: String!, $password: String!) {
    authenticate(input: { native: { username: $username, password: $password } }) {
      ... on CurrentUser {
        id
      }
    }
  }
`;

export const PLATFORM_CHANNELS = gql`
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
      }
    }
  }
`;

export const PLATFORM_STATS = gql`
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
`;

export const ADMINISTRATORS_FOR_CHANNEL = gql`
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
`;

export const PLATFORM_ADMINISTRATORS = gql`
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
`;

export const NOTIFICATIONS_FOR_CHANNEL = gql`
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
`;

export const ANALYTICS_STATS_FOR_CHANNEL = gql`
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
`;

export const AUDIT_LOGS_FOR_CHANNEL = gql`
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
`;

export const UPDATE_CHANNEL_STATUS_PLATFORM = gql`
  mutation UpdateChannelStatusPlatform($channelId: ID!, $status: String!) {
    updateChannelStatusPlatform(channelId: $channelId, status: $status) {
      id
      customFields { status }
    }
  }
`;

export const EXTEND_TRIAL_PLATFORM = gql`
  mutation ExtendTrialPlatform($channelId: ID!, $trialEndsAt: DateTime!) {
    extendTrialPlatform(channelId: $channelId, trialEndsAt: $trialEndsAt) {
      id
      customFields { trialEndsAt }
    }
  }
`;

export const UPDATE_CHANNEL_FEATURE_FLAGS_PLATFORM = gql`
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
`;

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

export const CREATE_SUBSCRIPTION_TIER = gql`
  mutation CreateSubscriptionTier($input: CreateSubscriptionTierInput!) {
    createSubscriptionTier(input: $input) {
      id
      code
      name
      priceMonthly
      priceYearly
      isActive
    }
  }
`;

export const UPDATE_SUBSCRIPTION_TIER = gql`
  mutation UpdateSubscriptionTier($input: UpdateSubscriptionTierInput!) {
    updateSubscriptionTier(input: $input) {
      id
      code
      name
      priceMonthly
      priceYearly
      isActive
    }
  }
`;

export const DEACTIVATE_SUBSCRIPTION_TIER = gql`
  mutation DeactivateSubscriptionTier($id: ID!) {
    deactivateSubscriptionTier(id: $id)
  }
`;

export const PENDING_REGISTRATIONS = gql`
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
`;

export const APPROVE_USER = gql`
  mutation ApproveUser($userId: ID!) {
    approveUser(userId: $userId) {
      id
      identifier
      authorizationStatus
    }
  }
`;

export const REJECT_USER = gql`
  mutation RejectUser($userId: ID!, $reason: String) {
    rejectUser(userId: $userId, reason: $reason) {
      id
      identifier
      authorizationStatus
    }
  }
`;

export const ML_TRAINER_HEALTH = gql`
  query MlTrainerHealth {
    mlTrainerHealth {
      status
      uptimeSeconds
      error
    }
  }
`;

export const ML_TRAINING_INFO = gql`
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
    }
  }
`;

export const START_TRAINING = gql`
  mutation StartTraining($channelId: ID!) {
    startTraining(channelId: $channelId)
  }
`;

export const EXTRACT_PHOTOS_FOR_TRAINING = gql`
  mutation ExtractPhotosForTraining($channelId: ID!) {
    extractPhotosForTraining(channelId: $channelId)
  }
`;

export const SET_ML_MODEL_STATUS = gql`
  mutation SetMlModelStatus($channelId: ID!, $status: String!) {
    setMlModelStatus(channelId: $channelId, status: $status)
  }
`;

export const CLEAR_ML_MODEL = gql`
  mutation ClearMlModel($channelId: ID!) {
    clearMlModel(channelId: $channelId)
  }
`;

export const ROLE_TEMPLATES = gql`
  query PlatformRoleTemplates {
    platformRoleTemplates {
      id
      code
      name
      description
      permissions
    }
  }
`;

export const ASSIGNABLE_PERMISSIONS = gql`
  query AssignablePermissions {
    assignablePermissions
  }
`;

export const CREATE_ROLE_TEMPLATE = gql`
  mutation CreateRoleTemplate($input: CreateRoleTemplateInput!) {
    createRoleTemplate(input: $input) {
      id
      code
      name
      description
      permissions
    }
  }
`;

export const UPDATE_ROLE_TEMPLATE = gql`
  mutation UpdateRoleTemplate($id: ID!, $input: UpdateRoleTemplateInput!) {
    updateRoleTemplate(id: $id, input: $input) {
      id
      code
      name
      description
      permissions
    }
  }
`;

export const DELETE_ROLE_TEMPLATE = gql`
  mutation DeleteRoleTemplate($id: ID!) {
    deleteRoleTemplate(id: $id)
  }
`;

export const ADMINISTRATOR_DETAIL = gql`
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
`;

export const UPDATE_ADMINISTRATOR_PERMISSIONS = gql`
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
`;

/* eslint-disable */
import * as types from './graphql';
import { TypedDocumentNode as DocumentNode } from '@graphql-typed-document-node/core';

/**
 * Map of all GraphQL operations in the project.
 *
 * This map has several performance disadvantages:
 * 1. It is not tree-shakeable, so it will include all operations in the project.
 * 2. It is not minifiable, so the string of a GraphQL query will be multiple times inside the bundle.
 * 3. It does not support dead code elimination, so it will add unused operations.
 *
 * Therefore it is highly recommended to use the babel or swc plugin for production.
 * Learn more about it here: https://the-guild.dev/graphql/codegen/plugins/presets/preset-client#reducing-bundle-size
 */
type Documents = {
    "\n  mutation Authenticate($username: String!, $password: String!) {\n    authenticate(input: { native: { username: $username, password: $password } }) {\n      ... on CurrentUser {\n        id\n      }\n    }\n  }\n": typeof types.AuthenticateDocument,
    "\n  query PlatformZones {\n    platformZones {\n      id\n      name\n    }\n  }\n": typeof types.PlatformZonesDocument,
    "\n  query ChannelDetailPlatform($channelId: ID!) {\n    channelDetailPlatform(channelId: $channelId) {\n      id\n      code\n      token\n      customFields {\n        status\n        trialEndsAt\n        subscriptionStatus\n        maxAdminCount\n        cashierFlowEnabled\n        cashControlEnabled\n        enablePrinter\n        smsUsedThisPeriod\n        smsPeriodEnd\n        smsLimitFromTier\n      }\n      defaultShippingZone {\n        id\n        name\n      }\n      defaultTaxZone {\n        id\n        name\n      }\n    }\n  }\n": typeof types.ChannelDetailPlatformDocument,
    "\n  mutation UpdateChannelZonesPlatform($input: UpdateChannelZonesInput!) {\n    updateChannelZonesPlatform(input: $input) {\n      id\n    }\n  }\n": typeof types.UpdateChannelZonesPlatformDocument,
    "\n  query PlatformChannels {\n    platformChannels {\n      id\n      code\n      token\n      customFields {\n        status\n        trialEndsAt\n        subscriptionStatus\n        maxAdminCount\n        cashierFlowEnabled\n        cashControlEnabled\n        enablePrinter\n        smsUsedThisPeriod\n        smsPeriodEnd\n        smsLimitFromTier\n      }\n    }\n  }\n": typeof types.PlatformChannelsDocument,
    "\n  query PlatformStats {\n    platformStats {\n      totalChannels\n      channelsByStatus {\n        UNAPPROVED\n        APPROVED\n        DISABLED\n        BANNED\n      }\n      trialExpiringSoonCount\n      activeSubscriptionsCount\n    }\n  }\n": typeof types.PlatformStatsDocument,
    "\n  query AdministratorsForChannel($channelId: ID!) {\n    administratorsForChannel(channelId: $channelId) {\n      id\n      firstName\n      lastName\n      emailAddress\n      userId\n      identifier\n      authorizationStatus\n      roleCodes\n    }\n  }\n": typeof types.AdministratorsForChannelDocument,
    "\n  query PlatformAdministrators($options: PlatformAdministratorListOptions) {\n    platformAdministrators(options: $options) {\n      items {\n        id\n        firstName\n        lastName\n        emailAddress\n        userId\n        identifier\n        authorizationStatus\n        roleCodes\n        channelIds\n        isSuperAdmin\n      }\n      totalItems\n    }\n  }\n": typeof types.PlatformAdministratorsDocument,
    "\n  query NotificationsForChannel($channelId: ID!, $options: NotificationListOptions) {\n    notificationsForChannel(channelId: $channelId, options: $options) {\n      items {\n        id\n        userId\n        channelId\n        type\n        title\n        message\n        read\n        createdAt\n      }\n      totalItems\n    }\n  }\n": typeof types.NotificationsForChannelDocument,
    "\n  query AnalyticsStatsForChannel($channelId: ID!, $timeRange: AnalyticsTimeRange!, $limit: Int) {\n    analyticsStatsForChannel(channelId: $channelId, timeRange: $timeRange, limit: $limit) {\n      totalRevenue\n      totalOrders\n      averageProfitMargin\n      salesTrend { date value }\n      orderVolumeTrend { date value }\n      customerGrowthTrend { date value }\n    }\n  }\n": typeof types.AnalyticsStatsForChannelDocument,
    "\n  query AuditLogsForChannel($channelId: ID!, $options: AuditLogOptions) {\n    auditLogsForChannel(channelId: $channelId, options: $options) {\n      id\n      timestamp\n      eventType\n      entityType\n      entityId\n      userId\n      data\n    }\n  }\n": typeof types.AuditLogsForChannelDocument,
    "\n  query AdminLoginAttempts($limit: Int, $skip: Int, $since: DateTime) {\n    adminLoginAttempts(limit: $limit, skip: $skip, since: $since) {\n      id\n      eventKind\n      timestamp\n      ipAddress\n      username\n      success\n      failureReason\n      userId\n      authMethod\n      userAgent\n      isSuperAdmin\n    }\n  }\n": typeof types.AdminLoginAttemptsDocument,
    "\n  mutation UpdateChannelStatusPlatform($channelId: ID!, $status: String!) {\n    updateChannelStatusPlatform(channelId: $channelId, status: $status) {\n      id\n      customFields { status }\n    }\n  }\n": typeof types.UpdateChannelStatusPlatformDocument,
    "\n  mutation ExtendTrialPlatform($channelId: ID!, $trialEndsAt: DateTime!) {\n    extendTrialPlatform(channelId: $channelId, trialEndsAt: $trialEndsAt) {\n      id\n      customFields { trialEndsAt }\n    }\n  }\n": typeof types.ExtendTrialPlatformDocument,
    "\n  mutation UpdateChannelFeatureFlagsPlatform($input: UpdateChannelFeatureFlagsInput!) {\n    updateChannelFeatureFlagsPlatform(input: $input) {\n      id\n      customFields {\n        maxAdminCount\n        cashierFlowEnabled\n        cashControlEnabled\n        enablePrinter\n      }\n    }\n  }\n": typeof types.UpdateChannelFeatureFlagsPlatformDocument,
    "\n  query GetSubscriptionTiers {\n    getSubscriptionTiers {\n      id\n      code\n      name\n      description\n      priceMonthly\n      priceYearly\n      features\n      smsLimit\n      isActive\n      createdAt\n      updatedAt\n    }\n  }\n": typeof types.GetSubscriptionTiersDocument,
    "\n  mutation CreateSubscriptionTier($input: CreateSubscriptionTierInput!) {\n    createSubscriptionTier(input: $input) {\n      id\n      code\n      name\n      priceMonthly\n      priceYearly\n      smsLimit\n      isActive\n    }\n  }\n": typeof types.CreateSubscriptionTierDocument,
    "\n  mutation UpdateSubscriptionTier($input: UpdateSubscriptionTierInput!) {\n    updateSubscriptionTier(input: $input) {\n      id\n      code\n      name\n      priceMonthly\n      priceYearly\n      smsLimit\n      isActive\n    }\n  }\n": typeof types.UpdateSubscriptionTierDocument,
    "\n  mutation DeactivateSubscriptionTier($id: ID!) {\n    deactivateSubscriptionTier(id: $id)\n  }\n": typeof types.DeactivateSubscriptionTierDocument,
    "\n  query PendingRegistrations {\n    pendingRegistrations {\n      userId\n      identifier\n      createdAt\n      administrator {\n        id\n        firstName\n        lastName\n        emailAddress\n      }\n    }\n  }\n": typeof types.PendingRegistrationsDocument,
    "\n  mutation ApproveUser($userId: ID!) {\n    approveUser(userId: $userId) {\n      id\n      identifier\n      authorizationStatus\n    }\n  }\n": typeof types.ApproveUserDocument,
    "\n  mutation RejectUser($userId: ID!, $reason: String) {\n    rejectUser(userId: $userId, reason: $reason) {\n      id\n      identifier\n      authorizationStatus\n    }\n  }\n": typeof types.RejectUserDocument,
    "\n  query MlTrainerHealth {\n    mlTrainerHealth {\n      status\n      uptimeSeconds\n      error\n    }\n  }\n": typeof types.MlTrainerHealthDocument,
    "\n  query MlTrainingInfo($channelId: ID!) {\n    mlTrainingInfo(channelId: $channelId) {\n      status\n      progress\n      startedAt\n      error\n      productCount\n      imageCount\n      hasActiveModel\n      lastTrainedAt\n      queuedAt\n    }\n  }\n": typeof types.MlTrainingInfoDocument,
    "\n  query MlTrainingDataSummary($channelId: ID!) {\n    mlTrainingDataSummary(channelId: $channelId) {\n      extractedAt\n      productCount\n      imageCount\n      products {\n        productName\n        imageCount\n      }\n    }\n  }\n": typeof types.MlTrainingDataSummaryDocument,
    "\n  query MlSchedulerConfig {\n    mlSchedulerConfig {\n      intervalMinutes\n      cooldownHours\n    }\n  }\n": typeof types.MlSchedulerConfigDocument,
    "\n  query MlTrainerJobs {\n    mlTrainerJobs {\n      channelId\n      status\n      startedAt\n      completedAt\n      failedAt\n      error\n    }\n  }\n": typeof types.MlTrainerJobsDocument,
    "\n  query MlModelInfo($channelId: ID!) {\n    mlModelInfo(channelId: $channelId) {\n      hasModel\n      version\n      status\n      modelJsonId\n      modelBinId\n      metadataId\n    }\n  }\n": typeof types.MlModelInfoDocument,
    "\n  mutation QueueTraining($channelId: ID!) {\n    queueTraining(channelId: $channelId)\n  }\n": typeof types.QueueTrainingDocument,
    "\n  mutation StartTraining($channelId: ID!) {\n    startTraining(channelId: $channelId)\n  }\n": typeof types.StartTrainingDocument,
    "\n  mutation ExtractPhotosForTraining($channelId: ID!) {\n    extractPhotosForTraining(channelId: $channelId)\n  }\n": typeof types.ExtractPhotosForTrainingDocument,
    "\n  mutation SetMlModelStatus($channelId: ID!, $status: String!) {\n    setMlModelStatus(channelId: $channelId, status: $status)\n  }\n": typeof types.SetMlModelStatusDocument,
    "\n  mutation ClearMlModel($channelId: ID!) {\n    clearMlModel(channelId: $channelId)\n  }\n": typeof types.ClearMlModelDocument,
    "\n  mutation RefreshTrainingCounts($channelId: ID!) {\n    refreshTrainingCounts(channelId: $channelId)\n  }\n": typeof types.RefreshTrainingCountsDocument,
    "\n  query TrainingManifestExport($channelId: ID!) {\n    trainingManifestExport(channelId: $channelId) {\n      manifestJson\n    }\n  }\n": typeof types.TrainingManifestExportDocument,
    "\n  mutation UploadModelManually($channelId: ID!, $modelJson: Upload!, $weightsFile: Upload!, $metadata: Upload!) {\n    uploadModelManually(channelId: $channelId, modelJson: $modelJson, weightsFile: $weightsFile, metadata: $metadata)\n  }\n": typeof types.UploadModelManuallyDocument,
    "\n  query RegistrationSeedContext {\n    registrationSeedContext {\n      zone {\n        id\n        name\n        members {\n          id\n          name\n          code\n        }\n      }\n      taxRate {\n        id\n        name\n        categoryName\n        value\n      }\n    }\n  }\n": typeof types.RegistrationSeedContextDocument,
    "\n  mutation UpdateRegistrationTaxRate($input: UpdateRegistrationTaxRateInput!) {\n    updateRegistrationTaxRate(input: $input) {\n      id\n      name\n      categoryName\n      value\n    }\n  }\n": typeof types.UpdateRegistrationTaxRateDocument,
    "\n  query PlatformRoleTemplates {\n    platformRoleTemplates {\n      id\n      code\n      name\n      description\n      permissions\n    }\n  }\n": typeof types.PlatformRoleTemplatesDocument,
    "\n  query AssignablePermissions {\n    assignablePermissions\n  }\n": typeof types.AssignablePermissionsDocument,
    "\n  mutation CreateRoleTemplate($input: CreateRoleTemplateInput!) {\n    createRoleTemplate(input: $input) {\n      id\n      code\n      name\n      description\n      permissions\n    }\n  }\n": typeof types.CreateRoleTemplateDocument,
    "\n  mutation UpdateRoleTemplate($id: ID!, $input: UpdateRoleTemplateInput!) {\n    updateRoleTemplate(id: $id, input: $input) {\n      id\n      code\n      name\n      description\n      permissions\n    }\n  }\n": typeof types.UpdateRoleTemplateDocument,
    "\n  mutation DeleteRoleTemplate($id: ID!) {\n    deleteRoleTemplate(id: $id)\n  }\n": typeof types.DeleteRoleTemplateDocument,
    "\n  query AdministratorDetail($administratorId: ID!) {\n    administratorDetail(administratorId: $administratorId) {\n      id\n      firstName\n      lastName\n      emailAddress\n      userId\n      identifier\n      authorizationStatus\n      isSuperAdmin\n      roles {\n        id\n        code\n        channelIds\n        permissions\n      }\n    }\n  }\n": typeof types.AdministratorDetailDocument,
    "\n  mutation UpdateAdministratorPermissions(\n    $administratorId: ID!\n    $channelId: ID!\n    $permissions: [String!]!\n  ) {\n    updateAdministratorPermissions(\n      administratorId: $administratorId\n      channelId: $channelId\n      permissions: $permissions\n    ) {\n      id\n      roles {\n        id\n        code\n        channelIds\n        permissions\n      }\n    }\n  }\n": typeof types.UpdateAdministratorPermissionsDocument,
};
const documents: Documents = {
    "\n  mutation Authenticate($username: String!, $password: String!) {\n    authenticate(input: { native: { username: $username, password: $password } }) {\n      ... on CurrentUser {\n        id\n      }\n    }\n  }\n": types.AuthenticateDocument,
    "\n  query PlatformZones {\n    platformZones {\n      id\n      name\n    }\n  }\n": types.PlatformZonesDocument,
    "\n  query ChannelDetailPlatform($channelId: ID!) {\n    channelDetailPlatform(channelId: $channelId) {\n      id\n      code\n      token\n      customFields {\n        status\n        trialEndsAt\n        subscriptionStatus\n        maxAdminCount\n        cashierFlowEnabled\n        cashControlEnabled\n        enablePrinter\n        smsUsedThisPeriod\n        smsPeriodEnd\n        smsLimitFromTier\n      }\n      defaultShippingZone {\n        id\n        name\n      }\n      defaultTaxZone {\n        id\n        name\n      }\n    }\n  }\n": types.ChannelDetailPlatformDocument,
    "\n  mutation UpdateChannelZonesPlatform($input: UpdateChannelZonesInput!) {\n    updateChannelZonesPlatform(input: $input) {\n      id\n    }\n  }\n": types.UpdateChannelZonesPlatformDocument,
    "\n  query PlatformChannels {\n    platformChannels {\n      id\n      code\n      token\n      customFields {\n        status\n        trialEndsAt\n        subscriptionStatus\n        maxAdminCount\n        cashierFlowEnabled\n        cashControlEnabled\n        enablePrinter\n        smsUsedThisPeriod\n        smsPeriodEnd\n        smsLimitFromTier\n      }\n    }\n  }\n": types.PlatformChannelsDocument,
    "\n  query PlatformStats {\n    platformStats {\n      totalChannels\n      channelsByStatus {\n        UNAPPROVED\n        APPROVED\n        DISABLED\n        BANNED\n      }\n      trialExpiringSoonCount\n      activeSubscriptionsCount\n    }\n  }\n": types.PlatformStatsDocument,
    "\n  query AdministratorsForChannel($channelId: ID!) {\n    administratorsForChannel(channelId: $channelId) {\n      id\n      firstName\n      lastName\n      emailAddress\n      userId\n      identifier\n      authorizationStatus\n      roleCodes\n    }\n  }\n": types.AdministratorsForChannelDocument,
    "\n  query PlatformAdministrators($options: PlatformAdministratorListOptions) {\n    platformAdministrators(options: $options) {\n      items {\n        id\n        firstName\n        lastName\n        emailAddress\n        userId\n        identifier\n        authorizationStatus\n        roleCodes\n        channelIds\n        isSuperAdmin\n      }\n      totalItems\n    }\n  }\n": types.PlatformAdministratorsDocument,
    "\n  query NotificationsForChannel($channelId: ID!, $options: NotificationListOptions) {\n    notificationsForChannel(channelId: $channelId, options: $options) {\n      items {\n        id\n        userId\n        channelId\n        type\n        title\n        message\n        read\n        createdAt\n      }\n      totalItems\n    }\n  }\n": types.NotificationsForChannelDocument,
    "\n  query AnalyticsStatsForChannel($channelId: ID!, $timeRange: AnalyticsTimeRange!, $limit: Int) {\n    analyticsStatsForChannel(channelId: $channelId, timeRange: $timeRange, limit: $limit) {\n      totalRevenue\n      totalOrders\n      averageProfitMargin\n      salesTrend { date value }\n      orderVolumeTrend { date value }\n      customerGrowthTrend { date value }\n    }\n  }\n": types.AnalyticsStatsForChannelDocument,
    "\n  query AuditLogsForChannel($channelId: ID!, $options: AuditLogOptions) {\n    auditLogsForChannel(channelId: $channelId, options: $options) {\n      id\n      timestamp\n      eventType\n      entityType\n      entityId\n      userId\n      data\n    }\n  }\n": types.AuditLogsForChannelDocument,
    "\n  query AdminLoginAttempts($limit: Int, $skip: Int, $since: DateTime) {\n    adminLoginAttempts(limit: $limit, skip: $skip, since: $since) {\n      id\n      eventKind\n      timestamp\n      ipAddress\n      username\n      success\n      failureReason\n      userId\n      authMethod\n      userAgent\n      isSuperAdmin\n    }\n  }\n": types.AdminLoginAttemptsDocument,
    "\n  mutation UpdateChannelStatusPlatform($channelId: ID!, $status: String!) {\n    updateChannelStatusPlatform(channelId: $channelId, status: $status) {\n      id\n      customFields { status }\n    }\n  }\n": types.UpdateChannelStatusPlatformDocument,
    "\n  mutation ExtendTrialPlatform($channelId: ID!, $trialEndsAt: DateTime!) {\n    extendTrialPlatform(channelId: $channelId, trialEndsAt: $trialEndsAt) {\n      id\n      customFields { trialEndsAt }\n    }\n  }\n": types.ExtendTrialPlatformDocument,
    "\n  mutation UpdateChannelFeatureFlagsPlatform($input: UpdateChannelFeatureFlagsInput!) {\n    updateChannelFeatureFlagsPlatform(input: $input) {\n      id\n      customFields {\n        maxAdminCount\n        cashierFlowEnabled\n        cashControlEnabled\n        enablePrinter\n      }\n    }\n  }\n": types.UpdateChannelFeatureFlagsPlatformDocument,
    "\n  query GetSubscriptionTiers {\n    getSubscriptionTiers {\n      id\n      code\n      name\n      description\n      priceMonthly\n      priceYearly\n      features\n      smsLimit\n      isActive\n      createdAt\n      updatedAt\n    }\n  }\n": types.GetSubscriptionTiersDocument,
    "\n  mutation CreateSubscriptionTier($input: CreateSubscriptionTierInput!) {\n    createSubscriptionTier(input: $input) {\n      id\n      code\n      name\n      priceMonthly\n      priceYearly\n      smsLimit\n      isActive\n    }\n  }\n": types.CreateSubscriptionTierDocument,
    "\n  mutation UpdateSubscriptionTier($input: UpdateSubscriptionTierInput!) {\n    updateSubscriptionTier(input: $input) {\n      id\n      code\n      name\n      priceMonthly\n      priceYearly\n      smsLimit\n      isActive\n    }\n  }\n": types.UpdateSubscriptionTierDocument,
    "\n  mutation DeactivateSubscriptionTier($id: ID!) {\n    deactivateSubscriptionTier(id: $id)\n  }\n": types.DeactivateSubscriptionTierDocument,
    "\n  query PendingRegistrations {\n    pendingRegistrations {\n      userId\n      identifier\n      createdAt\n      administrator {\n        id\n        firstName\n        lastName\n        emailAddress\n      }\n    }\n  }\n": types.PendingRegistrationsDocument,
    "\n  mutation ApproveUser($userId: ID!) {\n    approveUser(userId: $userId) {\n      id\n      identifier\n      authorizationStatus\n    }\n  }\n": types.ApproveUserDocument,
    "\n  mutation RejectUser($userId: ID!, $reason: String) {\n    rejectUser(userId: $userId, reason: $reason) {\n      id\n      identifier\n      authorizationStatus\n    }\n  }\n": types.RejectUserDocument,
    "\n  query MlTrainerHealth {\n    mlTrainerHealth {\n      status\n      uptimeSeconds\n      error\n    }\n  }\n": types.MlTrainerHealthDocument,
    "\n  query MlTrainingInfo($channelId: ID!) {\n    mlTrainingInfo(channelId: $channelId) {\n      status\n      progress\n      startedAt\n      error\n      productCount\n      imageCount\n      hasActiveModel\n      lastTrainedAt\n      queuedAt\n    }\n  }\n": types.MlTrainingInfoDocument,
    "\n  query MlTrainingDataSummary($channelId: ID!) {\n    mlTrainingDataSummary(channelId: $channelId) {\n      extractedAt\n      productCount\n      imageCount\n      products {\n        productName\n        imageCount\n      }\n    }\n  }\n": types.MlTrainingDataSummaryDocument,
    "\n  query MlSchedulerConfig {\n    mlSchedulerConfig {\n      intervalMinutes\n      cooldownHours\n    }\n  }\n": types.MlSchedulerConfigDocument,
    "\n  query MlTrainerJobs {\n    mlTrainerJobs {\n      channelId\n      status\n      startedAt\n      completedAt\n      failedAt\n      error\n    }\n  }\n": types.MlTrainerJobsDocument,
    "\n  query MlModelInfo($channelId: ID!) {\n    mlModelInfo(channelId: $channelId) {\n      hasModel\n      version\n      status\n      modelJsonId\n      modelBinId\n      metadataId\n    }\n  }\n": types.MlModelInfoDocument,
    "\n  mutation QueueTraining($channelId: ID!) {\n    queueTraining(channelId: $channelId)\n  }\n": types.QueueTrainingDocument,
    "\n  mutation StartTraining($channelId: ID!) {\n    startTraining(channelId: $channelId)\n  }\n": types.StartTrainingDocument,
    "\n  mutation ExtractPhotosForTraining($channelId: ID!) {\n    extractPhotosForTraining(channelId: $channelId)\n  }\n": types.ExtractPhotosForTrainingDocument,
    "\n  mutation SetMlModelStatus($channelId: ID!, $status: String!) {\n    setMlModelStatus(channelId: $channelId, status: $status)\n  }\n": types.SetMlModelStatusDocument,
    "\n  mutation ClearMlModel($channelId: ID!) {\n    clearMlModel(channelId: $channelId)\n  }\n": types.ClearMlModelDocument,
    "\n  mutation RefreshTrainingCounts($channelId: ID!) {\n    refreshTrainingCounts(channelId: $channelId)\n  }\n": types.RefreshTrainingCountsDocument,
    "\n  query TrainingManifestExport($channelId: ID!) {\n    trainingManifestExport(channelId: $channelId) {\n      manifestJson\n    }\n  }\n": types.TrainingManifestExportDocument,
    "\n  mutation UploadModelManually($channelId: ID!, $modelJson: Upload!, $weightsFile: Upload!, $metadata: Upload!) {\n    uploadModelManually(channelId: $channelId, modelJson: $modelJson, weightsFile: $weightsFile, metadata: $metadata)\n  }\n": types.UploadModelManuallyDocument,
    "\n  query RegistrationSeedContext {\n    registrationSeedContext {\n      zone {\n        id\n        name\n        members {\n          id\n          name\n          code\n        }\n      }\n      taxRate {\n        id\n        name\n        categoryName\n        value\n      }\n    }\n  }\n": types.RegistrationSeedContextDocument,
    "\n  mutation UpdateRegistrationTaxRate($input: UpdateRegistrationTaxRateInput!) {\n    updateRegistrationTaxRate(input: $input) {\n      id\n      name\n      categoryName\n      value\n    }\n  }\n": types.UpdateRegistrationTaxRateDocument,
    "\n  query PlatformRoleTemplates {\n    platformRoleTemplates {\n      id\n      code\n      name\n      description\n      permissions\n    }\n  }\n": types.PlatformRoleTemplatesDocument,
    "\n  query AssignablePermissions {\n    assignablePermissions\n  }\n": types.AssignablePermissionsDocument,
    "\n  mutation CreateRoleTemplate($input: CreateRoleTemplateInput!) {\n    createRoleTemplate(input: $input) {\n      id\n      code\n      name\n      description\n      permissions\n    }\n  }\n": types.CreateRoleTemplateDocument,
    "\n  mutation UpdateRoleTemplate($id: ID!, $input: UpdateRoleTemplateInput!) {\n    updateRoleTemplate(id: $id, input: $input) {\n      id\n      code\n      name\n      description\n      permissions\n    }\n  }\n": types.UpdateRoleTemplateDocument,
    "\n  mutation DeleteRoleTemplate($id: ID!) {\n    deleteRoleTemplate(id: $id)\n  }\n": types.DeleteRoleTemplateDocument,
    "\n  query AdministratorDetail($administratorId: ID!) {\n    administratorDetail(administratorId: $administratorId) {\n      id\n      firstName\n      lastName\n      emailAddress\n      userId\n      identifier\n      authorizationStatus\n      isSuperAdmin\n      roles {\n        id\n        code\n        channelIds\n        permissions\n      }\n    }\n  }\n": types.AdministratorDetailDocument,
    "\n  mutation UpdateAdministratorPermissions(\n    $administratorId: ID!\n    $channelId: ID!\n    $permissions: [String!]!\n  ) {\n    updateAdministratorPermissions(\n      administratorId: $administratorId\n      channelId: $channelId\n      permissions: $permissions\n    ) {\n      id\n      roles {\n        id\n        code\n        channelIds\n        permissions\n      }\n    }\n  }\n": types.UpdateAdministratorPermissionsDocument,
};

/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 *
 *
 * @example
 * ```ts
 * const query = graphql(`query GetUser($id: ID!) { user(id: $id) { name } }`);
 * ```
 *
 * The query argument is unknown!
 * Please regenerate the types.
 */
export function graphql(source: string): unknown;

/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation Authenticate($username: String!, $password: String!) {\n    authenticate(input: { native: { username: $username, password: $password } }) {\n      ... on CurrentUser {\n        id\n      }\n    }\n  }\n"): (typeof documents)["\n  mutation Authenticate($username: String!, $password: String!) {\n    authenticate(input: { native: { username: $username, password: $password } }) {\n      ... on CurrentUser {\n        id\n      }\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query PlatformZones {\n    platformZones {\n      id\n      name\n    }\n  }\n"): (typeof documents)["\n  query PlatformZones {\n    platformZones {\n      id\n      name\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query ChannelDetailPlatform($channelId: ID!) {\n    channelDetailPlatform(channelId: $channelId) {\n      id\n      code\n      token\n      customFields {\n        status\n        trialEndsAt\n        subscriptionStatus\n        maxAdminCount\n        cashierFlowEnabled\n        cashControlEnabled\n        enablePrinter\n        smsUsedThisPeriod\n        smsPeriodEnd\n        smsLimitFromTier\n      }\n      defaultShippingZone {\n        id\n        name\n      }\n      defaultTaxZone {\n        id\n        name\n      }\n    }\n  }\n"): (typeof documents)["\n  query ChannelDetailPlatform($channelId: ID!) {\n    channelDetailPlatform(channelId: $channelId) {\n      id\n      code\n      token\n      customFields {\n        status\n        trialEndsAt\n        subscriptionStatus\n        maxAdminCount\n        cashierFlowEnabled\n        cashControlEnabled\n        enablePrinter\n        smsUsedThisPeriod\n        smsPeriodEnd\n        smsLimitFromTier\n      }\n      defaultShippingZone {\n        id\n        name\n      }\n      defaultTaxZone {\n        id\n        name\n      }\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation UpdateChannelZonesPlatform($input: UpdateChannelZonesInput!) {\n    updateChannelZonesPlatform(input: $input) {\n      id\n    }\n  }\n"): (typeof documents)["\n  mutation UpdateChannelZonesPlatform($input: UpdateChannelZonesInput!) {\n    updateChannelZonesPlatform(input: $input) {\n      id\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query PlatformChannels {\n    platformChannels {\n      id\n      code\n      token\n      customFields {\n        status\n        trialEndsAt\n        subscriptionStatus\n        maxAdminCount\n        cashierFlowEnabled\n        cashControlEnabled\n        enablePrinter\n        smsUsedThisPeriod\n        smsPeriodEnd\n        smsLimitFromTier\n      }\n    }\n  }\n"): (typeof documents)["\n  query PlatformChannels {\n    platformChannels {\n      id\n      code\n      token\n      customFields {\n        status\n        trialEndsAt\n        subscriptionStatus\n        maxAdminCount\n        cashierFlowEnabled\n        cashControlEnabled\n        enablePrinter\n        smsUsedThisPeriod\n        smsPeriodEnd\n        smsLimitFromTier\n      }\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query PlatformStats {\n    platformStats {\n      totalChannels\n      channelsByStatus {\n        UNAPPROVED\n        APPROVED\n        DISABLED\n        BANNED\n      }\n      trialExpiringSoonCount\n      activeSubscriptionsCount\n    }\n  }\n"): (typeof documents)["\n  query PlatformStats {\n    platformStats {\n      totalChannels\n      channelsByStatus {\n        UNAPPROVED\n        APPROVED\n        DISABLED\n        BANNED\n      }\n      trialExpiringSoonCount\n      activeSubscriptionsCount\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query AdministratorsForChannel($channelId: ID!) {\n    administratorsForChannel(channelId: $channelId) {\n      id\n      firstName\n      lastName\n      emailAddress\n      userId\n      identifier\n      authorizationStatus\n      roleCodes\n    }\n  }\n"): (typeof documents)["\n  query AdministratorsForChannel($channelId: ID!) {\n    administratorsForChannel(channelId: $channelId) {\n      id\n      firstName\n      lastName\n      emailAddress\n      userId\n      identifier\n      authorizationStatus\n      roleCodes\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query PlatformAdministrators($options: PlatformAdministratorListOptions) {\n    platformAdministrators(options: $options) {\n      items {\n        id\n        firstName\n        lastName\n        emailAddress\n        userId\n        identifier\n        authorizationStatus\n        roleCodes\n        channelIds\n        isSuperAdmin\n      }\n      totalItems\n    }\n  }\n"): (typeof documents)["\n  query PlatformAdministrators($options: PlatformAdministratorListOptions) {\n    platformAdministrators(options: $options) {\n      items {\n        id\n        firstName\n        lastName\n        emailAddress\n        userId\n        identifier\n        authorizationStatus\n        roleCodes\n        channelIds\n        isSuperAdmin\n      }\n      totalItems\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query NotificationsForChannel($channelId: ID!, $options: NotificationListOptions) {\n    notificationsForChannel(channelId: $channelId, options: $options) {\n      items {\n        id\n        userId\n        channelId\n        type\n        title\n        message\n        read\n        createdAt\n      }\n      totalItems\n    }\n  }\n"): (typeof documents)["\n  query NotificationsForChannel($channelId: ID!, $options: NotificationListOptions) {\n    notificationsForChannel(channelId: $channelId, options: $options) {\n      items {\n        id\n        userId\n        channelId\n        type\n        title\n        message\n        read\n        createdAt\n      }\n      totalItems\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query AnalyticsStatsForChannel($channelId: ID!, $timeRange: AnalyticsTimeRange!, $limit: Int) {\n    analyticsStatsForChannel(channelId: $channelId, timeRange: $timeRange, limit: $limit) {\n      totalRevenue\n      totalOrders\n      averageProfitMargin\n      salesTrend { date value }\n      orderVolumeTrend { date value }\n      customerGrowthTrend { date value }\n    }\n  }\n"): (typeof documents)["\n  query AnalyticsStatsForChannel($channelId: ID!, $timeRange: AnalyticsTimeRange!, $limit: Int) {\n    analyticsStatsForChannel(channelId: $channelId, timeRange: $timeRange, limit: $limit) {\n      totalRevenue\n      totalOrders\n      averageProfitMargin\n      salesTrend { date value }\n      orderVolumeTrend { date value }\n      customerGrowthTrend { date value }\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query AuditLogsForChannel($channelId: ID!, $options: AuditLogOptions) {\n    auditLogsForChannel(channelId: $channelId, options: $options) {\n      id\n      timestamp\n      eventType\n      entityType\n      entityId\n      userId\n      data\n    }\n  }\n"): (typeof documents)["\n  query AuditLogsForChannel($channelId: ID!, $options: AuditLogOptions) {\n    auditLogsForChannel(channelId: $channelId, options: $options) {\n      id\n      timestamp\n      eventType\n      entityType\n      entityId\n      userId\n      data\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query AdminLoginAttempts($limit: Int, $skip: Int, $since: DateTime) {\n    adminLoginAttempts(limit: $limit, skip: $skip, since: $since) {\n      id\n      eventKind\n      timestamp\n      ipAddress\n      username\n      success\n      failureReason\n      userId\n      authMethod\n      userAgent\n      isSuperAdmin\n    }\n  }\n"): (typeof documents)["\n  query AdminLoginAttempts($limit: Int, $skip: Int, $since: DateTime) {\n    adminLoginAttempts(limit: $limit, skip: $skip, since: $since) {\n      id\n      eventKind\n      timestamp\n      ipAddress\n      username\n      success\n      failureReason\n      userId\n      authMethod\n      userAgent\n      isSuperAdmin\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation UpdateChannelStatusPlatform($channelId: ID!, $status: String!) {\n    updateChannelStatusPlatform(channelId: $channelId, status: $status) {\n      id\n      customFields { status }\n    }\n  }\n"): (typeof documents)["\n  mutation UpdateChannelStatusPlatform($channelId: ID!, $status: String!) {\n    updateChannelStatusPlatform(channelId: $channelId, status: $status) {\n      id\n      customFields { status }\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation ExtendTrialPlatform($channelId: ID!, $trialEndsAt: DateTime!) {\n    extendTrialPlatform(channelId: $channelId, trialEndsAt: $trialEndsAt) {\n      id\n      customFields { trialEndsAt }\n    }\n  }\n"): (typeof documents)["\n  mutation ExtendTrialPlatform($channelId: ID!, $trialEndsAt: DateTime!) {\n    extendTrialPlatform(channelId: $channelId, trialEndsAt: $trialEndsAt) {\n      id\n      customFields { trialEndsAt }\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation UpdateChannelFeatureFlagsPlatform($input: UpdateChannelFeatureFlagsInput!) {\n    updateChannelFeatureFlagsPlatform(input: $input) {\n      id\n      customFields {\n        maxAdminCount\n        cashierFlowEnabled\n        cashControlEnabled\n        enablePrinter\n      }\n    }\n  }\n"): (typeof documents)["\n  mutation UpdateChannelFeatureFlagsPlatform($input: UpdateChannelFeatureFlagsInput!) {\n    updateChannelFeatureFlagsPlatform(input: $input) {\n      id\n      customFields {\n        maxAdminCount\n        cashierFlowEnabled\n        cashControlEnabled\n        enablePrinter\n      }\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query GetSubscriptionTiers {\n    getSubscriptionTiers {\n      id\n      code\n      name\n      description\n      priceMonthly\n      priceYearly\n      features\n      smsLimit\n      isActive\n      createdAt\n      updatedAt\n    }\n  }\n"): (typeof documents)["\n  query GetSubscriptionTiers {\n    getSubscriptionTiers {\n      id\n      code\n      name\n      description\n      priceMonthly\n      priceYearly\n      features\n      smsLimit\n      isActive\n      createdAt\n      updatedAt\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation CreateSubscriptionTier($input: CreateSubscriptionTierInput!) {\n    createSubscriptionTier(input: $input) {\n      id\n      code\n      name\n      priceMonthly\n      priceYearly\n      smsLimit\n      isActive\n    }\n  }\n"): (typeof documents)["\n  mutation CreateSubscriptionTier($input: CreateSubscriptionTierInput!) {\n    createSubscriptionTier(input: $input) {\n      id\n      code\n      name\n      priceMonthly\n      priceYearly\n      smsLimit\n      isActive\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation UpdateSubscriptionTier($input: UpdateSubscriptionTierInput!) {\n    updateSubscriptionTier(input: $input) {\n      id\n      code\n      name\n      priceMonthly\n      priceYearly\n      smsLimit\n      isActive\n    }\n  }\n"): (typeof documents)["\n  mutation UpdateSubscriptionTier($input: UpdateSubscriptionTierInput!) {\n    updateSubscriptionTier(input: $input) {\n      id\n      code\n      name\n      priceMonthly\n      priceYearly\n      smsLimit\n      isActive\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation DeactivateSubscriptionTier($id: ID!) {\n    deactivateSubscriptionTier(id: $id)\n  }\n"): (typeof documents)["\n  mutation DeactivateSubscriptionTier($id: ID!) {\n    deactivateSubscriptionTier(id: $id)\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query PendingRegistrations {\n    pendingRegistrations {\n      userId\n      identifier\n      createdAt\n      administrator {\n        id\n        firstName\n        lastName\n        emailAddress\n      }\n    }\n  }\n"): (typeof documents)["\n  query PendingRegistrations {\n    pendingRegistrations {\n      userId\n      identifier\n      createdAt\n      administrator {\n        id\n        firstName\n        lastName\n        emailAddress\n      }\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation ApproveUser($userId: ID!) {\n    approveUser(userId: $userId) {\n      id\n      identifier\n      authorizationStatus\n    }\n  }\n"): (typeof documents)["\n  mutation ApproveUser($userId: ID!) {\n    approveUser(userId: $userId) {\n      id\n      identifier\n      authorizationStatus\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation RejectUser($userId: ID!, $reason: String) {\n    rejectUser(userId: $userId, reason: $reason) {\n      id\n      identifier\n      authorizationStatus\n    }\n  }\n"): (typeof documents)["\n  mutation RejectUser($userId: ID!, $reason: String) {\n    rejectUser(userId: $userId, reason: $reason) {\n      id\n      identifier\n      authorizationStatus\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query MlTrainerHealth {\n    mlTrainerHealth {\n      status\n      uptimeSeconds\n      error\n    }\n  }\n"): (typeof documents)["\n  query MlTrainerHealth {\n    mlTrainerHealth {\n      status\n      uptimeSeconds\n      error\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query MlTrainingInfo($channelId: ID!) {\n    mlTrainingInfo(channelId: $channelId) {\n      status\n      progress\n      startedAt\n      error\n      productCount\n      imageCount\n      hasActiveModel\n      lastTrainedAt\n      queuedAt\n    }\n  }\n"): (typeof documents)["\n  query MlTrainingInfo($channelId: ID!) {\n    mlTrainingInfo(channelId: $channelId) {\n      status\n      progress\n      startedAt\n      error\n      productCount\n      imageCount\n      hasActiveModel\n      lastTrainedAt\n      queuedAt\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query MlTrainingDataSummary($channelId: ID!) {\n    mlTrainingDataSummary(channelId: $channelId) {\n      extractedAt\n      productCount\n      imageCount\n      products {\n        productName\n        imageCount\n      }\n    }\n  }\n"): (typeof documents)["\n  query MlTrainingDataSummary($channelId: ID!) {\n    mlTrainingDataSummary(channelId: $channelId) {\n      extractedAt\n      productCount\n      imageCount\n      products {\n        productName\n        imageCount\n      }\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query MlSchedulerConfig {\n    mlSchedulerConfig {\n      intervalMinutes\n      cooldownHours\n    }\n  }\n"): (typeof documents)["\n  query MlSchedulerConfig {\n    mlSchedulerConfig {\n      intervalMinutes\n      cooldownHours\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query MlTrainerJobs {\n    mlTrainerJobs {\n      channelId\n      status\n      startedAt\n      completedAt\n      failedAt\n      error\n    }\n  }\n"): (typeof documents)["\n  query MlTrainerJobs {\n    mlTrainerJobs {\n      channelId\n      status\n      startedAt\n      completedAt\n      failedAt\n      error\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query MlModelInfo($channelId: ID!) {\n    mlModelInfo(channelId: $channelId) {\n      hasModel\n      version\n      status\n      modelJsonId\n      modelBinId\n      metadataId\n    }\n  }\n"): (typeof documents)["\n  query MlModelInfo($channelId: ID!) {\n    mlModelInfo(channelId: $channelId) {\n      hasModel\n      version\n      status\n      modelJsonId\n      modelBinId\n      metadataId\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation QueueTraining($channelId: ID!) {\n    queueTraining(channelId: $channelId)\n  }\n"): (typeof documents)["\n  mutation QueueTraining($channelId: ID!) {\n    queueTraining(channelId: $channelId)\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation StartTraining($channelId: ID!) {\n    startTraining(channelId: $channelId)\n  }\n"): (typeof documents)["\n  mutation StartTraining($channelId: ID!) {\n    startTraining(channelId: $channelId)\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation ExtractPhotosForTraining($channelId: ID!) {\n    extractPhotosForTraining(channelId: $channelId)\n  }\n"): (typeof documents)["\n  mutation ExtractPhotosForTraining($channelId: ID!) {\n    extractPhotosForTraining(channelId: $channelId)\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation SetMlModelStatus($channelId: ID!, $status: String!) {\n    setMlModelStatus(channelId: $channelId, status: $status)\n  }\n"): (typeof documents)["\n  mutation SetMlModelStatus($channelId: ID!, $status: String!) {\n    setMlModelStatus(channelId: $channelId, status: $status)\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation ClearMlModel($channelId: ID!) {\n    clearMlModel(channelId: $channelId)\n  }\n"): (typeof documents)["\n  mutation ClearMlModel($channelId: ID!) {\n    clearMlModel(channelId: $channelId)\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation RefreshTrainingCounts($channelId: ID!) {\n    refreshTrainingCounts(channelId: $channelId)\n  }\n"): (typeof documents)["\n  mutation RefreshTrainingCounts($channelId: ID!) {\n    refreshTrainingCounts(channelId: $channelId)\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query TrainingManifestExport($channelId: ID!) {\n    trainingManifestExport(channelId: $channelId) {\n      manifestJson\n    }\n  }\n"): (typeof documents)["\n  query TrainingManifestExport($channelId: ID!) {\n    trainingManifestExport(channelId: $channelId) {\n      manifestJson\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation UploadModelManually($channelId: ID!, $modelJson: Upload!, $weightsFile: Upload!, $metadata: Upload!) {\n    uploadModelManually(channelId: $channelId, modelJson: $modelJson, weightsFile: $weightsFile, metadata: $metadata)\n  }\n"): (typeof documents)["\n  mutation UploadModelManually($channelId: ID!, $modelJson: Upload!, $weightsFile: Upload!, $metadata: Upload!) {\n    uploadModelManually(channelId: $channelId, modelJson: $modelJson, weightsFile: $weightsFile, metadata: $metadata)\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query RegistrationSeedContext {\n    registrationSeedContext {\n      zone {\n        id\n        name\n        members {\n          id\n          name\n          code\n        }\n      }\n      taxRate {\n        id\n        name\n        categoryName\n        value\n      }\n    }\n  }\n"): (typeof documents)["\n  query RegistrationSeedContext {\n    registrationSeedContext {\n      zone {\n        id\n        name\n        members {\n          id\n          name\n          code\n        }\n      }\n      taxRate {\n        id\n        name\n        categoryName\n        value\n      }\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation UpdateRegistrationTaxRate($input: UpdateRegistrationTaxRateInput!) {\n    updateRegistrationTaxRate(input: $input) {\n      id\n      name\n      categoryName\n      value\n    }\n  }\n"): (typeof documents)["\n  mutation UpdateRegistrationTaxRate($input: UpdateRegistrationTaxRateInput!) {\n    updateRegistrationTaxRate(input: $input) {\n      id\n      name\n      categoryName\n      value\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query PlatformRoleTemplates {\n    platformRoleTemplates {\n      id\n      code\n      name\n      description\n      permissions\n    }\n  }\n"): (typeof documents)["\n  query PlatformRoleTemplates {\n    platformRoleTemplates {\n      id\n      code\n      name\n      description\n      permissions\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query AssignablePermissions {\n    assignablePermissions\n  }\n"): (typeof documents)["\n  query AssignablePermissions {\n    assignablePermissions\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation CreateRoleTemplate($input: CreateRoleTemplateInput!) {\n    createRoleTemplate(input: $input) {\n      id\n      code\n      name\n      description\n      permissions\n    }\n  }\n"): (typeof documents)["\n  mutation CreateRoleTemplate($input: CreateRoleTemplateInput!) {\n    createRoleTemplate(input: $input) {\n      id\n      code\n      name\n      description\n      permissions\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation UpdateRoleTemplate($id: ID!, $input: UpdateRoleTemplateInput!) {\n    updateRoleTemplate(id: $id, input: $input) {\n      id\n      code\n      name\n      description\n      permissions\n    }\n  }\n"): (typeof documents)["\n  mutation UpdateRoleTemplate($id: ID!, $input: UpdateRoleTemplateInput!) {\n    updateRoleTemplate(id: $id, input: $input) {\n      id\n      code\n      name\n      description\n      permissions\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation DeleteRoleTemplate($id: ID!) {\n    deleteRoleTemplate(id: $id)\n  }\n"): (typeof documents)["\n  mutation DeleteRoleTemplate($id: ID!) {\n    deleteRoleTemplate(id: $id)\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query AdministratorDetail($administratorId: ID!) {\n    administratorDetail(administratorId: $administratorId) {\n      id\n      firstName\n      lastName\n      emailAddress\n      userId\n      identifier\n      authorizationStatus\n      isSuperAdmin\n      roles {\n        id\n        code\n        channelIds\n        permissions\n      }\n    }\n  }\n"): (typeof documents)["\n  query AdministratorDetail($administratorId: ID!) {\n    administratorDetail(administratorId: $administratorId) {\n      id\n      firstName\n      lastName\n      emailAddress\n      userId\n      identifier\n      authorizationStatus\n      isSuperAdmin\n      roles {\n        id\n        code\n        channelIds\n        permissions\n      }\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation UpdateAdministratorPermissions(\n    $administratorId: ID!\n    $channelId: ID!\n    $permissions: [String!]!\n  ) {\n    updateAdministratorPermissions(\n      administratorId: $administratorId\n      channelId: $channelId\n      permissions: $permissions\n    ) {\n      id\n      roles {\n        id\n        code\n        channelIds\n        permissions\n      }\n    }\n  }\n"): (typeof documents)["\n  mutation UpdateAdministratorPermissions(\n    $administratorId: ID!\n    $channelId: ID!\n    $permissions: [String!]!\n  ) {\n    updateAdministratorPermissions(\n      administratorId: $administratorId\n      channelId: $channelId\n      permissions: $permissions\n    ) {\n      id\n      roles {\n        id\n        code\n        channelIds\n        permissions\n      }\n    }\n  }\n"];

export function graphql(source: string) {
  return (documents as any)[source] ?? {};
}

export type DocumentType<TDocumentNode extends DocumentNode<any, any>> = TDocumentNode extends DocumentNode<  infer TType,  any>  ? TType  : never;
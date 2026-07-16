import { graphql } from '../../shared/graphql/generated';

export const CREATE_ASSETS = graphql(`
  mutation CreateAssets($input: [CreateAssetInput!]!) {
    createAssets(input: $input) {
      ... on Asset {
        id
        name
        preview
        source
      }
    }
  }
`);

export const ASSIGN_ASSETS_TO_PRODUCT = graphql(`
  mutation AssignAssetsToProduct($productId: ID!, $assetIds: [ID!]!, $featuredAssetId: ID) {
    updateProduct(
      input: { id: $productId, assetIds: $assetIds, featuredAssetId: $featuredAssetId }
    ) {
      id
      assets {
        id
        name
        preview
      }
      featuredAsset {
        id
        preview
      }
    }
  }
`);

export const ASSIGN_ASSETS_TO_CHANNEL = graphql(`
  mutation AssignAssetsToChannel($assetIds: [ID!]!, $channelId: ID!) {
    assignAssetsToChannel(input: { assetIds: $assetIds, channelId: $channelId }) {
      id
      name
    }
  }
`);

export const DELETE_ASSET = graphql(`
  mutation DeleteAsset($input: DeleteAssetInput!) {
    deleteAsset(input: $input) {
      result
      message
    }
  }
`);

export const UPDATE_PRODUCT_ASSETS = graphql(`
  mutation UpdateProductAssets($productId: ID!, $assetIds: [ID!]!, $featuredAssetId: ID) {
    updateProduct(
      input: { id: $productId, assetIds: $assetIds, featuredAssetId: $featuredAssetId }
    ) {
      id
      assets {
        id
        name
        preview
        source
      }
      featuredAsset {
        id
        preview
      }
    }
  }
`);

export const GET_COUNTRIES = graphql(`
  query GetCountries($options: CountryListOptions) {
    countries(options: $options) {
      totalItems
      items {
        id
        code
        name
        enabled
      }
    }
  }
`);

export const UPDATE_CHANNEL_LOGO = graphql(`
  mutation UpdateChannelLogo($logoAssetId: ID) {
    updateChannelLogo(logoAssetId: $logoAssetId) {
      cashierFlowEnabled
      batchExpiryEnabled
      lowStockThreshold
      enablePrinter
      companyLogoAsset {
        id
        preview
        source
      }
    }
  }
`) as any;

export const UPDATE_CASHIER_SETTINGS = graphql(`
  mutation UpdateCashierSettings($cashierFlowEnabled: Boolean) {
    updateCashierSettings(cashierFlowEnabled: $cashierFlowEnabled) {
      cashierFlowEnabled
      batchExpiryEnabled
      lowStockThreshold
      enablePrinter
      companyLogoAsset {
        id
        preview
        source
      }
    }
  }
`) as any;

export const UPDATE_BATCH_EXPIRY_SETTINGS = graphql(`
  mutation UpdateBatchExpirySettings($batchExpiryEnabled: Boolean, $lowStockThreshold: Int) {
    updateBatchExpirySettings(
      batchExpiryEnabled: $batchExpiryEnabled
      lowStockThreshold: $lowStockThreshold
    ) {
      cashierFlowEnabled
      batchExpiryEnabled
      lowStockThreshold
      enablePrinter
      companyLogoAsset {
        id
        preview
        source
      }
    }
  }
`) as any;

export const UPDATE_PRINTER_SETTINGS = graphql(`
  mutation UpdatePrinterSettings($enablePrinter: Boolean!) {
    updatePrinterSettings(enablePrinter: $enablePrinter) {
      cashierFlowEnabled
      batchExpiryEnabled
      lowStockThreshold
      enablePrinter
      companyLogoAsset {
        id
        preview
        source
      }
    }
  }
`) as any;

export const INVITE_CHANNEL_ADMINISTRATOR = graphql(`
  mutation InviteChannelAdministrator($input: InviteAdministratorInput!) {
    inviteChannelAdministrator(input: $input) {
      id
      firstName
      lastName
      emailAddress
      user {
        id
        identifier
        roles {
          id
          code
          permissions
        }
      }
    }
  }
`);

export const GET_ROLE_TEMPLATES = graphql(`
  query GetRoleTemplates {
    roleTemplates {
      code
      name
      description
      permissions
    }
  }
`);

export const CREATE_CHANNEL_ADMIN = graphql(`
  mutation CreateChannelAdmin($input: CreateChannelAdminInput!) {
    createChannelAdmin(input: $input) {
      id
      firstName
      lastName
      emailAddress
      user {
        id
        identifier
        roles {
          id
          code
          permissions
        }
      }
    }
  }
`);

export const UPDATE_CHANNEL_ADMIN = graphql(`
  mutation UpdateChannelAdmin($id: ID!, $permissions: [String!]!) {
    updateChannelAdmin(id: $id, permissions: $permissions) {
      id
      firstName
      lastName
      emailAddress
      user {
        id
        identifier
        roles {
          id
          code
          permissions
        }
      }
    }
  }
`);

export const DISABLE_CHANNEL_ADMIN = graphql(`
  mutation DisableChannelAdmin($id: ID!) {
    disableChannelAdmin(id: $id) {
      success
      message
    }
  }
`);

export const GET_ADMINISTRATORS = graphql(`
  query GetAdministrators($options: AdministratorListOptions) {
    administrators(options: $options) {
      items {
        id
        firstName
        lastName
        emailAddress
        user {
          id
          identifier
          verified
          roles {
            id
            code
            permissions
            channels {
              id
            }
          }
        }
      }
    }
  }
`);

export const GET_ADMINISTRATOR_BY_ID = graphql(`
  query GetAdministratorById($id: ID!) {
    administrator(id: $id) {
      id
      firstName
      lastName
      emailAddress
      createdAt
      updatedAt
      user {
        id
        identifier
        verified
        lastLogin
        roles {
          id
          code
          description
          permissions
          channels {
            id
            code
            token
          }
        }
      }
    }
  }
`);

export const GET_ADMINISTRATOR_BY_USER_ID = graphql(`
  query GetAdministratorByUserId($userId: ID!) {
    administratorByUserId(userId: $userId) {
      id
      firstName
      lastName
      emailAddress
      createdAt
      updatedAt
      user {
        id
        identifier
        verified
        lastLogin
        roles {
          id
          code
          description
          permissions
          channels {
            id
            code
            token
          }
        }
      }
    }
  }
`);

export const CREATE_CHANNEL_PAYMENT_METHOD = graphql(`
  mutation CreateChannelPaymentMethod($input: CreatePaymentMethodInput!) {
    createChannelPaymentMethod(input: $input) {
      id
      code
      name
    }
  }
`);

export const UPDATE_CHANNEL_PAYMENT_METHOD = graphql(`
  mutation UpdateChannelPaymentMethod($input: UpdatePaymentMethodInput!) {
    updateChannelPaymentMethod(input: $input) {
      id
      code
      name
      customFields {
        imageAsset {
          id
          preview
        }
        isActive
      }
    }
  }
`);

export const GET_AUDIT_LOGS = graphql(`
  query GetAuditLogs($options: AuditLogOptions) {
    auditLogs(options: $options) {
      id
      timestamp
      channelId
      eventType
      entityType
      entityId
      userId
      data
      source
    }
  }
`);

export const GET_CHANNEL_SUBSCRIPTION = graphql(`
  query GetChannelSubscription($channelId: ID) {
    getChannelSubscription(channelId: $channelId) {
      tier {
        id
        code
        name
        description
        priceMonthly
        priceYearly
        features
      }
      status
      access
      reason
      trialEndsAt
      subscriptionStartedAt
      subscriptionExpiresAt
      expiresAt
      exemptionEndsAt
      exemptionReason
      gracePeriodEnd
      billingCycle
      lastPaymentDate
      lastPaymentAmount
      canWrite
      canRead
    }
  }
`);


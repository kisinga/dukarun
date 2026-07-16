import { graphql } from '../../core/graphql/generated';

/**
 * User / administrator operations for the super-admin app.
 */

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

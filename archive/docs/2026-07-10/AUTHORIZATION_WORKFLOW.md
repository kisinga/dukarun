# Authorization Workflow Documentation

This document describes the two-tier authorization workflow for new user registrations.

## Overview

The system uses **two-tier authorization**:

1. **User-level**: `authorizationStatus` (PENDING/APPROVED/REJECTED) - account-level authorization
2. **Channel-level**: `status` (UNAPPROVED/APPROVED/DISABLED/BANNED) - business approval status

Users can login with PENDING status but have restricted access based on channel status.

## Authorization Status Flow

### User-Level Flow

```
REGISTRATION → PENDING (can login, restricted by channel)
            → APPROVED (can login, restricted by channel)
            → REJECTED (cannot login - blocks all access)
```

### Channel-Level Flow

```
REGISTRATION → UNAPPROVED (read-only access)
            → APPROVED (full access)
            → DISABLED (no access - blocks login)
            → BANNED (no access - blocks login)
```

## User States

### PENDING

- Initial state after successful registration
- **Can login** (with channel status restrictions)
- User account is pending review
- Access level determined by channel status

### APPROVED

- User account approved
- **Can login** (with channel status restrictions)
- Access level determined by channel status

### REJECTED

- User account rejected
- **Cannot login** - blocks all access
- Registration was rejected by admin
- Reason should be stored for reference

## Channel States

### UNAPPROVED

- Default state after channel registration
- **Read-only access**: Queries allowed, mutations blocked
- Allows users to view data while awaiting admin approval

### APPROVED

- Channel has been reviewed and approved
- **Full access**: All queries and mutations allowed

### DISABLED

- Channel temporarily disabled
- **No access**: All operations blocked (queries and mutations)
- Blocks login

### BANNED

- Channel permanently banned
- **No access**: All operations blocked (queries and mutations)
- Blocks login

## GraphQL Operations Required

### Query: Get Pending Registrations

```graphql
query GetPendingRegistrations {
  pendingRegistrations {
    id
    identifier
    createdAt
    customFields {
      authorizationStatus
    }
    administrator {
      id
      firstName
      lastName
      emailAddress
    }
  }
}
```

### Mutation: Approve User

```graphql
mutation ApproveUser($userId: ID!) {
  approveUser(userId: $userId) {
    id
    identifier
    customFields {
      authorizationStatus
    }
  }
}
```

### Mutation: Reject User

```graphql
mutation RejectUser($userId: ID!, $reason: String) {
  rejectUser(userId: $userId, reason: $reason) {
    id
    identifier
    customFields {
      authorizationStatus
    }
  }
}
```

### Query: Check Authorization Status

```graphql
query CheckAuthorizationStatus($identifier: String!) {
  checkAuthorizationStatus(identifier: $identifier) {
    status
    message
  }
}
```

**Status Values:**

- `PENDING`: Account awaiting approval
- `APPROVED`: Account approved and can login
- `REJECTED`: Account rejected

## Backend Implementation Requirements

### User Entity Custom Field

Add custom field to User entity:

```typescript
{
  name: 'authorizationStatus',
  type: 'string', // Or enum if supported
  label: [{ languageCode: LanguageCode.en, value: 'Authorization Status' }],
  description: [{ languageCode: LanguageCode.en, value: 'User authorization status for login access' }],
  defaultValue: 'PENDING',
  public: false,
  nullable: false,
  // Enum values: PENDING, APPROVED, REJECTED
}
```

### Service Methods

1. **Get Pending Registrations**
   - Query users where `customFields.authorizationStatus === 'PENDING'`
   - Include administrator details
   - Sort by `createdAt` (newest first)

2. **Approve User**
   - Update `customFields.authorizationStatus` to `APPROVED`
   - Optionally send notification to user
   - Return updated user

3. **Reject User**
   - Update `customFields.authorizationStatus` to `REJECTED`
   - Store rejection reason (if provided)
   - Optionally send notification to user
   - Return updated user

4. **Check Authorization Status**
   - Find user by identifier (phone number)
   - Return current authorization status
   - Used during login to verify user can access system

### Authentication Strategy Integration

The authentication strategy uses **two-tier authorization**:

1. User requests OTP
2. User verifies OTP
3. System checks `user.authorizationStatus`:
   - If `REJECTED`: Block login with message "Account rejected. Contact support."
   - If `PENDING` or `APPROVED`: Continue to channel check
4. System gets user's channels via roles
5. System checks all channels' `status` (via `getChannelStatus(channel.customFields)`):
   - If any channel is `DISABLED` or `BANNED`: Block login
   - If all channels are `UNAPPROVED`: Allow login with `READ_ONLY` access
   - If any channel is `APPROVED`: Allow login with `FULL` access
6. Create session with `accessLevel` and `channelId`

### Request-Time Access Control

The `ChannelAccessGuardService` enforces access on every request:

1. Extract `channelId` from RequestContext
2. Load channel and get status via `getChannelStatus(channel.customFields)`
3. Check channel status:
   - `DISABLED`/`BANNED`: Block all operations
   - `UNAPPROVED`: Block mutations (read-only mode)
   - `APPROVED`: Allow all operations

**Implementation Note**: All channel status reads use the `getChannelStatus()` helper function from `domain/channel-custom-fields.ts` to ensure type safety and consistency. The `status` field in `channel.customFields` is the single source of truth.

**Note**: If channel status changes after login, the session is effectively invalidated on the next request. This is intentional for security. See `docs/CHANNEL_STATUS_AUTH.md` for details.

## Admin UI Recommendations

### Pending Registrations Page

1. List view showing:
   - User identifier (phone number)
   - Admin name (firstName + lastName)
   - Company name
   - Registration date
   - Actions: Approve / Reject buttons

2. Detail view showing:
   - All registration fields
   - Company information
   - Store information
   - Approve / Reject actions with reason input

3. Filters:
   - Status filter (PENDING, APPROVED, REJECTED)
   - Date range filter
   - Search by phone number or company name

### Actions

- **Approve**: One-click approval, updates status immediately
- **Reject**: Opens modal with optional reason field
- **Bulk Actions**: Approve/reject multiple registrations at once

## Notification Requirements

When a user is approved or rejected, consider sending notifications:

- **Approved**: SMS or email notification that account is ready
- **Rejected**: SMS or email notification with reason (if provided)

## Security Considerations

1. Only users with appropriate admin permissions can approve/reject users and channels
2. Log all approval/rejection actions for audit trail
3. Rejection reasons should be stored but not exposed to regular users
4. Rate limiting on approval/rejection actions to prevent abuse
5. Channel status changes take effect immediately (session invalidation on next request)
6. Multi-channel users: Status of any channel affects access
7. Read-only mode enforced at the guard level for mutations

## Related Documentation

- `docs/CHANNEL_STATUS_AUTH.md` - Detailed channel status authorization system documentation
- `docs/CHANNEL_LINKING_IMPLEMENTATION.md` - Channel-user linking implementation

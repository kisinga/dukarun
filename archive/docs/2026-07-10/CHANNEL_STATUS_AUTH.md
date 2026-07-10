# Channel Status Authorization System

## Overview

The channel status authorization system provides two-tier access control:

1. **User-level**: `authorizationStatus` (PENDING/APPROVED/REJECTED) - account-level authorization
2. **Channel-level**: `status` (UNAPPROVED/APPROVED/DISABLED/BANNED) - business approval status

## Channel Status States

### UNAPPROVED

- **Default state** after channel registration
- **Access**: Read-only mode
  - Queries allowed
  - Mutations blocked
- **Purpose**: Allows users to view data while awaiting admin approval

### APPROVED

- **Full access** granted
- **Access**: Full read/write access
  - All queries allowed
  - All mutations allowed
- **Purpose**: Channel has been reviewed and approved by admin

### DISABLED

- **No access** - blocks all operations
- **Access**: All operations blocked (queries and mutations)
- **Purpose**: Temporarily disable channel (e.g., maintenance, compliance issues)

### BANNED

- **No access** - blocks all operations
- **Access**: All operations blocked (queries and mutations)
- **Purpose**: Permanently ban channel (e.g., policy violations)

## User Authorization Status

### PENDING

- **Can login** (with channel status restrictions)
- **Purpose**: Initial state after registration

### APPROVED

- **Can login** (with channel status restrictions)
- **Purpose**: User account approved (separate from channel approval)

### REJECTED

- **Cannot login** - blocks all access
- **Purpose**: User account rejected (account-level issue)

## Access Control Flow

### Login Flow

```
1. Verify OTP
2. Find user with roles and channels
3. Check user.authorizationStatus:
   - REJECTED → Block login
   - PENDING/APPROVED → Continue
4. Get all user's channels via roles
5. For each channel, get status via getChannelStatus(channel.customFields):
   - Any DISABLED/BANNED → Block login
   - All UNAPPROVED → accessLevel = READ_ONLY
   - Any APPROVED → accessLevel = FULL (use first approved channel)
6. Create session with accessLevel and channelId
```

### Request-Time Verification

```
1. Extract channelId from RequestContext
2. Load channel and get status via getChannelStatus(channel.customFields)
3. Check channel status:
   - DISABLED/BANNED → Block all operations
   - UNAPPROVED → Block mutations (read-only)
   - APPROVED → Allow all operations
```

**Note**: The `status` field in `channel.customFields` is the single source of truth. All code uses the `getChannelStatus()` helper function for type-safe access.

## Multi-Channel Users

### Overview

Users can belong to multiple channels through multiple roles. Each role can be assigned to one or more channels.

### Channel Selection Logic

On login:

- System checks all channels the user belongs to
- If any channel is APPROVED, user gets FULL access (uses first APPROVED channel)
- If all channels are UNAPPROVED, user gets READ_ONLY access (uses first channel)
- If any channel is DISABLED/BANNED, login is blocked

### Session Invalidation Behavior

**Important**: When a channel's status changes after login, the session is effectively invalidated on the next request.

#### How It Works

1. User logs in with channel status = APPROVED → Gets FULL access
2. Admin changes channel status to DISABLED
3. User's next request:
   - Guard checks current channel status
   - Finds status = DISABLED
   - Blocks the request with error message

#### Design Decision

This behavior is **intentional** and ensures:

- **Predictable security**: Status changes take effect immediately
- **No stale sessions**: Users can't continue using old permissions
- **Simple implementation**: No need to track and invalidate sessions

#### Limitations & Future Improvements

**Current Limitation**:

- Session invalidation happens on next request, not immediately
- User may complete one more operation before being blocked

**Potential Improvements** (not implemented):

- Real-time session invalidation via WebSocket/SSE
- Session tracking per channel with immediate invalidation
- Graceful degradation with warning messages before blocking

**Note**: For now, this behavior is documented and accepted as a trade-off for simplicity and predictability.

## Read-Only Mode Enforcement

### Implementation

The `ChannelAccessGuardService` enforces read-only mode:

1. **Queries**: Always allowed (regardless of channel status, unless DISABLED/BANNED)
2. **Mutations**:
   - Blocked if channel status is UNAPPROVED
   - Allowed if channel status is APPROVED
   - Blocked if channel status is DISABLED/BANNED

### Error Messages

- **UNAPPROVED mutation attempt**:

  ```
  "Your channel is pending approval. You have read-only access until an admin approves your channel."
  ```

- **DISABLED channel**:

  ```
  "Your channel has been disabled. Please contact support."
  ```

- **BANNED channel**:
  ```
  "Your channel has been banned. Please contact support."
  ```

## Admin UI

### Channel Status Management

- **Location**: Channel detail/edit page → Settings tab
- **Field**: `status` (dropdown)
- **Options**: UNAPPROVED, APPROVED, DISABLED, BANNED
- **Default**: UNAPPROVED

### User Authorization Status Management

- **Location**: User detail/edit page → Settings tab
- **Field**: `authorizationStatus` (dropdown)
- **Options**: PENDING, APPROVED, REJECTED
- **Default**: PENDING

## Migration Notes

### Channel Status Field

The channel status field migration has been completed. All channels now use the `status` field as the single source of truth.

- **Current field**: `status` (enum string: UNAPPROVED/APPROVED/DISABLED/BANNED)
- **Historical note**: This field replaced the old `isApproved` boolean field. The migration converted:
  - `isApproved: true` → `status: 'APPROVED'`
  - `isApproved: false` → `status: 'UNAPPROVED'`
- **Implementation**: All code uses `getChannelStatus()` helper from `domain/channel-custom-fields.ts` to ensure type safety and consistency

### Session Token Structure

**Old structure**:

```json
{
  "userId": "123",
  "phoneNumber": "0712345678"
}
```

**New structure**:

```json
{
  "userId": "123",
  "phoneNumber": "0712345678",
  "accessLevel": "READ_ONLY" | "FULL",
  "channelId": "456"
}
```

## Implementation Pattern

### Accessing Channel Status

All code should use the `getChannelStatus()` helper function for type-safe access to channel status:

```typescript
import { getChannelStatus } from '../../domain/channel-custom-fields';
import { ChannelStatus } from '../services/auth/phone-auth.service';

// ✅ Correct: Use helper function
const status = getChannelStatus(channel.customFields);
if (status === ChannelStatus.APPROVED) {
  // Handle approved channel
}

// ❌ Incorrect: Direct access without type safety
const status = (channel.customFields as any)?.status;
```

### Type Safety

The `ChannelCustomFields` interface in `domain/channel-custom-fields.ts` provides type safety:

```typescript
import { ChannelCustomFields } from '../../domain/channel-custom-fields';

const customFields = channel.customFields as ChannelCustomFields;
// customFields.status is now properly typed as ChannelStatus
```

## Security Considerations

1. **Channel status changes are immediate**: No grace period
2. **Multi-channel users**: Status of any channel affects access
3. **Session validation**: Status checked on every request
4. **Fail-safe behavior**: Errors in guard check default to allowing access (logged)
5. **Single source of truth**: The `status` field in `channel.customFields` is the only source for channel approval status

## Related Files

- `backend/src/domain/channel-custom-fields.ts` - TypeScript interface and helper functions for channel customFields
- `backend/src/services/auth/phone-auth.service.ts` - Login flow and session creation
- `backend/src/services/auth/channel-access-guard.service.ts` - Request-time access control
- `backend/src/vendure-config.ts` - Field definitions
- `backend/src/migrations/1766000700000-AddChannelApprovalField.ts` - Migration (completed)

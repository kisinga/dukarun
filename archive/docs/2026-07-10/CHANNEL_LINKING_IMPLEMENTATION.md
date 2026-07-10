# Channel Linking Implementation Plan

## Overview

This document outlines the future implementation requirements for properly linking channels to users during registration and handling channel validation status without blocking user login.

## Current State

### Registration Flow

Currently, during registration (`verifyRegistrationOTP`):

1. **Customer is created** with phone number and admin details
2. **Channel is created** with company code and settings
3. **Stock Location is created** for the store
4. **Role is created** with channel assignment (`channelIds: [channel.id]`)
5. **Administrator is created** with the role
6. **User's authorization status** is set to `PENDING`

### Current Issue

The administrator is created with a role that has `channelIds: [channel.id]`, which should link the user to the channel. However, there's no explicit validation that ensures:

1. The channel is properly linked to the user/administrator
2. The channel has a validation status that can be communicated
3. The channel validation status doesn't block user login

### Login Flow (Fixed)

As of the current implementation:

- Users can login as long as their phone number is valid (OTP verified)
- Authorization status is returned in the response but **does not block login**
- The status is communicated to the frontend for UI purposes only

## Required Implementation

### 1. Channel-User Linking Validation

During registration, we need to ensure:

```typescript
// After creating administrator with role
const administrator = await this.administratorService.create(ctx, {
  emailAddress: formattedPhone,
  firstName: registrationData.adminFirstName,
  lastName: registrationData.adminLastName,
  password: this.generateSecurePassword(),
  roleIds: [role.id], // Role has channelIds: [channel.id]
});

// VERIFY: Ensure administrator has access to the channel
const adminChannels = await administratorService.getChannelsForAdministrator(ctx, administrator.id);
if (!adminChannels.some(ch => ch.id === channel.id)) {
  // Handle error: Channel not properly linked
  throw new Error('Failed to link channel to user. Please contact support.');
}
```

### 2. Channel Validation Status

Add channel validation status tracking:

**Channel Custom Fields (to be added):**

```typescript
// In channel custom fields schema
channelValidationStatus: {
    type: 'string',
    values: ['PENDING', 'VALIDATED', 'REJECTED'],
    defaultValue: 'PENDING',
    label: 'Channel Validation Status',
    description: 'Status of channel validation by admin',
}
```

**Usage:**

- Set `channelValidationStatus: 'PENDING'` during registration
- Allow admin to update status through admin panel
- Return status in user context/API responses

### 3. Communication Without Blocking

The channel validation status should be:

1. **Returned in API responses** - Include in user profile, channel info, etc.
2. **Displayed in UI** - Show banners, notifications, or status indicators
3. **NOT block login** - Users can always login if OTP is valid
4. **Restrict features if needed** - Can limit certain features based on status, but never block authentication

### 4. Implementation Checklist

- [ ] Add `channelValidationStatus` custom field to Channel entity
- [ ] Verify channel-user linking during registration
- [ ] Create migration for channel validation status field
- [ ] Update registration flow to set channel status to PENDING
- [ ] Add admin endpoint to update channel validation status
- [ ] Include channel validation status in user context/API responses
- [ ] Update frontend to display channel validation status
- [ ] Add UI indicators (banners, badges) for channel status
- [ ] Ensure status communication doesn't block any user flows
- [ ] Add logging for channel linking verification

### 5. API Response Structure

**User Context Response:**

```typescript
{
    user: {
        id: string;
        identifier: string;
        authorizationStatus: 'PENDING' | 'APPROVED' | 'REJECTED';
    },
    channels: [{
        id: string;
        code: string;
        validationStatus: 'PENDING' | 'VALIDATED' | 'REJECTED';
        name: string;
    }]
}
```

### 6. Frontend Display Logic

```typescript
// Example: Show status but don't block
if (user.channels[0]?.validationStatus === 'PENDING') {
  // Show banner: "Your channel is pending validation"
  // Allow full access, just inform user
}

if (user.channels[0]?.validationStatus === 'REJECTED') {
  // Show warning: "Your channel validation was rejected. Contact support."
  // Allow access but may restrict certain features
}
```

## Important Notes

1. **Authentication vs Authorization**:
   - Authentication (login) should only require valid phone number + OTP
   - Authorization/Validation status is for feature access, not login blocking

2. **Channel Linking**:
   - Verify the relationship between Administrator → Role → Channel is properly established
   - Add explicit checks during registration to catch linking failures early

3. **Status Communication**:
   - Always return status in API responses
   - Use UI elements (banners, badges, notifications) to communicate status
   - Never block login based on channel validation status

4. **Error Handling**:
   - If channel linking fails during registration, log error and handle gracefully
   - Provide admin tools to manually fix channel-user relationships if needed

## Related Files

- `backend/src/plugins/phone-auth.service.ts` - Registration and login logic
- `backend/src/plugins/phone-auth.resolver.ts` - GraphQL resolvers
- `backend/src/plugins/channel-settings.service.ts` - Channel management
- Channel custom fields schema (to be updated)

## Migration Path

1. Add channel validation status custom field
2. Update registration to set status and verify linking
3. Add admin endpoints for status updates
4. Update frontend to display status
5. Remove any blocking checks based on status (already done for authorization status)

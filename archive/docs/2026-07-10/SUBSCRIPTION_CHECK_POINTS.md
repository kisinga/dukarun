# Subscription Check Points

This document outlines where subscription status checks occur in the system, enabling rate limiting control and understanding of subscription enforcement points.

## Backend Check Points

### 1. SubscriptionGuard

**Location**: `backend/src/plugins/subscriptions/subscription.guard.ts`

**When**: Every GraphQL mutation (not queries)

**Rate**: Per-mutation (no caching)

**Action**: 
- Blocks mutation if `canPerformAction === false`
- Allows all queries regardless of subscription status
- Exceptions: Subscription-related mutations always allowed (even if expired)

**Allowed Mutations** (even when expired):
- `initiateSubscriptionPurchase`
- `verifySubscriptionPayment`
- `cancelSubscription`
- `updateChannelSettings` (for subscription settings)

**Implementation**: Uses `SubscriptionService.checkSubscriptionStatus()` which queries channel customFields.

**Performance**: No caching - each mutation triggers a database query. Consider adding caching if this becomes a bottleneck.

---

### 2. Manual Checks

**Location**: `SubscriptionService.checkSubscriptionStatus()`

**When**: Called explicitly by services/components

**Rate**: As needed (can be cached on frontend)

**Usage Examples**:
- Dashboard layout checks subscription status on load
- Settings page displays subscription information
- Payment flow verifies status before/after payment

---

## Frontend Check Points

### 1. SubscriptionService.checkSubscriptionStatus()

**Location**: `frontend/src/app/core/services/subscription.service.ts`

**When**: 
- On dashboard layout load (for trial notification)
- On channel switch
- On settings page load
- After payment completion

**Rate**: Cached for 5 minutes (TTL: `CACHE_TTL_MS = 5 * 60 * 1000`)

**Cache Invalidation**:
- After successful payment
- Manual refresh (network-only fetchPolicy)

**Implementation**: Uses GraphQL query `CHECK_SUBSCRIPTION_STATUS` with `fetchPolicy: 'network-only'` but implements client-side caching.

---

### 2. Trial Notification Check

**Location**: `frontend/src/app/dashboard/layout/dashboard-layout.component.ts`

**When**: On dashboard layout `ngOnInit`

**Rate**: Once per session (cached in subscription service)

**Action**: 
- Checks if user is in trial
- Injects trial notification into notification list if not already present
- Notification resets on page refresh (no backend persistence for synthetic notification)

---

## Login/Auth Check Points

**Current State**: Login does NOT check subscription status

- Only checks channel status (UNAPPROVED/APPROVED/DISABLED/BANNED)
- Subscription checks happen at mutation time (via `SubscriptionGuard`)

**Rationale**: 
- Subscription status is not a login blocker
- Users can log in to view data even if expired (read-only mode)
- Subscription enforcement happens at action time, not authentication time

**Recommendation**: 
- Add optional subscription check on login for informational purposes (non-blocking)
- Could display a banner or notification about subscription status
- Should not block login flow

---

## Early Tester Support

**Behavior**: Blank expiry dates (`trialEndsAt` or `subscriptionExpiresAt` is null/undefined) indicate early tester status.

**How it's set**: Manually via Vendure backend/admin interface (not automatic during registration).

**Backend Handling**:
- `checkSubscriptionStatus()` returns `isEarlyTester: true` when expiry dates are missing
- Allows full access indefinitely
- No expiry date means no expiration checks

**Frontend Display**:
- Trial notification shows "Early Tester Program" message
- No days remaining count displayed
- Upgrade option still available

**Documentation**: This behavior is intentional and documented to avoid "magic" behavior.

---

## Rate Limiting Considerations

### High-Frequency Check Points

1. **SubscriptionGuard** - Every mutation
   - **Impact**: Database query per mutation
   - **Mitigation**: Consider adding short-term cache (30-60 seconds) if needed

2. **Frontend Status Check** - On dashboard load, channel switch
   - **Impact**: GraphQL query
   - **Mitigation**: 5-minute client-side cache already implemented

### Low-Frequency Check Points

1. **Trial Notification Check** - Once per dashboard session
2. **Settings Page Load** - User-initiated
3. **After Payment** - One-time after payment completion

---

## Future Optimizations

1. **Backend Caching**: Add Redis or in-memory cache for subscription status (30-60s TTL)
2. **Subscription Status in JWT**: Include subscription status in auth token to reduce queries
3. **WebSocket Updates**: Push subscription status changes to frontend in real-time
4. **Batch Checks**: If multiple mutations in same request, cache status for request duration


# Subscription Expiry Notifications

This document describes the behavior of subscription expiry and expiring-soon notifications. The logic lives in `SubscriptionExpirySubscriber` and related services.

## Overview

The expiry checker runs daily (worker process only). It finds channels with trial or active subscriptions, checks their expiry dates, and may emit events that lead to in-app notifications. Stop conditions prevent spam.

## Notification Types

| Type           | When                          | Title                    |
|----------------|-------------------------------|--------------------------|
| `expiring_soon`| 7, 3, or 1 days before expiry | Subscription Expiring Soon |
| `expired`      | After expiry date passes      | Subscription Expired     |
| `renewed`      | After successful payment      | Subscription Renewed     |

## Stop Conditions (No Duplicate Spam)

### 1. Preference check (before any emit)

Before emitting subscription expiry events, we check whether **any** channel admin has in-app PAYMENT notifications enabled.

- **If at least one admin has them enabled:** Continue with normal flow.
- **If no admin has them enabled:**
  - For **expiring_soon:** Skip emitting entirely.
  - For **expired:** Use the one-time bypass (see below).

### 2. Expired reminders — 7-day throttle

When admins have PAYMENT notifications enabled:

- Emit `expired` only if no reminder was sent in the last 7 days.
- After emitting, update `subscriptionExpiredReminderSentAt` on the channel.
- `SubscriptionService.shouldSendExpiredReminder()` enforces this.

### 3. Expired — one-time bypass (notifications disabled)

When **no** admin has PAYMENT notifications enabled and the subscription is expired:

- Send **exactly one** in-app notification to the first channel admin.
- Bypass the usual preference check for this single notification.
- Mark `subscriptionExpiredReminderSentAt` so we never send again for this expiry.
- Rationale: Expiry is critical; one notification is acceptable even if they opted out of routine reminders.

### 4. Expiring soon — once per threshold

- Emit `expiring_soon` only when `daysRemaining` is 1, 3, or 7.
- Use **notification history** to infer what we’ve already sent.
- Query the notification table for recent "Subscription Expiring Soon" PAYMENT notifications for this channel.
- Take the **minimum** `daysRemaining` stored in those notifications.
- Emit only if `current daysRemaining < that minimum` (or no such notifications exist).
- Example: Sent at 7 days → min=7; at 3 days we emit (3<7); sent at 3 → min=3; at 1 we emit (1<3). Never send twice for the same threshold.

No extra channel fields or migrations are used for expiring_soon; the notification table is the source of truth.

## Data Used

| Source                      | Purpose                                              |
|-----------------------------|------------------------------------------------------|
| Channel `subscriptionExpiredReminderSentAt` | Throttle expired reminders; mark one-time bypass sent |
| Notification table (PAYMENT, title "Subscription Expiring Soon") | Infer last expiring-soon threshold          |
| User `notificationPreferences.inApp.PAYMENT` | Decide whether to emit and use preference bypass     |

## Flow Summary

```
For each trial/active channel with expiry date:
  hasPrefsEnabled = any admin has inApp.PAYMENT !== false

  if expired:
    if hasPrefsEnabled:
      if shouldSendExpiredReminder (7-day throttle): emit event, mark sent
    else:
      if !hasEverSentExpiredReminder: send one notification to first admin, mark sent

  if expiring soon (1, 3, or 7 days):
    if !hasPrefsEnabled: skip
    lastThreshold = min(daysRemaining) from recent expiring_soon notifications
    if lastThreshold null or daysRemaining < lastThreshold: emit event
```

## Related Code

- `SubscriptionExpirySubscriber` — daily check, emits events, handles one-time bypass
- `NotificationSubscriber.handleSubscription` — creates notifications from events (respects preferences except for one-time bypass, which bypasses it)
- `NotificationService.hasAnyAdminWithPaymentNotificationsEnabled`
- `NotificationService.getLastExpiringSoonThreshold`
- `SubscriptionService.shouldSendExpiredReminder`, `markExpiredReminderSent`, `hasEverSentExpiredReminder`

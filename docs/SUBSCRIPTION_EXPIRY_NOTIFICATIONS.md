# Subscription Expiry Notifications

This document describes the behavior of subscription expiry and expiring-soon notifications. The logic lives in `SubscriptionExpirySubscriber` and related services.

## Overview

The expiry checker runs daily (worker process only). It finds channels with trial or active subscriptions, checks their expiry dates, and may emit events that lead to in-app notifications. Stop conditions prevent spam.

## Notification Types

| Type           | When                          | Title                    |
|----------------|-------------------------------|--------------------------|
| `expiring_soon`| 7, 3, or 1 days before expiry | Subscription Expiring Soon |
| `expired`      | Once, when expiry date passes | Subscription Expired     |
| `renewed`      | After successful payment      | Subscription Renewed     |

## Stop Conditions (No Duplicate Spam)

### 1. Expired — one-time only, never repeats

When a subscription expires:

- Send **exactly one** `expired` event the first time the expiry is detected.
- After emitting, update `subscriptionExpiredReminderSentAt` on the channel.
- On subsequent checks, `hasEverSentExpiredReminder()` returns true and the channel is skipped.
- **No reminders are ever sent after the subscription has expired.** The single notification informs the admin; no nagging.
- The event flows through `NotificationSubscriber.handleSubscription` which respects user notification preferences via `createNotificationIfEnabled`.

### 2. Expiring soon — once per threshold

- Emit `expiring_soon` only when `daysRemaining` is 1, 3, or 7.
- Use **notification history** to infer what we've already sent.
- Query the notification table for recent "Subscription Expiring Soon" PAYMENT notifications for this channel.
- Take the **minimum** `daysRemaining` stored in those notifications.
- Emit only if `current daysRemaining < that minimum` (or no such notifications exist).
- Example: Sent at 7 days → min=7; at 3 days we emit (3<7); sent at 3 → min=3; at 1 we emit (1<3). Never send twice for the same threshold.
- Only emitted if at least one admin has in-app PAYMENT notifications enabled.

No extra channel fields or migrations are used for expiring_soon; the notification table is the source of truth.

## Data Used

| Source                      | Purpose                                              |
|-----------------------------|------------------------------------------------------|
| Channel `subscriptionExpiredReminderSentAt` | Track whether the one-time expired notification was sent |
| Notification table (PAYMENT, title "Subscription Expiring Soon") | Infer last expiring-soon threshold          |
| User `notificationPreferences.inApp.PAYMENT` | Decide whether to emit expiring_soon events     |

## Flow Summary

```
For each trial/active channel with expiry date:

  if expired:
    if hasEverSentExpiredReminder: skip (already notified once)
    else: emit expired event, mark sent

  if expiring soon (1, 3, or 7 days):
    if no admin has inApp.PAYMENT enabled: skip
    lastThreshold = min(daysRemaining) from recent expiring_soon notifications
    if lastThreshold null or daysRemaining < lastThreshold: emit event
```

## Related Code

- `SubscriptionExpirySubscriber` — daily check, emits events
- `NotificationSubscriber.handleSubscription` — creates notifications from events (respects preferences)
- `NotificationService.hasAnyAdminWithPaymentNotificationsEnabled`
- `NotificationService.getLastExpiringSoonThreshold`
- `SubscriptionService.markExpiredReminderSent`, `hasEverSentExpiredReminder`

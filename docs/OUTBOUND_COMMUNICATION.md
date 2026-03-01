# Outbound communication

This document describes when and how the server initiates communication (in-app, SMS, email) to customers, channel admins, and platform admins.

## Flow

1. **Trigger**: Something happens (e.g. balance changed, shift closed, order paid, company registered). The trigger is represented by a **trigger key** (e.g. `balance_changed`, `shift_closed`).
2. **Single path**: All triggers go through `OutboundDeliveryService.deliver(ctx, triggerKey, payload)`.
3. **Config**: For each trigger key, `OUTBOUND_CONFIG` (in code) defines audience and channels (in-app, SMS, email).
4. **Content**: Message content is rendered from code-based templates in `outbound.render.ts`.
5. **Delivery**: The deliver function calls existing `NotificationService` (in-app) and `CommunicationService` (SMS/email). No new transport layer.

## When (triggers)

| Trigger key | Cause |
|-------------|--------|
| order_payment_settled, order_fulfilled, order_cancelled | Order state transition (event) |
| subscription_expiring_soon, subscription_expired, subscription_renewed | Subscription alert (event) |
| ml_status | ML training/extraction status (event) |
| admin_action | Admin/user created or updated (event) |
| customer_created, credit_approved, repayment_deadline | Customer lifecycle (event) |
| balance_changed_admin | Customer balance changed – in-app to channel admins (event) |
| balance_changed | Customer balance changed – SMS to customer (event) |
| channel_approved, channel_status_changed | Channel status (event) |
| stock_low | Low stock alert (event) |
| company_registered | New company registration (event) |
| approval_created, approval_resolved | Approval request created or resolved (event) |
| shift_opened, shift_closed | Cashier session opened or closed (event) |

## Who (audience)

- **channel_admins**: Channel users with admin role (and super admins). Resolved via `ChannelUserService`.
- **customer**: The customer entity; recipient phone/email from Customer record. Payload must include `customerId`.
- **platform_admin**: Platform administrators. Recipients from env: `ADMIN_NOTIFICATION_EMAIL`, `ADMIN_NOTIFICATION_PHONE`.

Optional payload field `targetUserIds` overrides in-app recipients (e.g. approval_resolved notifies only the requester).

## How (channels)

- **in-app**: Stored in `notification` table; shown in dashboard. Respects user preferences per `NotificationType`.
- **SMS**: Sent via `CommunicationService.send` (channel `sms`). Subject to env `COMMUNICATION_CHANNELS` and per-tier limits when `channelId` is set. SMS category (e.g. `ACCOUNT_NOTIFICATION`, `ADMIN`) is set in outbound config.
- **Email**: Sent via `CommunicationService.send` (channel `email`). Currently only company_registered uses email; generic transactional email can be extended later.

Channel availability: `COMMUNICATION_CHANNELS` (env) enables SMS/email globally. `ADMIN_NOTIFICATION_CHANNELS` controls platform admin delivery (email,sms).

## Where it’s configured

- **Trigger → audience + channels**: `backend/src/services/notifications/outbound.config.ts` (`OUTBOUND_CONFIG`).
- **Message content**: `backend/src/services/notifications/outbound.render.ts` (trigger key → render function).
- **Delivery entry point**: `backend/src/services/notifications/outbound-delivery.service.ts` (`OutboundDeliveryService.deliver`).
- **Event → trigger mapping**: `backend/src/infrastructure/events/notification.subscriber.ts` (each event handler maps to trigger key(s) + payload and calls `deliver`).

## Adding a new trigger

1. Add a row to `OUTBOUND_CONFIG` (audience, channels, inAppType, optional smsCategory).
2. Add a renderer in `outbound.render.ts` for the trigger key.
3. Publish an event (or call `deliver` directly); ensure the subscriber (or caller) maps to your trigger key and passes the required payload (e.g. `channelId`, `customerId` for customer audience).

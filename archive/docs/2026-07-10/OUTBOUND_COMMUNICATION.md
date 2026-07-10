# Outbound communication

This document describes when and how the server initiates communication (in-app, WhatsApp, SMS, email) to customers, channel admins, and platform admins.

## Flow

1. **Trigger**: Something happens (e.g. balance changed, shift closed, order paid, company registered). The trigger is represented by a **trigger key** (e.g. `balance_changed`, `shift_closed`).
2. **Single path**: All triggers go through `OutboundDeliveryService.deliver(ctx, triggerKey, payload)`.
3. **Config**: For each trigger key, `OUTBOUND_CONFIG` (in code) defines audience and channels (in-app, WhatsApp, SMS, email).
4. **Gating**: Channel toggles in Global Settings decide whether SMS, email, or WhatsApp are enabled platform-wide. Customer notifications also respect a global kill switch and a per-customer preference.
5. **Content**: Message content is rendered from code-based templates in `outbound.render.ts`.
6. **Delivery**: The deliver function calls existing `NotificationService` (in-app) and `CommunicationService` (WhatsApp/SMS/email).

## When (triggers)

| Trigger key | Cause |
|-------------|--------|
| order_payment_settled, order_fulfilled, order_cancelled | Order state transition (event) |
| subscription_expiring_soon, subscription_expired, subscription_renewed | Subscription alert (event) |
| admin_action | Admin/user created or updated (event) |
| customer_created, credit_approved, repayment_deadline | Customer lifecycle (event) |
| balance_changed_admin | Customer balance changed – in-app to channel admins (event) |
| balance_changed | Customer balance changed – WhatsApp to customer (event) |
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
- **WhatsApp**: Sent via `CommunicationService.send` (channel `whatsapp`) through the OpenWA Gateway (`POST /api/sessions/:session/messages/send-text`). Used for notification messages only, not OTP.
- **SMS**: Sent via `CommunicationService.send` (channel `sms`). Subject to platform channel toggles and per-tier limits when `channelId` is set. SMS category (e.g. `ACCOUNT_NOTIFICATION`, `ADMIN`) is set in outbound config.
- **Email**: Sent via `CommunicationService.send` (channel `email`). Currently only company_registered uses email; generic transactional email can be extended later.

### Channel availability

- Platform toggles in **Global Settings** enable or disable SMS, email, and WhatsApp globally. Super-admins change these from the Platform Data UI without redeploying.
- `ADMIN_NOTIFICATION_CHANNELS` (env) controls platform admin delivery (email, sms).
- Customer notifications require both the global customer notification switch and the individual customer preference to be enabled.

### OpenWA configuration

- `OPENWA_BASE_URL` – OpenWA Gateway base URL, e.g. `http://openwa:2785`.
- `OPENWA_API_KEY` – sent as the `X-API-Key` header.
- `OPENWA_SESSION` – OpenWA session id, defaults to `default`.

### Test sends

Super-admins can send test WhatsApp messages from Platform Data. Test sends bypass the channel gate so WhatsApp can be verified before it is enabled for live traffic.

### Templates

Recent triggers use render keys so test messages match real copy:

- `shift_opened`
- `shift_closed`
- `balance_changed`

### Shift alerts

`shift_opened` and `shift_closed` are sent to financial admins via WhatsApp when the channel toggle is on. These alerts notify the finance team about cashier session changes.

### Customer notifications

Customers can receive WhatsApp or SMS updates when configured. The main customer trigger is `balance_changed`, which sends a notification when a customer's outstanding balance changes. Customer delivery requires:

- the global customer notification switch to be on
- the individual customer preference to allow notifications
- WhatsApp or SMS to be enabled platform-wide

## Where it’s configured

- **Trigger → audience + channels**: `backend/src/services/notifications/outbound.config.ts` (`OUTBOUND_CONFIG`).
- **Message content**: `backend/src/services/notifications/outbound.render.ts` (trigger key → render function).
- **Delivery entry point**: `backend/src/services/notifications/outbound-delivery.service.ts` (`OutboundDeliveryService.deliver`).
- **Event → trigger mapping**: `backend/src/infrastructure/events/notification.subscriber.ts` (each event handler maps to trigger key(s) + payload and calls `deliver`).

## Adding a new trigger

1. Add a row to `OUTBOUND_CONFIG` (audience, channels, inAppType, optional smsCategory).
2. Add a renderer in `outbound.render.ts` for the trigger key.
3. Publish an event (or call `deliver` directly); ensure the subscriber (or caller) maps to your trigger key and passes the required payload (e.g. `channelId`, `customerId` for customer audience).

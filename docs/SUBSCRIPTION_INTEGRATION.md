# Paystack Subscription Integration

## Overview

This document describes the Paystack subscription and payment flow integration for Dukarun. The system supports trial periods, subscription tiers, STK push payments, and read-only mode for expired subscriptions.

## Architecture

### Subscription Data Storage

- **Subscription data**: Stored on Channel entity via custom fields (each channel = one customer company)
- **Subscription tiers**: Stored as Vendure custom entity (`SubscriptionTier`)
- **Trial period**: 30 days from channel creation with full features
- **Payment flow**: Paystack STK push with phone number pre-filled from Administrator profile
- **Access control**: Read-only mode when subscription expires (can view but not create/edit)

### Key Components

#### Backend

1. **SubscriptionTier Entity** (`backend/src/plugins/subscription.entity.ts`)

   - Stores subscription tier definitions
   - Fields: code, name, description, priceMonthly, priceYearly, features, isActive

2. **Channel Custom Fields**

   - `subscriptionTierId` - Current tier
   - `subscriptionStatus` - "trial" | "active" | "expired" | "cancelled"
   - `trialEndsAt` - Trial end date
   - `subscriptionStartedAt` - When paid subscription started
   - `subscriptionExpiresAt` - Next billing date
   - `billingCycle` - "monthly" | "yearly"
   - `paystackCustomerCode` - Paystack customer reference
   - `paystackSubscriptionCode` - Paystack subscription reference
   - `lastPaymentDate` - Last payment date
   - `lastPaymentAmount` - Last payment amount in cents

3. **PaystackService** (`backend/src/services/payments/paystack.service.ts`)

   - Handles Paystack API integration
   - Methods: initializeTransaction, chargeMobile (STK push), verifyTransaction, createCustomer, etc.

4. **SubscriptionService** (`backend/src/plugins/subscription.service.ts`)

   - Business logic for subscriptions
   - Methods: checkSubscriptionStatus, initiatePurchase, processSuccessfulPayment, etc.

5. **SubscriptionWebhookController** (`backend/src/plugins/subscription-webhook.controller.ts`)

   - Handles Paystack webhook callbacks
   - Endpoint: `POST /webhooks/paystack`
   - Events: charge.success, subscription.create, subscription.disable, subscription.not_renew

6. **SubscriptionGuard** (`backend/src/plugins/subscription.guard.ts`)
   - Enforces read-only mode for expired subscriptions
   - Blocks mutations when subscription is expired
   - Allows subscription-related mutations even if expired

7. **SubscriptionExpirySubscriber** (`backend/src/plugins/subscriptions/subscription-expiry.subscriber.ts`)
   - Runs daily in worker process; checks for expiring subscriptions
   - Emits events that trigger in-app notifications (expired, expiring soon)
   - See [SUBSCRIPTION_EXPIRY_NOTIFICATIONS.md](SUBSCRIPTION_EXPIRY_NOTIFICATIONS.md) for full behavior and stop conditions

#### Frontend

1. **SubscriptionService** (`frontend/src/app/core/services/subscription.service.ts`)

   - Angular service for subscription management
   - Provides signals for subscription status, tiers, etc.

2. **SubscriptionStatusComponent** (`frontend/src/app/dashboard/pages/settings/components/subscription-status.component.ts`)

   - Displays subscription status and trial information
   - Shows renewal options

3. **PaymentModalComponent** (`frontend/src/app/dashboard/pages/settings/components/payment-modal.component.ts`)

   - Modal for subscription purchase
   - Handles billing cycle selection and payment initiation

4. **SubscriptionInterceptor** (`frontend/src/app/core/interceptors/subscription.interceptor.ts`)
   - HTTP interceptor for handling subscription errors
   - Shows toast notifications for expired subscriptions

## Setup Instructions

### 1. Environment Variables

**Paystack Environment Variables:** See [Paystack Environment Variables](../INFRASTRUCTURE.md#payment-provider-configuration-paystack) in INFRASTRUCTURE.md for complete setup instructions.

Required variables:

- `PAYSTACK_SECRET_KEY` - Paystack secret key
- `PAYSTACK_PUBLIC_KEY` - Paystack public key
- `PAYSTACK_WEBHOOK_SECRET` - Webhook secret (recommended)
- `SUBSCRIPTION_TRIAL_DAYS` - Trial period duration in days (default: 30)

### 2. Paystack Configuration

**Environment Variables**: See [Paystack Environment Variables](../INFRASTRUCTURE.md#payment-provider-configuration-paystack) in INFRASTRUCTURE.md for complete setup.

1. **Get API Keys**

   - Log in to Paystack dashboard
   - Navigate to Settings → API Keys & Webhooks
   - Copy Secret Key and Public Key
   - Add to `.env` as `PAYSTACK_SECRET_KEY` and `PAYSTACK_PUBLIC_KEY`

2. **Configure Webhook**

   - In Paystack dashboard, go to Settings → Webhooks
   - Add webhook URL: `https://your-domain.com/webhooks/paystack`
   - **Important**: Webhook URL must be publicly accessible
   - Select events: `charge.success`, `subscription.create`, `subscription.disable`, `subscription.not_renew`
   - Copy webhook secret and add to `.env` as `PAYSTACK_WEBHOOK_SECRET`

3. **Test Mode**
   - Use test keys for development: `sk_test_xxx` and `pk_test_xxx`
   - Use ngrok for local webhook testing: `ngrok http 3000`
   - Update webhook URL in Paystack to ngrok URL: `https://your-ngrok-url.ngrok.io/webhooks/paystack`

### 3. Database Migration

Run the migration to create subscription tables and fields:

```bash
cd backend
npm run migration:run
```

This will:

- Create `subscription_tier` table
- Add subscription custom fields to `channel` table
- Set existing channels to trial status

**Note**: Subscription tiers must be created manually using the `createSubscriptionTier` GraphQL mutation. See [subscription_tiers.gql.md](./subscription_tiers.gql.md) for example mutations.

### 4. Run Code Generation (Frontend)

After adding GraphQL operations, regenerate types:

```bash
cd frontend
npm run codegen
```

## Paystack Integration

### Overview

- **PaystackService Location**: `backend/src/services/payments/paystack.service.ts`
- **API Base URL**: `https://api.paystack.co`
- **Authentication**: Bearer token with secret key
- **Currency**: KES (Kenyan Shillings)

### Environment Variables

See [Paystack Environment Variables](../INFRASTRUCTURE.md#payment-provider-configuration-paystack) in INFRASTRUCTURE.md for complete setup.

Required variables:

- `PAYSTACK_SECRET_KEY` - Paystack secret key
- `PAYSTACK_PUBLIC_KEY` - Paystack public key
- `PAYSTACK_WEBHOOK_SECRET` - Webhook secret (recommended for security)

### Webhook Configuration

- **Endpoint**: `POST /webhooks/paystack`
- **Controller**: `SubscriptionWebhookController` at `backend/src/plugins/subscriptions/subscription-webhook.controller.ts`
- **Required Events**:
  - `charge.success` - Payment completed (processes subscription activation)
  - `subscription.create` - Subscription created (logs only)
  - `subscription.disable` - Subscription disabled (logs only)
  - `subscription.not_renew` - Subscription won't renew (logs only)
  - `subscription.expiring_cards` - Card expiring (logs only)
- **Webhook URL Format**: `https://your-domain.com/webhooks/paystack`
- **Signature Verification**: HMAC SHA512 using `PAYSTACK_WEBHOOK_SECRET`

**Setup Steps:**

1. Paystack dashboard → Settings → Webhooks
2. Add webhook URL
3. Select required events
4. Copy webhook secret to `PAYSTACK_WEBHOOK_SECRET`

**Security Note**: Webhook verification is disabled if `PAYSTACK_WEBHOOK_SECRET` is not set (logs warning).

### STK Push Payment Flow

- **Method**: `chargeMobile()` in PaystackService
- **Paystack API Endpoint**: `POST /charge`
- **Required Parameters**:
  - `amount` (in kobo/cents, converted from KES: `amount * 100`)
  - `phone` (E.164 format: `+254712345678`)
  - `email` (or placeholder: `{phone}@placeholder.dukarun.com` if not provided)
  - `reference` (format: `SUB-{channelId}-{timestamp}`)
  - `currency` (`KES`)
  - `metadata` (see Metadata Requirements below)
- **Response**: Returns `reference` for tracking
- **User Experience**: Customer receives STK push prompt on phone

### Payment Link Fallback

- **Triggered When**: STK push fails or unavailable
- **Method**: `initializeTransaction()` in PaystackService
- **Paystack API Endpoint**: `POST /transaction/initialize`
- **Returns**: `authorization_url` for redirect
- **User Experience**: Customer redirected to Paystack payment page

### Metadata Requirements

When calling `chargeMobile()` or `initializeTransaction()`, metadata must include:

- `channelId` (string, required) - Channel ID for subscription
- `tierId` (string, required) - Subscription tier ID
- `billingCycle` (string, required) - "monthly" or "yearly"
- `type` (string, required) - Must be "subscription" for webhook filtering

**Optional Fields:**

- `customerCode` - Paystack customer code
- `subscriptionCode` - Paystack subscription code

### Webhook Processing Flow

1. Paystack sends webhook to `/webhooks/paystack`
2. Signature verified using `PAYSTACK_WEBHOOK_SECRET` (HMAC SHA512)
3. Event type extracted from `body.event`
4. For `charge.success`:
   - Extract `channelId` and `type` from `data.metadata`
   - Filter: Only process if `type === 'subscription'`
   - Verify transaction with Paystack API (`verifyTransaction()`)
   - If verified, call `processSuccessfulPayment()`
   - Updates channel subscription status and expiry
5. Response: Always return `200 OK` to prevent Paystack retries
6. Error Handling: Log errors but return `200 OK` to prevent retries

### Customer Management

- **Method**: `createCustomer()` in PaystackService
- **Paystack API Endpoint**: `POST /customer`
- **Purpose**: Creates Paystack customer record
- **Stores**: `customer_code` in channel custom field `paystackCustomerCode`
- **Reuse**: If channel already has `paystackCustomerCode`, skips creation
- **Parameters**: email, firstName, lastName, phone, metadata

### Transaction Verification

- **Method**: `verifyTransaction()` in PaystackService
- **Paystack API Endpoint**: `GET /transaction/verify/{reference}`
- **Usage**: Called in webhook handler before processing payment
- **Purpose**: Ensures transaction status is "success" before activating subscription
- **Returns**: Full transaction details including amount, customer, status

## Usage

### Trial Period

- New channels automatically start with a 30-day trial
- Trial status is set during channel creation
- `trialEndsAt` is calculated as `channelCreatedAt + 30 days`
- Full features are available during trial

### Subscription Purchase Flow

1. User initiates purchase from subscription status component
2. Selects billing cycle (monthly/yearly)
3. Provides phone number (pre-filled from profile)
4. Payment initiated via Paystack STK push
5. User receives payment prompt on phone
6. Payment verification via polling or webhook
7. Channel subscription status updated to "active"

### Webhook Processing

When Paystack sends webhook events:

1. Webhook signature is verified
2. Event type is determined
3. Channel subscription fields are updated
4. Response sent back to Paystack (200 OK)

### Read-Only Mode

When subscription expires:

- All queries are allowed (read access)
- Mutations are blocked (except subscription-related)
- UI shows expired subscription banner
- User can renew subscription to regain full access

## Testing

### Local Testing with Paystack Test Mode

1. **Set up test environment**:

   - Use Paystack test keys in `.env`: `sk_test_xxx` and `pk_test_xxx`
   - Set `PAYSTACK_WEBHOOK_SECRET` to test webhook secret

2. **Set up ngrok for webhook testing**:

   ```bash
   ngrok http 3000
   ```

   - Copy the ngrok HTTPS URL (e.g., `https://abc123.ngrok.io`)
   - Update Paystack webhook URL to: `https://abc123.ngrok.io/webhooks/paystack`

3. **Test payment flow**:
   - Use test phone numbers (see below)
   - Monitor ngrok webhook requests at `http://localhost:4040`
   - Check backend logs for webhook processing

### Test Phone Numbers (Paystack)

- **Success**: `+254700000000` - Payment succeeds immediately
- **Failure**: `+254700000001` - Payment fails immediately
- **Timeout**: `+254700000002` - Payment times out

### Webhook Testing Checklist

- [ ] Webhook URL is publicly accessible
- [ ] Webhook secret matches in `.env` and Paystack dashboard
- [ ] All required events are subscribed in Paystack
- [ ] Webhook endpoint returns 200 OK
- [ ] Signature verification is working (check logs)
- [ ] Transaction verification succeeds
- [ ] Channel subscription status updates correctly

### Manual Testing

1. Create a new channel → Should start in trial
2. Check subscription status → Should show trial active
3. Initiate purchase → Should trigger STK push
4. Complete payment → Should update subscription status
5. Let subscription expire → Should enforce read-only mode

## Troubleshooting

### Webhook Not Receiving Events

- **Check webhook URL**: Must be publicly accessible (use ngrok for local testing)
- **Verify webhook secret**: Must match in `.env` (`PAYSTACK_WEBHOOK_SECRET`) and Paystack dashboard
- **Check Paystack webhook logs**: Paystack dashboard → Settings → Webhooks → [Your webhook] → Logs
- **Ensure webhook endpoint returns 200 OK**: Check backend logs for webhook responses
- **Verify signature verification**: Check backend logs for "Invalid webhook signature" warnings
- **Check event subscriptions**: Ensure all required events are selected in Paystack dashboard

### Webhook Signature Verification Issues

- **Missing webhook secret**: If `PAYSTACK_WEBHOOK_SECRET` is not set, verification is disabled (security risk)
- **Secret mismatch**: Verify secret in `.env` matches Paystack dashboard
- **Raw body required**: Ensure webhook controller receives raw body for signature verification

### Payment Not Processing

- **Verify Paystack API keys**: Check `PAYSTACK_SECRET_KEY` and `PAYSTACK_PUBLIC_KEY` in `.env`
- **Check phone number format**: Must be E.164 format: `+254712345678`
- **Verify transaction reference**: Must be unique (format: `SUB-{channelId}-{timestamp}`)
- **Check Paystack transaction logs**: Paystack dashboard → Transactions
- **STK push failures**: Check if fallback to payment link is working
- **Metadata requirements**: Ensure all required metadata fields are included (channelId, tierId, billingCycle, type)

### STK Push Failure

- **Check phone number**: Must be valid Kenyan mobile number in E.164 format
- **Verify amount**: Must be in KES (converted to kobo/cents)
- **Check Paystack logs**: Paystack dashboard → Transactions → [Transaction] → Logs
- **Fallback mechanism**: System should automatically fall back to payment link
- **Network issues**: Check if customer's mobile network is accessible

### Subscription Status Not Updating

- **Check database migration**: Ensure migration ran successfully
- **Verify channel custom fields**: Check that subscription fields exist on channel
- **Check subscription service logs**: Look for errors in `processSuccessfulPayment()`
- **Verify webhook processing**: Check webhook handler logs for successful processing
- **Transaction verification**: Ensure `verifyTransaction()` succeeds before processing
- **Metadata filtering**: Verify `type === 'subscription'` in webhook metadata

### Webhook Event Filtering

- **Check metadata**: Ensure `type: 'subscription'` is in metadata
- **Verify channelId**: Must be present in metadata
- **Check webhook logs**: Verify events are being received but filtered out
- **Non-subscription charges**: System logs "Skipping non-subscription charge" for other payment types

### Read-Only Mode Not Enforcing

- Verify SubscriptionGuard is registered
- Check subscription status check logic
- Verify mutations are using guard
- Check frontend interceptor is registered

## Future Enhancements

### Multi-Tier Support

The architecture supports multiple subscription tiers:

1. Add new tiers via database:

   ```sql
   INSERT INTO subscription_tier (code, name, priceMonthly, priceYearly, features, isActive)
   VALUES ('pro-tier', 'Pro Plan', 10000, 100000, '{"features": [...]}', true);
   ```

2. Tiers are automatically available in frontend

### Grace Period

Consider adding a grace period before strict read-only enforcement:

- Add `gracePeriodEndsAt` field to channel
- Allow limited operations during grace period
- Full read-only after grace period expires

### Subscription Management

Future enhancements:

- Subscription upgrade/downgrade
- Prorated billing
- Payment method management
- Invoice generation
- Subscription analytics

## Security Considerations

1. **Webhook Signature Verification**

   - Always verify webhook signatures
   - Never trust webhook data without verification

2. **API Key Security**

   - Store keys in environment variables
   - Never commit keys to version control
   - Use different keys for test/production

3. **Payment Data**
   - Never store sensitive payment data
   - Use Paystack customer codes for reference
   - Log payment events for audit trail

## Related Documentation

- [Customer Provisioning Guide](./CUSTOMER_PROVISIONING.md)
- [Vendure Configuration](./VENDURE.md)
- [Architecture Overview](./ARCHITECTURE.md)

## Orders, Checkout & Billing

This guide explains how Dukarun handles **sales, payments, and subscription billing** from a merchant’s point of view.

---

## What Problems This Solves

- Run a **fast, in-store POS checkout** without shipping configuration.
- Take **cash and M‑Pesa payments** cleanly, with proper accounting.
- Support **two-step cashier flows** where a salesperson and cashier are separate people.
- Enforce **price and credit rules** via permissions rather than manual policing.
- Manage your own **Dukarun subscription** (trial vs active vs expired).

---

## Key Capabilities (with Origins)

- **POS-style order flow** – Streamlined order workflow without shipping, tuned for walk-in customers.  
  **Origin:** Dukarun-Enhanced (custom order process on Vendure).

- **Walk-in and registered customers** – Support anonymous sales as well as named customers linked to credit and analytics.  
  **Origin:** Vendure Core + Dukarun-Enhanced mapping (walk-in customer).

- **Cash & M‑Pesa payments** – Support cash and mobile money as first-class payment methods, wired into ledger accounts.  
  **Origin:** Dukarun-Exclusive (payment handlers + ledger integration).

- **Price override controls** – Let only authorised staff override prices, with an audit trail and permission checks.  
  **Origin:** Dukarun-Exclusive (custom permission & POS UI).

- **Two-step cashier flow** – Salesperson sends orders to a cashier, who collects payment and completes the sale.  
  **Origin:** Dukarun-Exclusive.

- **Trial, subscription and read-only mode** – Trial and subscription state automatically control whether a business can keep transacting.  
  **Origin:** Dukarun-Exclusive (subscription plugin, Paystack integration).

---

## POS Order Flow (In-Store Sales)

### 1. Flow Overview

The typical in-store sale looks like this:

```text
1. Start a new sale
2. Add items to cart (barcode, label-photo AI, or search)
3. (Optional) Attach a customer for credit or better analytics
4. Choose payment method (Cash, M‑Pesa, etc.)
5. Confirm payment
6. Order is completed and stock is updated
```

There is **no shipping step**. The system has been configured so that:

- Orders do not require shipping methods.
- A minimal “address” is essentially the store location.

See `VENDURE.md` (“POS System Configuration”) for the technical details behind this.

**Origin:** Dukarun-Enhanced order process on Vendure.

---

### 2. Walk-in Customers vs Named Customers

Dukarun uses a **special walk-in customer** (e.g. `walkin@pos.local`) for anonymous sales, as described in `CUSTOMER_PROVISIONING.md`:

- **Walk-in sales**
  - Every anonymous sale is tied to this shared customer.
  - Ideal for high-volume markets where most customers are one-off.

- **Named customers**
  - For customers you want to assign credit to or track over time.
  - Created via the customer creation forms in the dashboard.

From a cashier’s perspective:

- They can either:
  - Complete the sale quickly under “walk-in”, or
  - Search/select a named customer when necessary (e.g. credit sale).

**Origin:** Vendure Core (customers) + Dukarun-Enhanced configuration and UX.

---

## Payment Methods

### 1. Cash Payment

**What it does:**  
Treats cash as a proper payment method with consistent accounting.

**Who uses it:**  
Almost every small business using Dukarun.

**Behaviour:**

- At checkout, the cashier selects **Cash**.
- The order’s payment state moves through Vendure’s payment lifecycle.
- In the ledger:
  - Cash account (e.g. `CASH_ON_HAND`) is increased.
  - Appropriate revenue accounts (e.g. `SALES`) are updated via posting policies.

**Origin:** Dukarun-Exclusive payment handler (`payment-handlers.ts`) on top of Vendure.

---

### 2. M‑Pesa Payment

**What it does:**  
Allows Dukarun to treat M‑Pesa receipts as a structured payment method.

**Behaviour:**

- At checkout, cashier selects **M‑Pesa**.
- Depending on your M‑Pesa setup (STK push vs manual confirmation), the system:
  - Records the payment in a **clearing account** (e.g. `CLEARING_MPESA`).
  - Optionally tracks transaction references.
- Later reconciliation can move money from clearing into bank accounts in the ledger.

**Origin:** Dukarun-Exclusive (custom payment handler + ledger mapping).

---

### 3. Other Payment Methods

The architecture allows additional payment types (card, bank transfer, etc.) to be configured as Vendure payment methods and mapped to suitable ledger accounts.

From a business point of view:

- Think of every payment method as a **separate bucket of money** with its own tracking.

---

## Price Overrides & Discounts

### 1. Why Control Price Changes?

In small businesses, it’s common to:

- Give discounts to regulars.
- Correct pricing mistakes on the fly.

Without controls, this can cause:

- Under-pricing and lost margin.
- Poor audit trails and suspicion of misuse.

---

### 2. How Dukarun Handles Price Overrides

Dukarun adds a custom permission `OverridePrice` (documented in `VENDURE.md` “Price Override Permissions”):

- Only roles with `OverridePrice` can edit the **line price** in the POS.
- Overrides are stored as custom fields, with reasons where necessary.

From the cashier’s perspective:

- If they do **not** have permission:
  - They cannot change line prices; they must call a supervisor.
- If they **do** have permission:
  - They see quick adjustment options (e.g. percentage discounts) and/or manual price input.

**Origin:** Dukarun-Exclusive permission and POS UI.

---

## Two-Step Cashier Flow

### 1. What It Is

The **two-step cashier flow** separates the role of:

- **Salesperson** – Adds items to a cart, then sends the order to a cashier.
- **Cashier** – Sees a queue of pending orders at a dedicated station, collects payment, completes orders.

This is ideal for:

- Busy markets with multiple people weighing/packing.
- Pharmacies or shops where a central cashier desk handles money.

---

### 2. How It Behaves (Per Location)

From `ARCHITECTURE.md` (“Cashier Flow - Location-Based Two-Step Payment”):

- Each stock location has custom fields:

  ```text
  cashierFlowEnabled: boolean
  cashierOpen: boolean
  ```

- On the **Sell** page:
  - When `cashierFlowEnabled = true` and `cashierOpen = true`, the POS shows a **“Send to Cashier”** button.
  - No customer is required for these orders.

- On the **Dashboard**:
  - A badge indicates “Cash Register Open” or “Cash Register Closed” depending on the toggles.

Backend order creation and a dedicated cashier UI are under active development; the current implementation covers:

- Location-level toggles.
- POS and dashboard UI for flow control.

**Origin:** Dukarun-Exclusive.

---

## Dukarun Subscription & Billing

This section is about **your subscription to Dukarun itself**, not your customers’ payments.

### 1. Trial Periods

Per `SUBSCRIPTION_INTEGRATION.md`:

- Each channel (business) gets a **platform-configured trial** on creation.
- Custom fields on the channel store:
  - `subscriptionStatus` (e.g. `trial`, `active`, `expired`, `cancelled`).
  - `trialEndsAt`, `subscriptionStartedAt`, `subscriptionExpiresAt`.

During trial:

- The business has full access to all features.
- Dukarun can surface banners or warnings as the end approaches.

**Origin:** Dukarun-Exclusive (subscription plugin).

---

### 2. Paystack Subscription Integration

Dukarun integrates with **Paystack** to handle subscription billing (see full details in `SUBSCRIPTION_INTEGRATION.md`):

- A subscription tier entity (`SubscriptionTier`) defines:
  - Code, name, description.
  - Monthly and yearly prices.
- Channel custom fields track:
  - Current tier and billing cycle.
  - Paystack customer/subscription codes.
  - Last payment date and amount.
- A backend subscription service and webhook controller:
  - Initiate purchases (including STK push flows).
  - Process Paystack webhooks to update subscription status.

From a business perspective:

- The **subscription status UI** in Dukarun shows:
  - Trial time remaining.
  - Current tier.
  - Payment options (monthly/yearly).
  - Renewal or upgrade paths.

**Origin:** Dukarun-Exclusive.

---

### 3. Read-Only Mode on Expiry

When a business’s subscription **expires**:

- Users can still log in and see historical data.
- All write operations (creating or editing products, orders, etc.) are blocked by the **subscription guard** and frontend interceptor.
- The UI clearly indicates that the account is in **read-only mode** and guides the user to renew.

This makes it safe to enforce billing without “locking merchants out of their own history”.

**Origin:** Dukarun-Exclusive.

---

## How to Use & Configure (Workflows)

### A. Taking a Standard Cash Sale

**Who:** Cashier.

1. On the **Sell** page, start a new sale.
2. Add items via:
   - Barcode scan, **or**
   - Label-photo shortcut (if configured), **or**
   - Search.
3. (Optional) Select a named customer.
4. Click **Checkout**.
5. Select **Cash** as the payment method.
6. Confirm payment.

Behind the scenes:

- An order is created and completed.
- Inventory for that location is decremented.
- Ledger entries are created (cash vs sales).

---

### B. Taking an M‑Pesa Sale

**Who:** Cashier.

1. Follow steps 1–4 above.
2. Select **M‑Pesa** as the payment method.
3. Depending on the implementation:
   - Enter the customer’s phone number (or use one from their profile).
   - Trigger an STK push via the Dukarun subscription/payment UI **or** mark as “paid” after confirming SMS.
4. Confirm once payment has been verified.

From a reporting perspective:

- M‑Pesa payments accumulate in a clearing or dedicated account.
- Later reconciliation aligns with bank statements or Paystack reports.

---

### C. Enabling the Two-Step Cashier Flow

**Who:** Owner, manager, or Dukarun provisioning team.

1. In the Vendure Admin UI, go to **Settings → Stock Locations**.
2. Edit the location you want to use a two-step flow.
3. In its custom fields (see `VENDURE_CUSTOM_FIELDS.md`):
   - Enable **cashierFlowEnabled**.
   - Use **cashierOpen** to indicate whether the cash register is currently open.
4. Save.

In the Dukarun dashboard:

- The Sell page will show “Send to Cashier” when the flow is enabled and open.
- The overview dashboard will reflect the cashier status.

---

### D. Managing Your Dukarun Subscription

**Who:** Business owner or admin.

1. Navigate to **Settings → Subscription** in the Dukarun dashboard.
2. Review:
   - Current plan and status.
   - Trial days remaining (if on trial).
   - Next billing date.
3. To subscribe or renew:
   - Choose a plan (monthly or yearly).
   - Input or confirm phone number.
   - Follow the Paystack flow (STK push or redirect).
4. After Paystack confirms payment:
   - The channel’s subscription fields are updated.
   - If previously read-only, full access is restored.

Internally, webhooks from Paystack are processed by Dukarun’s subscription service and recorded in the channel custom fields and ledger.

---

## Limitations & Notes

- **Refund flows** – The underlying Vendure platform supports refunds, but Dukarun’s customer-facing refund UI may be simplified or limited depending on your version.
- **Multi-step cashier integration** – The current public build may not yet expose a full cashier station UI; customer documentation will evolve as this solidifies.
- **Paystack-specific** – Subscription automation is currently built around Paystack; other payment gateways would require integration work.

---

## Vendure vs Dukarun: What’s What

- **Vendure Core**
  - Order lifecycle and payment states.
  - Basic payment method framework.
  - Customer and order entities.

- **Dukarun-Enhanced**
  - POS-specific order flow without shipping.
  - Walk-in customer pattern.
  - Price override permission and POS enforcement.

- **Dukarun-Exclusive**
  - Cash and M‑Pesa payment handlers wired into the ledger.
  - Location-based two-step cashier flow.
  - Paystack subscription integration, trials and read-only mode.
  - Subscription and channel-status guards that connect billing and authorization.

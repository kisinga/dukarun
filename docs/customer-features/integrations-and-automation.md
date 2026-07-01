## Integrations, Notifications & Automation

This guide explains how Dukarun connects to other systems and automates work, in terms that matter to merchants and ops teams.

---

## What Problems This Solves

- Connect Dukarun to **payment providers (Paystack)** and **observability tools**.
- Receive **real-time notifications** about orders, stock, recognition workflows and payments.
- Provide a stable **GraphQL API** for custom dashboards, data export and integrations.
- Keep the platform **observable and debuggable** as you scale.

---

## Key Capabilities (with Origins)

- **Admin GraphQL API** – Full-featured API behind the Dukarun dashboard for managing products, orders, customers and more.  
  **Origin:** Vendure Core.

- **Paystack subscription & payments integration** – Connect Dukarun’s own billing and subscriptions to Paystack, with webhooks and STK push support.  
  **Origin:** Dukarun-Exclusive (see `SUBSCRIPTION_INTEGRATION.md`).

- **Event-driven notification system** – In-app toasts and web push notifications for key events (orders, stock, recognition workflows, payments).  
  **Origin:** Dukarun-Exclusive (see `NOTIFICATION_SYSTEM.md`).

- **Recognition enrollment data** – Product GraphQL operations carry the embeddings used by the POS scanner.  
  **Origin:** Dukarun-Exclusive (see `ML_PRODUCT_RECOGNITION.md`).

- **Observability & monitoring** – Traces, metrics and logs via SigNoz and OpenTelemetry to keep the system healthy and support SLOs.  
  **Origin:** Dukarun-Exclusive (see `OBSERVABILITY.md`, `OBSERVABILITY_OPERATIONS.md`).

---

## GraphQL Admin API

### 1. What It Is

The Dukarun dashboard is just a client of the **Vendure admin GraphQL API**:

- All operations visible in the UI – product creation, price changes, order management – correspond to GraphQL queries and mutations.
- You can use the same API to:
  - Build internal tools.
  - Run scripts for bulk operations.
  - Export data to other systems.

**Origin:** Vendure Core (admin API).

---

### 2. How You Can Use It (Safely)

For advanced users and integrators:

- Access the GraphQL playground (when enabled) at `/admin-api`.
- Use an admin token or cookie-based session for authenticated requests.
- Follow Vendure’s own documentation (`VENDURE.md` refers to the upstream docs).

Recommended use cases:

- Bulk import of products.
- Data exports to accounting systems.
- Custom reports before a full analytics stack is in place.

---

## Paystack Integration (Subscriptions & Payments)

### 1. Subscription Billing (Dukarun’s Own Plans)

As detailed in `SUBSCRIPTION_INTEGRATION.md`, Dukarun integrates with **Paystack** to manage:

- Subscription tiers (e.g. Basic, Pro).
- Trial periods and renewal dates.
- Paystack customers and subscriptions.
- Webhook callbacks for payment events.

From a business owner’s perspective:

- You see a **Subscription** section in Dukarun.
- You can select a plan and pay using M‑Pesa (via Paystack STK or other supported flows).
- Dukarun automatically updates your subscription status and access level.

**Origin:** Dukarun-Exclusive plugin on top of Vendure.

---

### 2. Operational Considerations

For operations and finance teams:

- Environment variables configure Paystack keys and webhook secrets.
- Webhooks are validated and logged.
- Subscription state is stored on the channel and used by:
  - The **subscription guard** (backend).
  - A **frontend interceptor** that displays helpful messages.

This allows clear billing logic without manual toggling in the database.

---

## Notification System

### 1. What Events Generate Notifications?

Per `NOTIFICATION_SYSTEM.md`, Dukarun can generate notifications for:

- **Orders** – new orders, state transitions.
- **Stock** – low stock alerts, stock movements.
- **Recognition enrollment** – product image enrollment and cache refresh events where enabled.
- **Payments** – payment confirmed events.

These can appear:

- As **toasts** inside the Dukarun app.
- As **push notifications** on supported browsers/devices.

**Origin:** Dukarun-Exclusive event-driven notification plugin.

---

### 2. How it Works Conceptually

Flow (simplified from the architecture):

```text
Business event (order, stock, ML)
  → Notification handler
  → Notification records in DB
  → In-app toasts and optional Web Push
```

On the backend:

- A Vendure plugin listens to domain events.
- It creates notification entries and, when configured, uses the Web Push API.

On the frontend:

- A notification service:
  - Reads the notifications via GraphQL.
  - Shows toast messages using the shared toast component.
  - Manages push subscription and browser permissions.

---

### 3. How to Use It Day-to-Day

For typical users:

- You will see a **notification bell** and toast messages indicating:
  - New orders.
  - Low stock on key items.
  - Product recognition enrollment or cache refresh updates.
  - Payment confirmations.

For administrators:

- The **Settings → Test Notifications** page lets you:
  - Trigger test notifications from the backend.
  - Verify push subscriptions and browser behaviour.

---

## Recognition Enrollment Data

Dukarun no longer exposes the old external training pipeline. Recognition is driven by product
data:

- **Product enrollment** – product creation/editing can store image embeddings on the product.
- **Product prefetch** – dashboard startup caches product fingerprints for offline POS matching.
- **Scanner matching** – the Sell page compares live frame embeddings against cached products.

External systems should integrate through normal product and asset workflows rather than a
dedicated trainer service.

**Origin:** Dukarun-Exclusive.

---

## Observability & Monitoring

### 1. Why It Matters

For production environments and serious SMEs, it is crucial to:

- Detect and resolve problems quickly.
- Understand performance, errors and usage.
- Support uptime and SLAs.

---

### 2. Dukarun’s Observability Stack

As described in `OBSERVABILITY.md` and `INFRASTRUCTURE.md`:

- **SigNoz** is used for:
  - Traces across frontend and backend.
  - Metrics (e.g. request latency, error rates).
  - Log correlation.
- **OpenTelemetry** instrumentation:
  - Automatically captures HTTP, database and GraphQL calls.
  - Adds business-specific spans (orders, payments, recognition operations, registration).

For most customers, this is managed by the Dukarun platform operator, but it directly benefits you through:

- Faster incident response.
- More confidence in the reliability of the service.

**Origin:** Dukarun-Exclusive ops layer.

---

## Deployment & Infrastructure Automation

Although primarily an internal concern, it’s useful to know that Dukarun is:

- **Containerised** – frontend, backend, database, cache and observability all run as Docker containers (`INFRASTRUCTURE.md`).
- Equipped with a **first-run** sequence for fresh databases:
  - Populate base Vendure data.
  - Run custom migrations.
  - Exit cleanly before starting the normal server.

For operators:

- This reduces the risk of broken environments.
- Makes it safe to set up new instances or test environments programmatically.

**Origin:** Dukarun-Exclusive deployment tooling.

---

## How to Use & Configure (Workflows)

### A. Connecting Paystack (Operator View)

**Who:** Dukarun ops / engineering; not usually merchants.

1. Obtain Paystack API keys (test or live).
2. Configure environment variables as described in `SUBSCRIPTION_INTEGRATION.md`.
3. Set up webhook URLs in Paystack:
   - Point them to the Dukarun backend’s webhook endpoint.
   - Select required events (e.g. `charge.success`, `subscription.create`).
4. Test using Paystack’s test mode before going live.

Merchants then interact only with the **Subscription** UI; the underlying integration is invisible to them.

---

### B. Enabling Notifications for a User

**Who:** Individual dashboard user.

1. Open the Dukarun dashboard in a supported browser.
2. Accept the prompt to allow notifications (when the app asks).
3. Optionally visit **Settings → Notifications** or the **Test Notifications** page to:
   - Trigger a test notification.
   - Confirm you see toasts and/or push notifications.

---

### C. Using the Admin GraphQL API (Power Users)

**Who:** Advanced merchants, integrators.

1. Request or generate suitable credentials/permissions.
2. Use a GraphQL client (Insomnia, Postman, VS Code extension).
3. Connect to `/admin-api`.
4. Start with safe read-only queries:
   - Products list.
   - Orders list.
   - Customers list.
5. Only move to mutations once you have tested in a non-production environment.

---

## Limitations & Notes

- **Vendor lock-in for billing:** The current subscription implementation is tightly tied to Paystack; alternative billers require custom integration.
- **Notifications rely on browser support:** Push notifications and service workers depend on the user’s browser and OS; some combinations may not support all features.
- **GraphQL API is powerful but sharp:** It allows full control; use with care and appropriate permissions.

---

## Vendure vs Dukarun: What’s What

- **Vendure Core**
  - Admin GraphQL API.
  - Plugin system used to add custom back-office features.

- **Dukarun-Enhanced**
  - Subscription-aware guards driven by channel custom fields.
  - Observability hooks instrumenting business operations.

- **Dukarun-Exclusive**
  - Paystack subscription plugin and payment workflows.
  - Event-driven notification system with push support.
  - Product recognition enrollment and offline POS matching.
  - Containerised deployment, first-run automation, and observability stack.

## Authentication & Access Control

This guide explains **how people log in to Dukarun and what they are allowed to do**, in business terms.
It is intended for **owners, managers, back-office admins and internal product/marketing** – not backend engineers.

---

## What Problems This Solves

- Make sure **only the right people** can access your business data.
- Give **cashiers, managers and owners** different levels of access.
- Safely handle **new registrations**, trials and suspended accounts.
- Support **multi-company users** (e.g. an accountant or owner who oversees several shops).

---

## Key Capabilities (with Origins)

- **Admin login to the dashboard** – Staff log into the Dukarun dashboard (not the online shop) via Vendure’s admin API and Dukarun’s Angular frontend.  
  **Origin:** Dukarun-Enhanced (built on Vendure admin authentication).

- **Role-based access control (RBAC)** – You can define roles (e.g. Owner, Manager, Cashier) and assign permissions such as “manage products”, “override prices”, “approve credit”. Roles are scoped per business (channel).  
  **Origin:** Vendure Core (roles & permissions) + Dukarun-Enhanced (extra POS-specific permissions).

- **Channel-based scoping (multi-tenancy)** – Each business runs in its own **channel**. Users only see and manage data for the channels they are assigned to via roles.  
  **Origin:** Vendure Core (channels) + Dukarun-Enhanced (phone-auth, guards, UI).

- **Two-tier approval (user + business)** – New registrations go through **user-level authorization** and **business-level (channel) status**. Pending or unapproved businesses can log in but remain read-only until approved.  
  **Origin:** Dukarun-Exclusive (see `AUTHORIZATION_WORKFLOW.md`, `CHANNEL_STATUS_AUTH.md`).

- **Subscription-aware access** – Subscription state (trial, active, expired, cancelled) controls whether a business has full or read-only access, without blocking login.  
  **Origin:** Dukarun-Exclusive (subscription plugin + guards).

- **Read-only mode** – For channels that are **unapproved** or **expired**, Dukarun automatically blocks all write operations (mutations) but still allows users to log in and view their data.  
  **Origin:** Dukarun-Exclusive.

---

## How It Works in Dukarun (Conceptual Model)

### 1. Who Can Log In?

- Dukarun uses **Vendure’s admin API** behind the scenes.
- There are two main login patterns:
  - **System superadmin** – Default Vendure `superadmin/superadmin` for internal use and provisioning.
  - **Business admins and staff** – Created through Dukarun’s provisioning and registration flow (phone-based or email-based depending on setup).
- A user may belong to **one or more businesses** through roles assigned to channels.

**Technical hint (for product/marketing):** Authentication uses Vendure’s cookie-based admin sessions (see backend `README.md`), with CORS configured to allow the Angular frontend to authenticate via `/admin-api`.

---

### 2. Roles & Permissions (RBAC)

At a high level:

- A **role** is a named bundle of permissions (e.g. “Dukarun Admin”, “Cashier”, “Stock Controller”).
- Roles are assigned **per channel** (business).
- An administrator (user) can have multiple roles across multiple channels.

Typical role structure:

- **Owner / Company Admin**
  - Full access to products, inventory, sales, customers, suppliers, ledgers.
  - Can configure payment methods and subscription details.
- **Manager**
  - Manage catalog, inventory, customers, suppliers.
  - Approve credit and adjust credit limits (if granted special permissions).
- **Cashier**
  - Create orders, take payments, use the POS daily.
  - Cannot change products, prices, or financial settings.
- **Back-office Finance / Accountant**
  - Deep access to ledgers and balances, limited operational actions.

**Origin:**  
Vendure provides the base RBAC; Dukarun adds POS-specific permissions such as:

- `OverridePrice` – Control who can override prices during checkout (see `VENDURE.md` “Price Override Permissions”).
- Credit permissions – Approve customer credit and manage credit limits (see `CUSTOMER_SUPPLIER_INTEGRATION.md`, `VENDURE_CUSTOM_FIELDS.md`).

---

### 3. Channels & Multi-Tenancy

In Dukarun:

- A **Channel** = **one customer business** (e.g. “Downtown Groceries”).
- Each channel has:
  - Its own products and inventory.
  - Its own users (via channel-scoped roles).
  - Its own chart of accounts and ledger (financial system).
  - Its own subscription and status.

The **multi-tenancy model** is described in `ARCHITECTURE.md` (“Multi-tenancy Model” section) and is built on Vendure’s channel feature.

**Why this matters for you:**

- A user who works with multiple companies can switch between them through the Dukarun dashboard.
- Data is always isolated **per business**, even if the same physical person uses one login for several channels.

**Origin:** Vendure Core (channels) + Dukarun-Enhanced (channel provisioning, ledger per channel, subscription per channel).

---

### 4. Two-Tier Approval Flow

The authorization model combines:

1. **User-level status** (on the user account)
   - `PENDING` – New account, awaiting manual review by Dukarun staff.
   - `APPROVED` – User account is okay.
   - `REJECTED` – Account is rejected; user cannot log in.

2. **Channel-level status** (on the business / channel)
   - `UNAPPROVED` – New business; can log in but can only read.
   - `APPROVED` – Fully approved; normal read/write access.
   - `DISABLED` – Temporarily blocked; cannot access.
   - `BANNED` – Permanently blocked.

Flow (simplified):

- **Registration →** user becomes `PENDING`, channel becomes `UNAPPROVED`.
- **Dukarun staff review:**
  - If the account is okay → mark user `APPROVED`.
  - If the business passes checks → mark channel `APPROVED`.
- If **user is REJECTED** → login is blocked entirely.
- If **channel is UNAPPROVED** → login is allowed, but the dashboard is **read-only**.
- If **channel is DISABLED/BANNED** → all requests are blocked.

**Origin:** Dukarun-Exclusive (documented in `AUTHORIZATION_WORKFLOW.md` and `CHANNEL_STATUS_AUTH.md`).

---

### 5. Subscription-Aware Access

On top of approval status, each channel also has **subscription fields** (see `SUBSCRIPTION_INTEGRATION.md` and `VENDURE_CUSTOM_FIELDS.md`):

- `subscriptionTierId`
- `subscriptionStatus` – `trial`, `active`, `expired`, `cancelled`
- `trialEndsAt`, `subscriptionExpiresAt`, etc.

Key behaviours:

- **Trial (configurable)** – New channels start with a full-feature trial window (duration is set by the platform).
- **Active** – Business is fully paid and operates normally.
- **Expired / Cancelled** – Business can still log in and view data, but is placed in a **subscription read-only mode**.

The **subscription guard** and frontend interceptor:

- Let users see their data even if payment failed or expired.
- Block only the actions that would modify data (creating products, recording new sales, etc.).

**Origin:** Dukarun-Exclusive (Paystack subscription plugin + guards).

---

## How to Use & Configure (Workflows)

### A. Creating Roles & Assigning Users

**Who:** Dukarun operators or a trusted superadmin using the Vendure Admin UI.

1. Open the **admin UI** (`/admin` on the backend).
2. Go to **Settings → Roles**.
3. Create role(s) such as:
   - “{Company Name} Owner”
   - “{Company Name} Manager”
   - “{Company Name} Cashier”
4. For each role:
   - Select the **channel** (business) it applies to.
   - Tick the permissions that match what that role should do.
   - For managers/supervisors who may override prices or credit:
     - Include the custom permissions (e.g. `OverridePrice`, credit approvals).
5. Go to **Settings → Administrators**:
   - Create or edit an administrator.
   - Assign one or more roles.

Once a user has a role for a channel, Dukarun’s frontend will show that business in the company selector and will scope all operations accordingly.

---

### B. Handling New Registrations (Two-Tier Approval)

**Who:** Dukarun back-office; sometimes a reseller or implementation partner.

1. A new merchant submits a registration form (phone-based or web-based).
2. Dukarun creates:
   - A **user** account with `authorizationStatus = PENDING`.
   - A **channel** (business) with `status = UNAPPROVED`.
   - The basic setup (stock location, payment methods, roles, admin user) following the **Customer Provisioning Guide** (`CUSTOMER_PROVISIONING.md`).
3. In the Dukarun admin operations UI:
   - Review pending users and businesses.
   - If acceptable:
     - Mark the **user** as `APPROVED`.
     - Mark the **channel** as `APPROVED` once subscription/trial and provisioning are confirmed.
4. The merchant:
   - May log in even while the channel is UNAPPROVED, but they will see read-only screens.
   - Gains full ability to create products, record sales, etc., once the channel is APPROVED.

---

### C. Suspending or Banning a Business

**Who:** Dukarun back-office or platform owner.

Use cases:

- Non-payment.
- Abuse, fraud, or policy violations.
- Temporary maintenance or compliance review.

Steps:

1. In the Vendure admin UI, open **Settings → Channels**.
2. Find the relevant channel (business).
3. Change the **status** custom field:
   - `DISABLED` for temporary suspension.
   - `BANNED` for permanent disablement.
4. Save.

Effects:

- Any subsequent API requests from that business’s users will be blocked by the **Channel Access Guard**.
- Users see a clear error message (configurable in frontend) explaining that their channel has been disabled or banned.

---

### D. Managing Subscription State

**Who:** Dukarun back-office, billing, or finance.

Subscription data is stored as channel custom fields and maintained via the **Paystack subscription plugin** (see `SUBSCRIPTION_INTEGRATION.md`).

Common workflows:

1. **New trial channel**
   - On provisioning, the channel is given:
     - `subscriptionStatus = trial`
     - `trialEndsAt = now + trialDays` (platform-configured).
2. **Successful payment / activation**
   - Paystack webhooks or admin actions set:
     - `subscriptionStatus = active`
     - `subscriptionStartedAt` and `subscriptionExpiresAt`.
3. **Expired subscription**
   - When `subscriptionExpiresAt` has passed and no renewal is detected, the guard:
     - Keeps **login and read access**.
     - Switches the business into **read-only** mode (similar to UNAPPROVED).

From a customer’s point of view:

- Their staff can always log in and retrieve past data.
- If they don’t pay, they **cannot keep transacting** until they renew.

---

## Limitations & Gotchas

- **Single-context sessions:** A session is tied to one **active channel** at a time; switching companies happens in the dashboard UI rather than in one “global” view.
- **Immediate effect on next request:** Status changes (e.g. setting a channel to DISABLED) take effect on the **next API call**; there is no real-time “force logout” yet. This is by design for simplicity and reliability.
- **Admin UI is technical:** Role and channel management currently live in the Vendure admin UI, which is more technical than the Dukarun dashboard. Over time, more business-friendly screens can be layered on top.
- **Fine-grained permissions require discipline:** It is easy to over-assign permissions. We recommend a small, well-defined set of roles per business and clear written policies.

---

## Where This Extends Vendure vs What’s New

- **Vendure Core**
  - Base admin authentication and session handling.
  - Channels as the multi-tenancy mechanism.
  - Roles and permissions.

- **Dukarun-Enhanced**
  - POS-specific permissions like `OverridePrice`.
  - Channel-scoped ledger and subscription fields.
  - Angular dashboard that respects channel and role scopes.

- **Dukarun-Exclusive**
  - Two-tier approval model (user + channel) with read-only mode.
  - Subscription-aware access control (trial, active, expired).
  - Channel access guard and subscription guard that enforce business rules on every request.
  - Phone-based registration and onboarding flows tailored to Kenyan SMEs.

For deeper technical details, refer to:

- `docs/AUTHORIZATION_WORKFLOW.md`
- `docs/CHANNEL_STATUS_AUTH.md`
- `docs/SUBSCRIPTION_INTEGRATION.md`
- `docs/CUSTOMER_PROVISIONING.md`

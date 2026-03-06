# Dukarun onboarding and reference guide

This document is the single source of truth for how Dukarun works: product setup, daily operations, purchasing, credit, accounting, and admin. It is ordered the way a business operates and is intended for self-onboarding, customer care, and LLM reference alongside the code.

---

## Prerequisites and flow

Before you can sell, certain things must be in place. The following chain applies:

1. **Channel approved** — Your business (channel) must be approved. If the account is pending approval, you can log in but mutations (create, edit, delete) are blocked; the app is read-only until approval.
2. **Products and pricing** — You need at least one product (or service) with at least one variant and a price to sell anything.
3. **Stock (for physical products)** — For products that use stock, quantity on hand must be greater than zero at the chosen stock location. Stock comes from **opening stock** (set at product create/edit) or from **purchases**.
4. **Open shift** — To **record any payment** (complete a sale, pay a supplier, record an expense, or create an inter-account transfer), you must have an **open cashier session** (open shift). The UI blocks or prompts you to open a shift where required. You can add items to the cart without an open shift, but you cannot complete checkout (record payment) until a shift is open.
5. **Credit sales** — To sell on credit, the customer must exist and be **credit-approved** with a limit; the user may need credit management permission.

**Flow summary:** Channel → Products (with pricing) → Stock (opening or purchases) → Open shift → Sell / Record payment. For credit: customer + approval + limit.

---

## Creating a product

**What it is:** Adding a sellable product (or service) to your catalog so it appears on the Sell page and in reports.

**Prerequisites:** Channel approved; you need **CreateProduct** (or equivalent) permission to create products.

**Steps:**

1. Go to **Products** → **Create product** (or **Products** → **Create**).
2. Choose **item type**: Product or Service.
3. Choose **how it’s sold** (for products): Measured (e.g. by weight/volume) or Discrete (e.g. by unit). Services do not use stock.
4. Enter **details**: name, optional description, barcode if applicable, measurement unit or size template, and variants (e.g. 1 kg, 2 kg).
5. For each **variant/SKU**: set **price** and optionally **opening stock** (see Opening stock). SKU can be auto-generated.
6. Save. The product appears in the catalog and on the Sell screen.

**Common pitfalls:**

- Without at least one variant and a price, the product cannot be sold.
- For physical products, if you never set opening stock or record a purchase, quantity on hand is zero and the system may prevent or warn when selling.

---

## Types of products

**What it is:** The way items are classified and sold in Dukarun.

- **Item type**
  - **Product** — Physical goods; can have stock (measured or discrete).
  - **Service** — No stock tracked; you still track revenue (e.g. haircut, repair).
- **Product type (for products)**
  - **Measured** — Sold by weight, volume, or other continuous measure (e.g. rice by kg, fuel by litre).
  - **Discrete** — Sold by unit (e.g. bottles, packets).
- **How sold presets** — Single item, multi-variant (e.g. size/colour), by measure, or by volume (e.g. litre). These affect how variants and quantities are entered at the POS.

**Reference:** Product creation types are defined in the frontend (e.g. `product-creation.types.ts`: `ItemType`, `ProductType`, `HowSoldPreset`).

---

## Pricing

**What it is:** Setting the selling price (and optional tax, wholesale) for each variant so the POS and orders use correct amounts.

**Where it’s set:** On product create or edit, in the variant/SKU step. Each variant has:

- **Price** (and optionally **price with tax**)
- Optional **wholesale price**
- Optional **allow fractional quantity** (for measured products)

**Prerequisites:** Product and variant must exist. Price overrides at the POS may require specific permissions.

**Common pitfalls:**

- If price is missing or zero, the product may not be sellable or may show incorrect totals.
- Custom pricing (overrides) are applied via the backend pricing strategy; ensure payment and order flows use the same channel/context.

---

## Opening stock

**What it is:** Recording the inventory you **already have** when you first set up, or when you add a new product that is already in your store.

**When to use:** For existing inventory at go-live or when you don’t buy the stock through a purchase (e.g. gifts, transferred stock you record separately). For ongoing restock from suppliers, use **Purchases** instead.

**Where:** When creating or editing a product, set **stock on hand** (or equivalent) per variant and, if applicable, per stock location.

**How it works in the system:** Opening stock is stored as special batches (e.g. `sourceType: 'OpeningStock'`) so the ledger and reports can distinguish it from purchased stock. Backend: `inventory.service.ts` — `createOpeningStockBatches`, `ensureOpeningStockBatchIfNeeded`.

**Common pitfalls:**

- If you don’t set opening stock and don’t record a purchase, quantity on hand stays zero and you may not be able to sell (or you’ll get low-stock behaviour).
- Stock is per **location**; ensure the correct stock location is selected when viewing or selling.

---

## Opening a shift

**What it is:** A **shift** is one cashier session: you **open** it (optionally with opening cash/account balances) and **close** it (with a closing count and reconciliation). “Opening a shift” means having an **open** cashier session for your channel.

**Why it matters:** You **must** have an open shift to:

- Record payment for a sale (complete checkout)
- Record a supplier payment (pay a purchase)
- Record an expense
- Create an inter-account transfer

You **do not** need an open shift to:

- Create or edit products, customers, or suppliers
- Add items to the cart or create a draft order
- View reports or accounting

**Where:** Dashboard — click **Open shift** (or the shift badge). On the Sell page, if no shift is open, a banner appears with **Open shift**; clicking it opens the shift modal. Backend enforces this via `open-session.service.ts` — `requireOpenSession(ctx, channelId)` for payment and transfer mutations.

**Common pitfalls:**

- **“Open a session to record payments”** — You tried to complete checkout, pay a supplier, record an expense, or create a transfer without an open shift. Fix: open a shift from the Dashboard or Sell page banner, then retry.
- Closing a shift creates a **closing reconciliation** record; every closed session should have one. If you see “closed sessions missing reconciliation”, use the repair flow (see SHIFT_RECONCILIATION.md).

---

## Selling the product

**What it is:** Using the **Sell** page (POS) to add items to the cart and complete a sale with a payment method.

**Prerequisites:**

- At least one product with price (and, for physical products, stock if enforced).
- **Open shift** to record payment (complete checkout).
- Payment methods configured (Settings → Admin → Payment Methods).
- For credit sales: credit-approved customer (see Selling on credit).

**Steps:**

1. Open **Sell** from the main nav.
2. **Add items** by **Camera** (AI recognition of label/price card), **Barcode** (scan SKU), or **Search** (name/SKU). In the confirmation modal, choose variant and quantity; item is added to the cart.
3. Open the **cart** (e.g. FAB or cart icon), review items and total. Optionally attach a **customer** (for credit or history).
4. **Checkout:** Choose payment method (Cash, M-Pesa, Credit, or others). Apply payment; the order is completed and payment is recorded (only when a shift is open).

**Common pitfalls:**

- **Checkout disabled or “Open a session to record payments”** — No open shift. Open a shift and try again.
- **Credit option not available** — Customer not credit-approved or over limit; see Selling on credit.
- **Low stock / quantity not available** — Insufficient stock at the selected location. Add opening stock or record a purchase.
- **Payment method missing** — Add methods under Settings → Admin → Payment Methods.

---

## Purchasing (supplier management)

**What it is:** Recording stock you buy from suppliers. Each purchase updates stock on hand and can post to the ledger; you can then pay the supplier (which requires an open shift).

**Suppliers:** In Dukarun, **suppliers are customers** with a flag `isSupplier`. Create them via **Suppliers** → Create (or the supplier flow); they appear in purchase creation as the “supplier” party.

**Prerequisites:** At least one **supplier** (customer with `isSupplier`), and a **stock location**. Open shift is required to **record a payment** against a purchase.

**Steps:**

1. **Create supplier:** **Suppliers** → **Create**; enter name, contact, optional terms. Save.
2. **Create purchase:** **Purchases** → **Create purchase**; select supplier, stock location, then add product variants and quantities (and optional unit cost, batch number, expiry). Confirm; stock is increased for that location.
3. **Pay purchase:** When you pay the supplier, use the pay-purchase flow (e.g. from the purchase detail). This **requires an open shift**.

**Common pitfalls:**

- **Cannot record supplier payment** — No open shift. Open a shift first.
- **Supplier not in list** — Ensure the customer is created with “Is supplier” (or equivalent) set so they appear in purchase creation.

---

## Selling on credit (customer management)

**What it is:** Letting selected customers buy now and pay later, within a **credit limit**. The system checks approval and limit before allowing a credit sale; payments reduce the customer’s outstanding balance.

**Prerequisites:** A **customer** must exist. The customer must be **credit-approved** and have a **credit limit**. The user may need credit management permission to approve customers or change limits.

**Steps:**

1. **Create customer:** **Customers** → **Create customer** (or **Add customer**); enter name, phone, optional email. Save.
2. **Set credit:** In **Customers** → edit the customer (or open **Credit** and use “Manage” to go to the customer), set **credit limit** and **approve** the customer for credit. Optionally set **credit duration** (days).
3. **Sell on credit:** On the **Sell** page, add items, open the cart, **select the credit-approved customer**, then choose **Credit** (or the credit payment type). Complete the order; the amount is recorded as outstanding for that customer.
4. **Receive payments:** Record payments against the customer (e.g. from **Credit** page or **Customers** → customer → record payment, or against specific orders in **Orders**). Outstanding balance decreases.

**Frozen state:** If a customer is **not** approved for credit and has an **outstanding balance**, they are treated as “frozen”: no new credit can be extended, but payments are still accepted. This is inferred from state (not approved + outstanding ≠ 0), not a separate stored field.

**Common pitfalls:**

- **Credit option not available at checkout** — Customer not credit-approved, or over limit, or frozen. Edit the customer and approve for credit / increase limit.
- **Permission denied** — Credit management (approve, change limit) may require a specific permission; contact the store owner or an admin.

**Reference:** `docs/CREDIT.md`; backend `credit-validator.service.ts`, `credit.service.ts`.

---

## Accounting and reconciliation

**What it is:** The **ledger** (chart of accounts, journal entries), **expenses**, and **reconciliation** so you can see where money is and match it to real account balances.

**Where:** **Accounting** in the main nav (often gated by Settings permission). Tabs typically include:

- **Ledger** — Overview, Accounts, Transactions, **Reconciliation**
- **Expenses** — Record and list expenses (recording an expense requires an open shift)
- **Inter-account transfers** — Move value between accounts (requires open shift)

**Reconciliation:**

- **Opening a shift** — You can enter opening balances for cash (and other) accounts; this creates an opening reconciliation record.
- **Closing a shift** — When you close a cashier session, a **closing reconciliation** is created (session closed, closing cash count, and the reconciliation record). Every closed session should have one.
- **Manual reconciliation** — **Accounting** → **Ledger** → **Reconciliation** tab → “Create manual reconciliation”. You record declared (actual) amounts for all relevant accounts for a date range. Use this to align the books with real counts.

**Common pitfalls:**

- **Missing closing reconciliation** — If a session was closed in the past without a reconciliation record (e.g. due to a bug), use the repair flow: query `closedSessionsMissingReconciliation` and call `createCashierSessionReconciliation` for each. See `docs/SHIFT_RECONCILIATION.md`.
- **Cannot record expense** — Open a shift first.

**Reference:** `docs/SHIFT_RECONCILIATION.md`; backend `reconciliation.service.ts`, `open-session.service.ts`.

---

## Inter-account transfers

**What it is:** Moving value from one ledger account to another (e.g. from Cash to Bank). Each transfer creates a journal entry and is audited.

**Prerequisites:** **Open shift** and permission to create inter-account transfers (e.g. `CreateInterAccountTransfer` or equivalent).

**Where:** **Accounting** → **Inter-account transfers** (or **Transfers** tab). Use “Create transfer” (or similar); choose from account, to account, amount, and optional memo (and optional fee account).

**Common pitfalls:**

- **Cannot create transfer** — No open shift, or missing permission. Open a shift and ensure your role has transfer permission.

**Reference:** Backend `period-management.resolver.ts` — `createInterAccountTransfer`.

---

## Admin features

**What it is:** Settings and configuration available to users with **UpdateSettings** (or equivalent). Accessed via **Settings** → **Admin** (or the Admin section in the dashboard).

**Tabs (typical):**

| Tab | Purpose |
|-----|---------|
| **General** | Channel/store-level settings (name, address, etc.). |
| **Shifts** | View and manage cashier sessions (open/close, history). |
| **Audit Trail** | View audit log (who did what, when). Filter by event type, entity, user. |
| **Subscription** | Trial and subscription status; upgrade or renew. |
| **ML Model** | Status of the ML model used for camera recognition (training, ready, etc.). |
| **Payment Methods** | Configure tenders (Cash, M-Pesa, etc.) that appear at checkout. |
| **Team** | Invite administrators, assign roles and permissions. |

**Stock adjustments:** Adjusting stock (e.g. damage, count corrections) is under a **separate** menu item (e.g. **Stock adjustments**) and requires **ManageStockAdjustments** permission, not only UpdateSettings.

**Common pitfalls:**

- **Cannot see Admin or a tab** — Your user may not have **UpdateSettings** (or the specific permission for that tab). Contact the channel owner.
- **Cannot add payment methods** — Must have access to Admin → Payment Methods; without at least one payment method, checkout may show no options.

---

## Audit logs

**What it is:** A log of important actions (who did what, when) for compliance, troubleshooting, and security.

**Where:** **Settings** → **Admin** → **Audit Trail**. You can filter by event type, entity type, source, and view user and timestamp details.

**What’s logged (examples):**

- **Financial:** expense recorded, inter-account transfer, reconciliation created/verified, period closed/opened.
- **Payments:** payment allocated, supplier payment allocated.
- **Credit:** customer credit approved, limit/duration changed.
- **Shift:** cashier session opened/closed, cash count recorded, variance explained, M-Pesa verified.
- **Admin:** admin invited/updated/disabled, role created.
- **Orders:** order created, order state changed.
- **Products:** product created/updated/deleted.
- **Stock:** stock movement, purchase recorded, stock adjustment recorded.
- **Channel:** channel settings/status updated.

**Reference:** Backend `audit-events.catalog.ts`, `audit.service.ts`; frontend Audit Trail component under Admin.

---

## Common pitfalls and troubleshooting (summary)

| Problem | Cause | Fix / Where to look |
|--------|--------|----------------------|
| Cannot complete sale / “Open a session to record payments” | No open shift | Open shift from Dashboard or Sell page banner. |
| Credit option not available at checkout | Customer not credit-approved, over limit, or frozen | Customers → edit customer → set limit and approve; or Credit page. |
| Read-only / cannot edit | Channel pending approval or subscription expired | Check approval status or Settings → Admin → Subscription. |
| Low stock / can’t sell (quantity not available) | Insufficient stock at location | Add opening stock (product edit) or record a purchase for that location. |
| Payment method missing at checkout | No payment methods configured | Settings → Admin → Payment Methods (admin/owner). |
| Cannot record supplier payment / expense / transfer | No open shift | Open a shift first, then retry. |
| Order created but payment not recorded | User added items and tried to pay without opening shift | Open shift, then record payment against the order (Orders → order → Pay). |
| OTP not received (development) | Dev mode: OTP is not sent by SMS/email | Check backend terminal for `[COMMUNICATION DEV] otp | ... body=123456`; use the 6-digit code from `body=`. |

---

## Documentation conventions (for support and dev)

- **Screenshots:** Future versions of this guide may include “Screenshot: …” placeholders; capture the described screen for the final guide.
- **OTP in development:** When `COMMUNICATION_DEV_MODE=true` or the backend runs in development, OTP codes are logged in the backend terminal. Look for `[COMMUNICATION DEV] otp | channel=sms | to=... | body=XXXXXX` and use the 6-digit code in `body=` for signup or login.
- **Code references:** Key backend and frontend files are mentioned so that customer care or an LLM can pair this doc with the codebase (e.g. `open-session.service.ts`, `credit-validator.service.ts`, `audit-events.catalog.ts`).

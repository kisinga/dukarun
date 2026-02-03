# Getting Started Guide — Plan for New Users

This document is the **comprehensive plan** for building a Getting Started page that serves as a guide for new users. It is organized into **3 main sections**, each split into easy-to-follow sub-sections, with screenshot and flow notes for authors.

---

## Audience & Assumptions

- **Who:** Business owners or employees (staff) using Dukarun for daily sales, stock, and basic back-office. The difference between owner and employee is mainly that some actions (e.g. Settings, Team, Payment Methods) are only available to users with the right permissions.
- **Accounting:** They may have no or only basic accounting knowledge. Use plain language; avoid jargon where possible; link “why” to simple outcomes (e.g. “so you know what you’ve sold”).
- **Tech level:** At least basic proficiency (using a smartphone or computer, forms, links). No need to explain very basic UI (e.g. “click the button” is enough).
- **Data & stats:** They may not yet value statistics or data-driven decisions. **Politely nudge** the importance of the Dashboard and reports early (e.g. “Checking your numbers regularly helps you spot what sells and what to restock”) before diving into detailed stats sections.

---

## Documentation Conventions

- **Screenshots:** Where a sub-section says “Screenshot: …”, capture the described screen for the final guide. Prefer mobile and desktop where the layout differs (e.g. Sell, Dashboard).
- **OTP in development:** When the app is run in **dev mode**, OTP codes are **not** sent by SMS/email. They are **logged in the backend terminal**. Look for a line like:
  - `[COMMUNICATION DEV] otp | channel=sms | to=+254... | body=123456`
  - The **6-digit code** is in `body=`. Use this code to complete signup or login when testing or documenting.
- **Enabling OTP logging:** Communication dev mode is on when `COMMUNICATION_DEV_MODE=true` in `.env` or when the backend runs in development (e.g. `NODE_ENV=development`). For local docs/testing, start the app with `npm run dev` and **monitor the backend terminal** where the OTP line appears.
- **Creating a test account:** To document signup/login, create a new account (new phone number or email) and, in dev, use the OTP from the backend log to verify.

---

## Section 1: Getting Started — From Signup to First Sale

**Goal:** Get the user from zero to a completed first sale, with minimal concepts. Order of sub-sections matches the real flow.

### 1.1 Creating an account

- **What:** Register a business (company + admin + store) and verify with OTP.
- **Sub-steps:**
  1. Go to **Sign up** (from homepage or login page).
  2. **Step 1 — Company & Admin:** Enter company name (check availability), admin first name, last name, phone number (required; used for login), and optional email. Next.
  3. **Step 2 — Store:** Enter store name and address. Click **Send OTP**.
  4. **Step 3 — Verify OTP:** Enter the 6-digit code received by SMS (or, in dev, from the backend terminal log). Complete registration.
- **Notes:** After signup, the account may be **pending approval** (read-only until the business is approved). Mention that they can log in but some actions may be limited until approval.
- **Screenshot:** Signup step 1 (company + admin form), step 2 (store form), step 3 (OTP input). Optional: backend terminal showing `[COMMUNICATION DEV] ... body=<OTP>` for dev/testing.

### 1.2 Logging in

- **What:** Sign in with phone number (and optionally email in some flows); verify with OTP.
- **Sub-steps:**
  1. Go to **Login**, enter phone number, request OTP.
  2. Enter the 6-digit OTP (from SMS or, in dev, from backend terminal).
  3. If the user has multiple companies/channels, select the company to work in.
- **Screenshot:** Login screen (phone input), OTP verification screen. Dev note: OTP in backend log when `COMMUNICATION_DEV_MODE` or development mode is on.

### 1.3 Understanding the dashboard (Overview)

- **What:** The main dashboard (Overview) shows today’s and period-based sales and purchases, low-stock alerts, and system stats (product count, users, average sale, etc.).
- **Sub-sections:**
  - **Overview cards:** Sales, Purchases, Expenses (e.g. Today / Week / Month). Tap/click a card to expand breakdown by account type where applicable.
  - **Alerts:** Low stock count and link to Products (filtered by low stock).
  - **System stats:** Products, Users, Avg Sale, Margin (or “Soon”).
  - **Activity:** Recent activity list (sales, purchases, etc.).
- **Nudge:** One short sentence: “Checking this page regularly helps you see how the business is doing and what needs attention (e.g. restocking).”
- **Screenshot:** Full Overview on desktop and/or mobile showing stats and one expanded category.

### 1.4 Creating your first product

- **What:** Add a sellable product (or service) with name, how it’s sold (measured vs discrete), variants, prices, and optional stock.
- **Sub-steps:**
  1. Go to **Products** → **Create product** (or **Products** → **Create**).
  2. **Item type:** Product or Service.
  3. **How sold:** For products, choose **Measured** (e.g. by weight/volume) or **Discrete** (e.g. by unit). For services, stock is not tracked.
  4. **Details:** Product name, optional description, identification (barcode if applicable), measurement unit or size template, variants (e.g. 1 kg, 2 kg).
  5. **Variants/SKUs:** For each variant, set **price** and optionally **opening stock** (see 1.5). SKU can be auto-generated.
  6. Save; product appears in catalog and on the Sell screen.
- **Screenshot:** Product type selector, “how sold” step, variant list with price and stock fields, and final product in the product list.

### 1.5 Recording stock (opening balance vs purchases)

- **What:** Stock can be set in two ways: at product creation (opening balance) or via purchases. Both update “stock on hand” for the selected location(s).
- **Sub-sections:**
  - **Opening balance:** When creating or editing a product, set **stock on hand** (or equivalent) per variant/location. Use this for existing inventory when you first set up (e.g. “I already have 50 units”).
  - **Purchases:** Use **Purchases** → **Create purchase** to record stock you buy from suppliers. Selecting products and quantities increases stock. Ideal for ongoing restock.
- **Plain-language tip:** “Use opening balance for what you already have; use purchases when you buy new stock from a supplier.”
- **Screenshot:** Product variant with stock field; Purchases list and create-purchase flow (supplier, items, quantities).

### 1.6 Making your first sale

- **What:** Use the **Sell** page (POS) to add items to the cart and complete a sale with a payment method.
- **Sub-steps:**
  1. Open **Sell** from the main nav.
  2. **Add items** by one of: **Camera** (AI recognition of label/price card), **Barcode** (scan SKU), or **Search** (name/SKU). Select variant and quantity in the confirmation modal; item is added to the cart.
  3. Open the **cart** (e.g. FAB or cart icon), review items and total. Optionally attach a **customer** (walk-in or selected customer for credit).
  4. **Checkout:** Choose payment method (e.g. Cash, M-Pesa, or others configured in Settings). Apply payment; complete the order.
- **Notes:** Price overrides may require permission. Credit sales require a credit-approved customer (see Section 2).
- **Screenshot:** Sell screen with scanner/search, product confirmation modal, cart with items, checkout modal with payment method selection.

### 1.7 A quick word on sales stats

- **What:** Short nudge on why numbers matter, without overwhelming.
- **Copy idea:** “Your Dashboard and Orders show how much you’ve sold and what’s selling. Glancing at these regularly helps you restock the right items and spot trends. You’ll see more detail in Section 3.”

---

## Section 2: Customers, Credit, and Payments

**Goal:** Cover customer setup, selling on credit, receiving payments, and where to fix common issues. Then point to admin and accounting.

### 2.1 Creating a customer account

- **What:** Add a customer so you can assign sales to them (e.g. for credit or history).
- **Sub-steps:**
  1. Go to **Customers** → **Create customer** (or **Add customer**).
  2. Enter name, phone, optional email, and any other required/optional fields.
  3. Save. Customer can be selected at checkout (Sell) or when recording payments.
- **Note:** “Walk-in” or anonymous sales can use a default walk-in customer; creating named customers is for repeat or credit customers.
- **Screenshot:** Customer list, create-customer form, and customer selected in Sell/checkout.

### 2.2 Credit sales

- **What:** Allow selected customers to buy now and pay later, within a credit limit.
- **Sub-steps:**
  1. **Create the customer** (if not already) — see 2.1.
  2. **Set credit:** In **Customers** → edit customer, or in **Credit** (if you have the permission), set **credit limit** and **approve** the customer for credit. Optionally set **credit duration** (days).
  3. **Sell on credit:** On the **Sell** page, add items, open cart, **select the credit-approved customer**, then choose **Credit** or the appropriate payment type. Complete the order; the amount is recorded as outstanding for that customer.
- **Notes:** Only credit-approved customers can have credit orders. Outstanding balance cannot exceed the limit. Credit management permission may be required to approve/revoke or change limits.
- **Screenshot:** Customer edit with credit limit and “Approved” state; Sell checkout with customer selected and Credit payment.

### 2.3 Receiving credit payments

- **What:** Record payments from customers against their outstanding balance (paying off credit).
- **Sub-steps:**
  1. Go to **Payments** (or the place where payments and orders are listed).
  2. Find the relevant order(s) or customer; use **Payments** to record a payment (e.g. cash or M-Pesa) against an order or customer balance.
  3. The outstanding balance for that customer updates accordingly.
- **Detail:** If the app has a dedicated “record payment” flow for credit customers, document that (e.g. from **Credit** page or **Customers** → customer → “Record payment”). Otherwise, describe recording payment against the order in **Payments** or **Orders**.
- **Screenshot:** Payments list or Credit/customer detail with “Record payment” or “Receive payment” and the form/modal.

### 2.4 Troubleshooting

- **What:** Common issues and where to look. Keep each item to 1–3 sentences plus a link or place in the app.
- **Suggested topics:**
  - **Can’t log in / OTP not received:** In production, check phone/email and retry; in dev, use OTP from backend terminal (`[COMMUNICATION DEV] ... body=<code>`).
  - **Read-only / “Cannot edit”:** Account or business may be pending approval, or subscription expired. Check approval status or subscription (Settings → Subscription if available).
  - **Low stock / can’t sell:** Check product variant stock and stock location; add stock via product edit (opening balance) or **Purchases**.
  - **Credit option not available:** Customer must be credit-approved and within limit; user may need credit management permission.
  - **Payment method missing:** New payment methods are added in **Settings → Payments** (admin/owner).
  - **Permission denied:** Some actions (Settings, Team, Payment Methods, Credit management, Stock adjustments) require specific permissions; contact the store owner or an admin.
- **Screenshot:** Optional: one “read-only” or error state, and Settings → Subscription or approval message.

### 2.5 Admin options

- **What:** Where owners or admins configure the store: users, permissions, and payment methods. Clearly state that these are typically **owner or admin** tasks.
- **Sub-sections:**

#### 2.5.1 Creating additional users (team members)

- **Where:** **Settings** → **Team** tab.
- **Steps:** Open **Team**, click **Add** / **Create admin**, enter details (e.g. name, email, phone), assign a **role** (template). Save. The new user gets access according to that role.
- **Screenshot:** Settings with Team tab selected; create-admin modal or form.

#### 2.5.2 Managing users and permissions

- **Where:** **Settings** → **Team**; select a member to view or edit.
- **What:** View list of administrators; change role or **permissions** (e.g. Sell, Products, Customers, Credit, Stock adjustments, Settings). Disable or remove access if needed.
- **Screenshot:** Team list and permission editor (e.g. checkboxes or role selector) for one member.

#### 2.5.3 Creating additional payment methods

- **Where:** **Settings** → **Payments** tab.
- **What:** Add or edit payment methods (e.g. Cash, M-Pesa, other tenders) that appear at checkout. Names and codes may be configurable.
- **Screenshot:** Settings → Payments with list of methods and add/edit modal or form.

### 2.6 Accounting features

- **What:** High-level overview of the **Accounting** area for users who want to see ledgers and reconciliation. No need for deep accounting theory; focus on “where to look.”
- **Sub-sections:**
  - **Overview:** Summary of key accounts or totals (e.g. sales, purchases, receivables). **Screenshot:** Accounting overview or dashboard tab.
  - **Accounts:** List or tree of ledger accounts (e.g. by type: asset, liability, equity, income, expense). **Screenshot:** Accounts tab.
  - **Transactions:** List of journal entries or transactions; filter by date, account, or type. **Screenshot:** Transactions list and optional detail.
  - **Reconciliation:** If the app supports reconciliation, briefly describe its purpose (e.g. matching payments to statements) and where it lives. **Screenshot:** Reconciliation tab or screen.
- **Nudge:** “If you’re not sure what an account or transaction means, your accountant or owner can help; the important part is that sales and purchases are recorded here for the business.”

### 2.7 Product unique features

- **What:** Short overview of Dukarun-specific product and POS features so users know what’s possible.
- **Sub-sections:**
  - **AI / camera recognition:** On Sell, use the camera to point at a **price label or product**; the app suggests a product to add. Improves speed for produce or unmarked items.
  - **Barcode scan:** Scan barcode to add a product by SKU (Chrome/Edge or supported browsers).
  - **Search:** Fallback: search by product name or SKU.
  - **Measured vs discrete:** Products can be sold by weight/volume (measured) or by unit (discrete). Affects how quantity and stock are entered.
  - **Services:** Service products (e.g. haircut) don’t use stock; you still track revenue.
  - **Stock by location:** Stock is tracked per location; choose the right location when creating purchases or adjusting stock.
  - **Offline-ready catalog:** Catalog can be cached so Sell works better with poor connectivity.
- **Screenshot:** Sell screen showing camera, barcode, and search; product create showing “Measured” vs “Discrete” and “Service”; optional ML model status in Settings.

---

## Section 3: Going Further — Data, Suppliers, and Store Management

**Goal:** Deepen use of data, suppliers, stock adjustments, audit, and optional features (ML, multi-location, subscription).

### 3.1 Using sales stats and data for decisions

- **What:** Expand the “why stats matter” nudge into a short, practical section.
- **Sub-sections:**
  - **Dashboard (Overview):** Use it daily or weekly to see sales and purchases (today/week/month), low stock, and activity. “A quick look helps you decide what to reorder and how the day is going.”
  - **Orders:** Filter and search orders; see totals, payment state, and customer. Use for disputes, refunds, or simple reporting.
  - **Payments:** See what’s been paid and how (method, date). Helps with cash reconciliation and chasing credit.
  - **Credit page:** Total outstanding, limits, and per-customer balances. “Use this to follow up on payments and adjust limits.”
- **Nudge:** “You don’t need to be an accountant to benefit: checking these screens regularly makes it easier to restock, collect money, and spot problems early.”
- **Screenshot:** Overview with expanded sales/purchases; Orders list; Credit summary.

### 3.2 Suppliers and purchases

- **What:** How to set up suppliers and record purchases (restock).
- **Sub-steps:**
  1. **Suppliers:** **Suppliers** → **Create**; enter name, contact, optional terms. Save.
  2. **Create purchase:** **Purchases** → **Create purchase**; select supplier, location, then add product variants and quantities. Confirm; stock is increased for that location.
  3. **Purchase history:** Use **Purchases** list to see past orders and, if available, purchase detail (items, totals, payments).
- **Screenshot:** Suppliers list and create form; Create purchase (supplier + items + quantities); Purchase detail.

### 3.3 Stock adjustments

- **What:** When and how to correct stock (e.g. damage, count corrections) for users who have **Stock adjustments** permission.
- **Where:** **Stock adjustments** in the nav (if the user has permission).
- **Steps:** Create adjustment; select location and product/variant; set reason and new quantity (or delta). Submit; stock on hand updates. Optional: mention audit trail for adjustments.
- **Screenshot:** Stock adjustments list and create form (location, product, quantity, reason).

### 3.4 Audit trail and notifications

- **What:** Where to see who did what, and where to manage alerts.
- **Sub-sections:**
  - **Audit trail:** **Settings** → **Audit Trail**. View history of important actions (e.g. who changed what and when). Useful for owners and compliance.
  - **Notifications:** **Settings** → **Notifications** (if present). Configure or test alerts (e.g. low stock, payment). Mention in-app notification bell for real-time alerts.
- **Screenshot:** Audit trail list or filter screen; Notification settings or test panel.

### 3.5 ML model and AI recognition

- **What:** For stores using camera-based recognition, where to check status and what it means.
- **Where:** **Settings** → **ML Model** (or similar).
- **What to say:** Model is trained per channel; status (e.g. training, ready, failed) is shown here. If recognition is poor, suggest retraining or adding product photos. Link to product setup (photos/labels) if relevant.
- **Screenshot:** ML model status screen (status, last trained, actions).

### 3.6 Multi-location and cashier flow (optional)

- **What:** If the app supports multiple stock locations or a two-step cashier flow, briefly describe.
- **Multi-location:** Each store/warehouse can be a location; stock and sometimes sales are per location. Switching company/location in the header changes context.
- **Cashier flow:** Some setups have “salesperson” (creates order) and “cashier” (takes payment). Dashboard may show “Open”/“Closed” for the cashier. Document only if the feature is enabled and visible.
- **Screenshot:** Company/location switcher; dashboard with Open/Closed badge (if applicable).

### 3.7 Subscription and trial

- **What:** For hosted Dukarun, explain trial and subscription in simple terms.
- **Sub-sections:**
  - **Trial:** New businesses may start on a time-limited trial; full access during the trial.
  - **Subscription:** After trial, a paid subscription (e.g. via Paystack) may be required. **Settings** → **Subscription** (or similar) shows status and upgrade option.
  - **Read-only on expiry:** If the subscription expires, users can often still log in and **view** data but cannot create or edit (read-only). Encourage upgrading or renewing to restore full access.
- **Screenshot:** Settings → Subscription tab (status, tier, upgrade button).

---

## Additional sections you may want to add

- **Profile:** Changing name, phone, email, or password (if applicable); where to find **Profile** in the app.
- **Support and help:** Link to support page, contact, or in-app help. Mention **Terms** and **Privacy** for legal/compliance.
- **Glossary:** Short definitions for: channel, SKU, variant, credit limit, outstanding balance, ledger, stock location, OTP (and “where to get OTP in dev”).
- **Keyboard/shortcuts:** If the POS has keyboard shortcuts (e.g. focus search, add to cart), list them in a small subsection or appendix.
- **Printing:** If receipts or invoices can be printed, add a sub-section under Sell or Orders (e.g. “Print receipt” from order detail).

---

## Screenshot checklist (summary)

| Section / Sub-section        | Suggested screenshot(s) |
|-----------------------------|--------------------------|
| 1.1 Signup                  | Step 1 form, Step 2 form, Step 3 OTP; optional: backend OTP log |
| 1.2 Login                   | Phone input; OTP input |
| 1.3 Dashboard               | Overview with stats and one expanded category |
| 1.4 Product create          | Type + “how sold”; variants with price/stock |
| 1.5 Stock                   | Product stock field; Create purchase |
| 1.6 Sell                    | Sell screen (camera/barcode/search); confirm modal; cart; checkout |
| 2.1 Customer                | Customer list; create form; customer in checkout |
| 2.2 Credit                  | Customer credit approval + limit; Sell with credit payment |
| 2.3 Payments                | Payments list or “Record payment” flow |
| 2.4 Troubleshooting          | Optional: read-only or error message |
| 2.5 Team                    | Team tab; create admin; permission editor |
| 2.5 Payments (methods)      | Settings → Payments list + add/edit |
| 2.6 Accounting              | Overview; Accounts; Transactions; Reconciliation |
| 2.7 Product features        | Sell (camera/barcode/search); Measured vs Discrete; ML status |
| 3.1 Stats                   | Overview; Orders; Credit summary |
| 3.2 Suppliers / Purchases   | Suppliers list; Create purchase; Purchase detail |
| 3.3 Stock adjustments       | Adjustments list + form |
| 3.4 Audit / Notifications   | Audit trail; Notification settings |
| 3.5 ML model                | ML model status |
| 3.6 Multi-location          | Company/location switcher; Open/Closed (if used) |
| 3.7 Subscription           | Subscription status / upgrade |

---

## Implementation notes for the actual Getting Started page

- **Format:** Each section can be a separate page or a long single page with anchors. Prefer **one page per main section** (1, 2, 3) with sub-sections as headings and optional “Back to top” or sticky nav.
- **Navigation:** Add a clear link to “Getting Started” from the dashboard (e.g. first-time banner), footer, or help menu.
- **Progressive disclosure:** Section 1 is enough for “first sale”; Sections 2 and 3 can be linked as “Next: Customers & credit” and “Going further.”
- **Search:** If the site has search, index all headings and key terms (OTP, credit, payment method, stock adjustment, etc.) so users can jump to the right sub-section.
- **Maintain:** When adding features (e.g. new payment method, new role), add a line to the relevant sub-section and, if needed, to the screenshot checklist.

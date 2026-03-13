# Getting Started Guide — Plan for New Users

This document is the **plan** for building a Getting Started page. It's organized into **3 sections** that follow the natural order a new user would experience, from first login to advanced features.

---

## Audience & Assumptions

- **Who:** Business owners or employees using Dukarun for daily sales, stock, and basic back-office tasks. Owners typically have full access; employees may only see certain sections depending on their permissions.
- **Accounting knowledge:** Assume little to none. Use plain language and connect features to simple outcomes (e.g. "so you can see what you've sold today").
- **Tech level:** Comfortable using a phone or computer — filling in forms, tapping buttons, navigating menus. No need to explain basic interactions.
- **Data awareness:** They may not yet think about numbers and reports as a daily habit. Gently introduce the value of checking stats early on (e.g. "A quick look at your Dashboard helps you know what to restock").

---

## Documentation Conventions

- **Screenshots:** Where a section says "Screenshot: …", capture that screen for the final guide. Show both mobile and desktop if the layout differs (e.g. Sell page, Dashboard).
- **Navigation paths:** All paths (e.g. `/dashboard/sell`) are relative to the app's base URL. In the final guide, these may become clickable links or breadcrumb references.

---

## Section 1: From Signup to First Sale

**Goal:** Get the user from zero to a completed first sale with the fewest concepts possible.

### 1.1 Creating an account

- **What:** Register your business and verify your phone number.
- **Where:** `/signup`
- **Steps:**
  1. Go to the **Sign Up** page.
  2. **Step 1 — Business & Admin:** Enter your company name (Dukarun checks availability), your name, phone number (this becomes your login), and optional email. Tap **Next**.
  3. **Step 2 — Store:** Enter your store name and address. Tap **Send OTP**.
  4. **Step 3 — Verify:** Enter the 6-digit code sent to your phone. Complete registration.
- **Note:** After signup, your business may be **pending approval**. You can log in and look around, but creating or editing anything is locked until approval completes.
- **Screenshot:** Step 1 form, Step 2 form, Step 3 OTP input.

### 1.2 Logging in

- **What:** Sign in with your phone number and a one-time code.
- **Where:** `/login`
- **Steps:**
  1. Go to **Login**, enter your phone number, and request an OTP.
  2. Enter the 6-digit code from your SMS.
  3. If you belong to more than one business, choose which one to work in.
- **Screenshot:** Login screen, OTP verification screen.

### 1.3 Understanding the Dashboard

- **What:** Your home screen — a snapshot of how the business is doing.
- **Where:** `/dashboard`
- **What you'll see:**
  - **Sales, Purchases, Expenses** — Totals for today, this week, or this month. Tap a card for a breakdown.
  - **Low stock alerts** — How many products are running low, with a link to view them.
  - **Quick stats** — Product count, number of users, average sale value, and margin.
  - **Recent activity** — A feed of the latest sales, purchases, and other actions.
- **Tip for users:** "Checking this page regularly — even a quick glance — helps you see what's selling, what needs restocking, and how the day is going."
- **Screenshot:** Full Dashboard on desktop and/or mobile with stats and one expanded category.

### 1.4 Creating your first product

- **What:** Add something to sell — a product or a service — so it appears on the Sell screen.
- **Where:** **Products** in the sidebar → **Create** (`/dashboard/products/create`)
- **Steps:**
  1. **Choose the type:** Product (physical goods) or Service (no stock needed, e.g. a haircut).
  2. **How it's sold** (products only): Measured (by weight, volume, etc.) or Discrete (by unit — bottles, packets, etc.).
  3. **Details:** Product name, optional description, barcode if you have one, measurement unit or size options, and variants (e.g. 1 kg, 2 kg).
  4. **Price and stock for each variant:** Set a selling price. For physical products, optionally set **opening stock** — the quantity you already have on hand.
  5. **Save.** The product appears in your catalog and on the Sell screen.
- **Screenshot:** Product type selector, "how sold" step, variant list with price and stock fields, final product in the product list.

### 1.5 Recording stock (what you have vs. what you buy)

- **What:** Two ways to get stock into the system — opening balance and purchases.
- **Opening balance:** When creating or editing a product (`/dashboard/products/create` or `/dashboard/products/edit/:id`), set the **stock on hand** per variant. Use this for inventory you already have (e.g. "I already have 50 bottles on the shelf").
- **Purchases:** Go to **Purchases** → **Create purchase** (`/dashboard/purchases/create`) to record stock you buy from a supplier. This is for ongoing restocking.
- **Plain-language tip for users:** "Use opening balance for what you already have. Use purchases when you buy new stock from a supplier."
- **Screenshot:** Product variant with stock field; Create purchase flow (supplier, items, quantities).

### 1.6 Making your first sale

- **What:** Use the Sell page to add items to a cart and complete a sale.
- **Where:** **Sell** in the sidebar (`/dashboard/sell`)
- **Steps:**
  1. **Add items** using one of:
     - **Camera** — Point at a product label or price card; Dukarun's AI suggests a match.
     - **Barcode** — Scan the product's barcode.
     - **Search** — Type the product name or code.
  2. In the confirmation popup, pick the variant and quantity, then add to cart.
  3. Open the **cart**, review items and total. Optionally attach a **customer**.
  4. **Checkout:** Choose a payment method (Cash, M-Pesa, or others your store has set up). Confirm — the sale is complete.
- **Important:** You need an **open shift** to complete checkout. If the Sell page shows a banner asking you to open a shift, tap it first.
- **Screenshot:** Sell screen showing camera/barcode/search, confirmation modal, cart with items, checkout with payment method selection.

### 1.7 A quick word on your numbers

- **What:** A short nudge on why checking stats matters.
- **Suggested copy:** "Your Dashboard (`/dashboard`) and Sales page (`/dashboard/orders`) show how much you've sold and what's popular. A quick look helps you restock the right things and spot trends. You'll find more detail in Section 3."

---

## Section 2: Customers, Credit, Payments & Admin

**Goal:** Cover customer setup, credit sales, receiving payments, and where to find admin and accounting tools.

### 2.1 Creating a customer

- **What:** Add a customer so you can track their purchases or give them credit.
- **Where:** **Customers** → **Create** (`/dashboard/customers/create`)
- **Steps:**
  1. Enter name, phone number, and optional email.
  2. Save. The customer can now be selected at checkout or when recording payments.
- **Note:** For anonymous walk-in sales, you don't need to create a customer — just sell without attaching one.
- **Screenshot:** Customer list, create form, customer selected at checkout.

### 2.2 Credit sales

- **What:** Let selected customers buy now and pay later, within a limit you control.
- **Steps:**
  1. **Create the customer** (if not already) — see 2.1.
  2. **Set credit:** Go to **Customers** → tap the customer → **Edit** (`/dashboard/customers/edit/:id`). Set a **credit limit** and **approve** them for credit. Optionally set a **credit duration** (days to pay).
  3. **Sell on credit:** On the **Sell** page (`/dashboard/sell`), add items, open cart, **select the customer**, and choose **Credit** as the payment method. Complete the order.
- **Note:** The customer's outstanding balance can't exceed their limit. Managing credit may require a specific permission.
- **Screenshot:** Customer edit with credit limit and approval toggle; Sell checkout with Credit payment.

### 2.3 Collecting credit payments

- **What:** Record payments from customers who owe you money.
- **Where:** You can do this from several places:
  - **Credit** page (`/dashboard/credit`) — See all outstanding balances, tap **Record payment** next to a customer.
  - **Customers** → tap the customer → **Record payment** (`/dashboard/customers/:id`).
  - **Sales** → tap an order → **Pay** (`/dashboard/orders/:id`).
- **Screenshot:** Credit page or customer detail with "Record payment" flow.

### 2.4 Troubleshooting common issues

| Problem | What to do |
|---------|-----------|
| **Can't log in / no OTP** | Double-check your phone number and try again. Make sure you have network signal. |
| **Everything is read-only** | Your business may be pending approval, or your subscription may have expired. Check with the owner, or go to **Admin** → **Subscription** (`/dashboard/admin/subscription`). |
| **Low stock / can't sell** | Check the product's stock at your location. Add stock by editing the product or recording a purchase (`/dashboard/purchases/create`). |
| **No credit option at checkout** | The customer needs to be approved for credit and within their limit. Edit their profile at **Customers** → **Edit** (`/dashboard/customers/edit/:id`). |
| **No payment methods showing** | An admin needs to set them up at **Admin** → **Payment Methods** (`/dashboard/admin/payment-methods`). |
| **"Permission denied"** | Some actions require specific permissions. Ask the store owner or admin to update your role at **Admin** → **Team** (`/dashboard/admin/team`). |

### 2.5 Admin options (for owners and admins)

These are available under **Admin** in the sidebar (`/dashboard/admin`). You need admin permissions to see this section.

#### Adding team members
**Where:** **Admin** → **Team** (`/dashboard/admin/team`)

Tap **Add** or **Create admin**, enter their details, and assign a role. The role determines what they can access.

#### Managing permissions
**Where:** **Admin** → **Team** (`/dashboard/admin/team`)

Tap a team member to change their role or toggle specific permissions (Sell, Products, Customers, Credit, Stock adjustments, Settings, etc.).

#### Setting up payment methods
**Where:** **Admin** → **Payment Methods** (`/dashboard/admin/payment-methods`)

Add or edit the options that appear at checkout — Cash, M-Pesa, bank transfer, or custom methods. You need at least one for checkout to work.

### 2.6 Accounting at a glance

**Where:** **Accounting** in the sidebar (`/dashboard/accounting`). Requires admin permissions.

| Tab | What it shows | Path |
|-----|--------------|------|
| **Ledger** | Your accounts and all financial transactions | `/dashboard/accounting/ledger` |
| **Expenses** | Record and view business expenses | `/dashboard/accounting/expenses` |
| **Transfers** | Move money between accounts (e.g. Cash → Bank) | `/dashboard/accounting/transfers` |

**Tip for users:** "You don't need to be an accountant to use this — the system records everything automatically as you sell and buy. The Accounting section is where you (or your accountant) can review and reconcile."

### 2.7 Product features worth knowing

A quick overview of Dukarun-specific features on the Sell page and product setup:

- **AI camera recognition** (`/dashboard/sell`) — Point your phone's camera at a product label; the app suggests a match. Gets better as the ML model learns your products.
- **Barcode scanning** (`/dashboard/sell`) — Scan a barcode to instantly find and add a product.
- **Measured vs. discrete products** (`/dashboard/products/create`) — Sell by weight/volume or by unit. Affects how quantity and stock are tracked.
- **Services** (`/dashboard/products/create`) — Track revenue for things like haircuts or repairs without worrying about stock.
- **Stock by location** — If you have multiple locations, stock is tracked separately for each one.
- **Offline-ready catalog** — Product data is cached so the Sell page still works when your internet is slow.

---

## Section 3: Going Further — Data, Suppliers & Advanced Features

**Goal:** Help users get more out of Dukarun with data, supplier management, stock adjustments, and optional features.

### 3.1 Using your data to make decisions

- **Dashboard** (`/dashboard`) — Check daily or weekly. See sales and purchases by period, low stock alerts, and recent activity. "A quick look helps you decide what to reorder and how the day went."
- **Sales** (`/dashboard/orders`) — Filter and search orders. See totals, payment status, and which customer bought what. Useful for disputes, returns, or simple reporting.
- **Payments** (`/dashboard/payments`) — See every payment — method, amount, and date. Helps with cash reconciliation and tracking who's paid.
- **Credit** (`/dashboard/credit`) — Total outstanding balances, per-customer breakdown, and credit limits. "Use this to follow up on payments and adjust limits."

**Tip:** "You don't need to be a numbers person to benefit — checking these screens regularly makes it easier to restock, collect money, and catch problems early."

### 3.2 Suppliers and purchases

- **Create a supplier:** **Suppliers** → **Create** (`/dashboard/suppliers/create`). Enter name, contact, and optional terms.
- **Record a purchase:** **Purchases** → **Create purchase** (`/dashboard/purchases/create`). Select supplier, location, add products and quantities. Stock increases immediately.
- **View purchase history:** **Purchases** (`/dashboard/purchases`). Tap any purchase to see items, totals, and payment status.
- **Pay a supplier:** From the purchase detail page (`/dashboard/purchases/:id`). Requires an open shift.
- **Screenshot:** Suppliers list, create purchase flow, purchase detail.

### 3.3 Stock adjustments

- **What:** Correct stock for reasons other than sales or purchases — damage, miscounts, stock takes.
- **Where:** **Stock Adjustments** in the sidebar → **Create** (`/dashboard/stock-adjustments/create`). Requires the **Manage Stock Adjustments** permission.
- **Steps:** Select location, product, and variant. Enter the reason and adjusted quantity. Submit.
- **Screenshot:** Stock adjustments list and create form.

### 3.4 Audit trail and notifications

- **Audit trail:** **Admin** → **Audit Trail** (`/dashboard/admin/audit-trail`). See a log of important actions — who changed what and when. Useful for owners who want oversight and accountability.
- **Notifications:** **Settings** → **Notifications** (`/dashboard/settings/notifications`). Configure alerts for things like low stock, payments, or team activity. Check the in-app notification bell for real-time updates.
- **Screenshot:** Audit trail list with filters; notification settings.

### 3.5 ML Model and AI recognition

- **Where:** **Admin** → **ML Model** (`/dashboard/admin/ml-model`)
- **What it does:** Shows the status of your store's AI model — whether it's training, ready to use, or needs attention. The model is trained on your specific products to improve camera recognition on the Sell page.
- **Tip:** If recognition is inaccurate, consider adding clearer product photos or retraining the model from this page.
- **Screenshot:** ML model status screen.

### 3.6 Multiple locations and cashier flow

- **Multiple locations:** If your business has more than one store or warehouse, each one is a separate location. Stock and sometimes sales are tracked per location. You can switch between locations using the company/location selector in the app header.
- **Cashier flow:** Some setups separate the roles of "salesperson" (creates the order) and "cashier" (takes the payment). If this applies to your store, you'll see relevant indicators on the Dashboard.
- **Screenshot:** Company/location switcher; dashboard with cashier status (if applicable).

### 3.7 Subscription and trial

- **Where:** **Admin** → **Subscription** (`/dashboard/admin/subscription`)
- **Trial:** New businesses may start with a free trial period with full access.
- **Subscription:** After the trial, a paid subscription keeps everything running. Check your status and upgrade from the Subscription page.
- **If your subscription expires:** You can still log in and **view** all your data, but you won't be able to create, edit, or sell until you renew.
- **Screenshot:** Subscription tab showing status and upgrade button.

---

## Additional sections to consider

- **Profile:** Changing your name, phone, or email (`/dashboard/profile`).
- **Support:** Link to the support page (`/support`) or contact page (`/contact`).
- **Glossary:** Simple definitions for terms like channel, variant, SKU, credit limit, outstanding balance, ledger, stock location, and OTP.
- **Printing:** If receipts or invoices can be printed, add a note under the Sell or Sales section.

---

## Screenshot checklist

| Section | What to capture |
|---------|----------------|
| 1.1 Signup | Step 1 form, Step 2 form, Step 3 OTP |
| 1.2 Login | Phone input, OTP input |
| 1.3 Dashboard | Full overview with stats and one expanded card |
| 1.4 Product create | Type selector, "how sold" step, variants with price/stock |
| 1.5 Stock | Product stock field; create purchase flow |
| 1.6 Sell | Sell screen (camera/barcode/search), confirm modal, cart, checkout |
| 2.1 Customer | Customer list, create form, customer at checkout |
| 2.2 Credit | Customer credit settings; Sell with credit payment |
| 2.3 Payments | Record payment flow |
| 2.4 Troubleshooting | Optional: error state or read-only message |
| 2.5 Team | Team tab, create admin, permission editor |
| 2.5 Payment methods | Settings → Payment Methods list + add/edit |
| 2.6 Accounting | Ledger overview, Accounts, Transactions, Reconciliation |
| 2.7 Product features | Sell (camera/barcode/search), Measured vs Discrete, ML status |
| 3.1 Stats | Dashboard, Sales list, Credit summary |
| 3.2 Suppliers | Suppliers list, create purchase, purchase detail |
| 3.3 Stock adjustments | Adjustments list + create form |
| 3.4 Audit/Notifications | Audit trail, notification settings |
| 3.5 ML model | ML model status |
| 3.6 Multi-location | Company/location switcher |
| 3.7 Subscription | Subscription status/upgrade |

---

## Implementation notes

- **Format:** Each main section (1, 2, 3) can be a separate page with sub-sections as headings, or one long scrollable page with anchors and a sticky nav.
- **Entry point:** Add a clear link to "Getting Started" from the Dashboard (e.g. a first-time banner), the help menu, or the footer.
- **Progressive disclosure:** Section 1 is enough for a first sale. Link to Sections 2 and 3 as "Next: Customers & Credit" and "Going Further."
- **Search:** Index all headings and key terms so users can jump to the right section.
- **Maintenance:** When a new feature is added, update the relevant section and the screenshot checklist.

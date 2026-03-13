# Dukarun — Onboarding & Reference Guide

This is the single source of truth for how Dukarun works. It covers everything from setting up your first product to daily sales, purchasing, credit, accounting, and store management. It follows the order a business naturally operates in and is written for business owners, their staff, customer support, and anyone who needs a clear understanding of the system.

---

## How Dukarun works (the big picture)

Before you can start selling, a few things need to be in place. Think of it as a chain — each step unlocks the next:

1. **Your business must be approved** — After you sign up, your business (called a "channel" in the system) goes through a short approval process. Until it's approved, you can log in and look around, but you won't be able to create or change anything.
2. **You need at least one product with a price** — Whether you sell physical goods or services, you need to add them to your catalog with a selling price before they can appear on the Sell screen.
3. **Physical products need stock** — If you sell items (not services), you need to record how many you have. You can do this when you first create the product ("opening stock") or by recording a purchase from a supplier.
4. **Open a shift before taking payments** — To complete a sale, pay a supplier, record an expense, or move money between accounts, you need an active cashier shift. The app will remind you if you try to do any of these without one.
5. **Credit sales need an approved customer** — To let a customer buy now and pay later, they must be set up in the system with a credit limit and approval.

**In short:** Sign up → Get approved → Add products (with prices and stock) → Open a shift → Start selling.

---

## Signing up and logging in

### Creating your account

1. Go to the **Sign Up** page (`/signup`).
2. **Step 1 — Business & Admin details:** Enter your company name (Dukarun checks if it's available), your first and last name, phone number (this is your login), and optionally your email. Tap **Next**.
3. **Step 2 — Store:** Enter your store name and address. Tap **Send OTP**.
4. **Step 3 — Verify:** Enter the 6-digit code sent to your phone via SMS. Complete registration.

After signing up, your account may be **pending approval**. You can log in and explore, but creating or editing anything is locked until approval is complete.

### Logging in

1. Go to the **Login** page (`/login`).
2. Enter your phone number and request an OTP.
3. Enter the 6-digit code from your SMS.
4. If you're linked to more than one business, choose which one to work in.

---

## The Dashboard (your home screen)

**Where:** `/dashboard` — this is the first screen you see after logging in.

The Dashboard gives you a snapshot of how your business is doing:

- **Sales, Purchases, Expenses** — See totals for today, this week, or this month. Tap a card to see a breakdown.
- **Low stock alerts** — Shows how many products are running low, with a link to view them.
- **Quick stats** — Number of products, users, average sale value, and margin.
- **Recent activity** — A feed of the latest sales, purchases, and other actions.

**Tip:** Checking your Dashboard regularly (even just a quick glance) helps you spot what's selling, what needs restocking, and how the day is going.

---

## Products

### Creating a product

**Where:** Go to **Products** in the sidebar → tap **Create** (`/dashboard/products/create`).

1. **Choose the type:**
   - **Product** — Physical goods you stock and sell (e.g. rice, soap, phone cases).
   - **Service** — Something you provide but don't stock (e.g. haircut, repair, delivery fee).

2. **Choose how it's sold** (for products only):
   - **Measured** — Sold by weight, volume, or another continuous measure (e.g. rice by the kg, fuel by the litre).
   - **Discrete** — Sold by unit (e.g. a bottle, a packet, a phone case).

3. **Fill in the details:** Product name, optional description, barcode (if you have one), measurement unit or size options, and variants (e.g. 1 kg, 2 kg, 500 ml).

4. **Set prices and stock for each variant:** Every variant needs a price. For physical products, you can also set **opening stock** — the quantity you already have on hand (see [Opening stock](#opening-stock) below).

5. **Save.** The product now appears in your catalog and on the Sell screen.

**Watch out for:**
- A product without a price can't be sold.
- A physical product with zero stock may trigger a warning or block the sale.

### Types of products explained

| Type | What it means | Example |
|------|--------------|---------|
| **Product (Discrete)** | Sold by whole units; stock is counted in pieces | Bottles, packets, phone cases |
| **Product (Measured)** | Sold by weight, volume, or length; stock can be fractional | Rice (kg), fuel (litre), fabric (metre) |
| **Service** | No stock tracked; you record revenue only | Haircut, repair, consultation |

### Opening stock

**What it is:** The inventory you already have when you first set up, or when you add a product that's already on your shelf.

**When to use it:** Use opening stock for items you already own. For new stock you buy from a supplier going forward, use **Purchases** instead (see [Purchasing from suppliers](#purchasing-from-suppliers)).

**Where:** When creating or editing a product (`/dashboard/products/create` or `/dashboard/products/edit/:id`), set the **stock on hand** for each variant. If you have multiple locations, make sure you pick the right one.

**Watch out for:**
- If you don't set opening stock and haven't recorded any purchases, the system thinks you have zero — and you may not be able to sell that item.
- Stock is tracked **per location**. Double-check you're looking at the right location.

---

## Opening a shift

**What it is:** A shift is your cashier session for the day (or any period). You **open** it when you start working and **close** it when you're done. Opening a shift is like opening the cash register.

**Where:** On the **Dashboard** (`/dashboard`), tap **Open shift**. On the **Sell** page (`/dashboard/sell`), if no shift is open, a banner at the top will prompt you to open one.

### What needs an open shift

| Action | Shift needed? |
|--------|:------------:|
| Complete a sale (take payment) | Yes |
| Pay a supplier | Yes |
| Record an expense | Yes |
| Transfer money between accounts | Yes |
| Add items to the cart / browse products | No |
| Create or edit products, customers, or suppliers | No |
| View reports, orders, or accounting | No |

### Closing a shift

When you close your shift, you'll do a **closing count** — entering how much cash (and other payment types) you actually have. The system compares this to what it expected based on the day's transactions, creating a **reconciliation** record. This helps you spot discrepancies.

**Watch out for:**
- If you see **"Open a session to record payments"**, it means you tried to take a payment without an open shift. Just open one and try again.

---

## Selling

**Where:** Tap **Sell** in the sidebar (`/dashboard/sell`).

### Making a sale — step by step

1. **Add items** to the cart using any of these methods:
   - **Camera** — Point your phone at a product label or price card. Dukarun's AI suggests a match. (Works best when the ML model is trained on your products.)
   - **Barcode** — Scan the product's barcode to find it instantly.
   - **Search** — Type the product name or code to find it.

2. In the confirmation popup, choose the **variant** (e.g. 1 kg vs 2 kg) and **quantity**, then add to cart.

3. Open the **cart** (tap the cart icon or floating button). Review items and the total. Optionally, attach a **customer** (useful for credit sales or tracking purchase history).

4. **Checkout:** Pick a payment method — Cash, M-Pesa, Credit, or whichever methods your store has set up. Confirm the payment and the sale is complete.

**Watch out for:**
- **Checkout is disabled?** You likely don't have an open shift. Open one from the Sell page banner or the Dashboard.
- **Credit option missing?** The selected customer isn't approved for credit, or they've hit their limit. See [Selling on credit](#selling-on-credit).
- **"Quantity not available"?** Not enough stock at your location. Add opening stock or record a purchase.
- **No payment methods showing?** An admin needs to set them up — see [Payment methods](#payment-methods).

---

## Customers

### Creating a customer

**Where:** Go to **Customers** in the sidebar → tap **Create** (`/dashboard/customers/create`).

Enter the customer's name, phone number, and optionally their email. Save.

Once created, you can select this customer at checkout to track their purchases or enable credit sales.

**Note:** For quick, anonymous sales (walk-in customers), you don't need to create a customer — just sell without attaching one.

**Where to find them:** The full list is at **Customers** (`/dashboard/customers`). Tap any customer to see their details, purchase history, and credit status.

### Selling on credit

Credit lets approved customers buy now and pay later, up to a set limit.

**Step 1 — Create the customer** (if you haven't already): **Customers** → **Create** (`/dashboard/customers/create`).

**Step 2 — Approve them for credit:** Go to **Customers** → tap the customer → **Edit** (`/dashboard/customers/edit/:id`). Set a **credit limit** (the maximum they can owe at any time) and **approve** them for credit. You can also set a **credit duration** (how many days they have to pay).

Alternatively, use the **Credit** page (`/dashboard/credit`) and tap **Manage** next to a customer.

**Step 3 — Sell on credit:** On the **Sell** page (`/dashboard/sell`), add items, open the cart, **select the credit-approved customer**, then choose **Credit** as the payment method. Complete the order — the amount is recorded as money they owe.

**Step 4 — Collect payments:** When the customer pays, record it from the **Credit** page (`/dashboard/credit`), or from the customer's profile under **Customers**, or against a specific order in **Sales** (`/dashboard/orders`). Their balance goes down accordingly.

**Frozen customers:** If a customer has an outstanding balance but their credit approval is removed, they're considered "frozen" — no new credit can be given, but you can still accept payments from them.

**Watch out for:**
- **Credit option not showing at checkout?** The customer isn't approved, has reached their limit, or is frozen. Edit their profile to fix this.
- **"Permission denied"?** Managing credit (approving customers, changing limits) may require a specific permission. Ask the store owner or an admin.

---

## Suppliers and Purchasing

### Creating a supplier

**Where:** Go to **Suppliers** in the sidebar → tap **Create** (`/dashboard/suppliers/create`).

Enter the supplier's name, contact details, and any payment terms. Save.

**Where to find them:** The full list is at **Suppliers** (`/dashboard/suppliers`).

### Recording a purchase (restocking)

**Where:** Go to **Purchases** in the sidebar → tap **Create purchase** (`/dashboard/purchases/create`).

1. Select the **supplier** you're buying from.
2. Choose the **stock location** where the items will be stored.
3. Add the **products and quantities** you're buying (and optionally unit cost, batch number, expiry date).
4. Confirm — the stock for those items at that location is increased immediately.

### Paying a supplier

When it's time to pay, open the purchase (`/dashboard/purchases/:id`) and use the payment option. **This requires an open shift** (see [Opening a shift](#opening-a-shift)).

**Watch out for:**
- **Can't record a supplier payment?** Open a shift first.
- **Supplier not appearing in the list?** Make sure they were created under **Suppliers**, not as a regular customer.

---

## Sales and Payments

### Viewing your sales

**Where:** Tap **Sales** in the sidebar (`/dashboard/orders`).

Here you'll find all your completed and pending orders. You can filter, search, and tap any order to see its details — items, totals, payment status, and the customer (if one was attached).

### Viewing payments

**Where:** Tap **Payments** in the sidebar (`/dashboard/payments`).

This shows all recorded payments — who paid, how much, which method (Cash, M-Pesa, etc.), and when. Useful for checking that payments match what you expect, especially at shift close.

---

## Accounting and Reconciliation

**Where:** Tap **Accounting** in the sidebar (`/dashboard/accounting`). This section is typically available to owners and users with the right permissions.

### What's inside

| Tab | What it shows | Path |
|-----|--------------|------|
| **Ledger** | Your accounts, balances, and all financial transactions | `/dashboard/accounting/ledger` |
| **Expenses** | Record and view business expenses (rent, transport, etc.) | `/dashboard/accounting/expenses` |
| **Transfers** | Move money between accounts (e.g. Cash → Bank) | `/dashboard/accounting/transfers` |

### Recording an expense

Go to **Accounting** → **Expenses** (`/dashboard/accounting/expenses`) → **Create expense**. Enter the amount, category, and a note. **Requires an open shift.**

### Inter-account transfers

Go to **Accounting** → **Transfers** (`/dashboard/accounting/transfers`) → **Create transfer**. Choose the "from" account, "to" account, and amount. **Requires an open shift.**

### Reconciliation

Reconciliation is how you make sure your records match reality.

- **When you open a shift** — You can enter your starting cash and account balances. This becomes your opening reconciliation.
- **When you close a shift** — You enter your actual closing balances. The system compares them to what it calculated from the day's transactions and flags any differences.
- **Manual reconciliation** — Go to **Accounting** → **Ledger** → **Reconciliation** tab → **Create manual reconciliation**. Use this to align your books with a real count at any time (e.g. end of week or month).

**Watch out for:**
- **Can't record an expense or transfer?** Open a shift first.
- **Missing closing reconciliation?** If a shift was closed without one (e.g. due to a past issue), there's a repair flow available — see the technical docs (`SHIFT_RECONCILIATION.md`).

---

## Store Administration

**Where:** Tap **Admin** in the sidebar (`/dashboard/admin`). Only visible to owners and users with admin permissions.

### General settings

**Path:** `/dashboard/admin/general`

Update your store name, address, and other business-level settings.

### Managing your team

**Path:** `/dashboard/admin/team`

- **Add a team member:** Tap **Add** or **Create admin**. Enter their name, phone, and email, then assign a **role** (which controls what they can see and do).
- **Edit permissions:** Tap a team member to change their role or toggle specific permissions (e.g. Sell, Products, Customers, Credit management, Stock adjustments, Settings).
- **Remove access:** Disable a team member's account if they no longer need access.

### Payment methods

**Path:** `/dashboard/admin/payment-methods`

Add or edit the payment options that appear at checkout — Cash, M-Pesa, bank transfer, or any custom method. Without at least one payment method, checkout won't work.

### Cashier shifts (history)

**Path:** `/dashboard/admin/shifts`

View all past and current shifts — who opened them, when they were closed, and the reconciliation results.

### Audit trail

**Path:** `/dashboard/admin/audit-trail`

A log of who did what and when. You can filter by action type, user, or date. Examples of what's tracked:

- Sales created or modified
- Payments received or allocated
- Credit approved or limits changed
- Products created, updated, or deleted
- Stock movements and adjustments
- Shifts opened or closed
- Team members invited or permissions changed
- Expenses and transfers recorded

### Subscription

**Path:** `/dashboard/admin/subscription`

Check your subscription status, trial period, or upgrade your plan. If your subscription expires, you can still log in and **view** your data, but you won't be able to create or change anything until you renew.

### ML Model (AI recognition)

**Path:** `/dashboard/admin/ml-model`

If you use the camera feature on the Sell page, this shows the status of your AI model — whether it's training, ready, or needs attention. The model is trained specifically for your store's products.

---

## Stock adjustments

**Where:** Tap **Stock Adjustments** in the sidebar (`/dashboard/stock-adjustments`). Requires the **Manage Stock Adjustments** permission.

Use this when you need to correct your stock for reasons other than a sale or purchase — for example, damaged goods, miscounts, or stock takes.

**Steps:**
1. Tap **Create** (`/dashboard/stock-adjustments/create`).
2. Select the location, product, and variant.
3. Enter the reason (e.g. "damaged", "stock take correction") and the adjusted quantity.
4. Submit — the stock on hand updates immediately.

---

## Approvals

**Where:** Tap **Approvals** in the sidebar (`/dashboard/approvals`). Only visible to users with the **Manage Approvals** permission.

Review and approve or reject pending actions that require oversight (e.g. large credit requests, special adjustments).

---

## Settings and Profile

### Notification settings

**Path:** `/dashboard/settings/notifications`

Configure how and when you receive alerts (e.g. low stock, payments, team activity).

### Your profile

**Path:** `/dashboard/profile`

Update your personal details — name, phone number, or email.

---

## Quick troubleshooting

| Problem | What's happening | How to fix it |
|---------|-----------------|---------------|
| **"Open a session to record payments"** | No shift is open | Open a shift from the Dashboard (`/dashboard`) or the Sell page banner |
| **Credit option missing at checkout** | Customer isn't approved for credit, has hit their limit, or is frozen | Go to **Customers** → edit the customer → approve and set a limit |
| **Everything is read-only / can't edit** | Business is pending approval, or subscription has expired | Check with the business owner, or go to **Admin** → **Subscription** (`/dashboard/admin/subscription`) |
| **"Quantity not available" / low stock** | Not enough stock at this location | Add opening stock (edit the product) or record a purchase |
| **No payment methods at checkout** | Payment methods haven't been set up | An admin needs to add them at **Admin** → **Payment Methods** (`/dashboard/admin/payment-methods`) |
| **Can't pay a supplier / record expense / create transfer** | No shift is open | Open a shift first, then try again |
| **Can't see certain menu items** | You don't have the right permissions | Ask the store owner or an admin to update your role at **Admin** → **Team** (`/dashboard/admin/team`) |
| **Sale completed but payment wasn't recorded** | Items were checked out without an open shift | Open a shift, then record payment against the order in **Sales** (`/dashboard/orders`) |

---

## Useful links (pages in the app)

| Page | Path | What you do there |
|------|------|-------------------|
| Dashboard | `/dashboard` | See your daily stats, open/close shifts |
| Sell | `/dashboard/sell` | Make sales (POS) |
| Products | `/dashboard/products` | Add, edit, and view your catalog |
| Sales (Orders) | `/dashboard/orders` | View and manage completed sales |
| Purchases | `/dashboard/purchases` | Record stock purchases from suppliers |
| Stock Adjustments | `/dashboard/stock-adjustments` | Correct stock for damage, miscounts, etc. |
| Customers | `/dashboard/customers` | Manage customers and credit |
| Suppliers | `/dashboard/suppliers` | Manage your suppliers |
| Payments | `/dashboard/payments` | View all payment records |
| Credit | `/dashboard/credit` | Manage credit balances and collect payments |
| Approvals | `/dashboard/approvals` | Review pending approvals |
| Accounting — Ledger | `/dashboard/accounting/ledger` | View accounts and transactions |
| Accounting — Expenses | `/dashboard/accounting/expenses` | Record business expenses |
| Accounting — Transfers | `/dashboard/accounting/transfers` | Move money between accounts |
| Admin — General | `/dashboard/admin/general` | Store-level settings |
| Admin — Team | `/dashboard/admin/team` | Manage users and permissions |
| Admin — Payment Methods | `/dashboard/admin/payment-methods` | Set up checkout payment options |
| Admin — Shifts | `/dashboard/admin/shifts` | View shift history |
| Admin — Audit Trail | `/dashboard/admin/audit-trail` | See who did what and when |
| Admin — Subscription | `/dashboard/admin/subscription` | Check or upgrade your plan |
| Admin — ML Model | `/dashboard/admin/ml-model` | AI recognition model status |
| Settings — Notifications | `/dashboard/settings/notifications` | Configure alerts |
| Profile | `/dashboard/profile` | Update your personal details |
| Sign Up | `/signup` | Create a new account |
| Login | `/login` | Log in to your account |

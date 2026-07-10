## Analytics, Credit & Ledger

This guide explains Dukarun’s **financial backbone** – how it tracks money, balances, and credit – in business language.

---

## What Problems This Solves

- Ensure **sales, purchases and payments** are recorded correctly without double entry in spreadsheets.
- Maintain accurate **customer and supplier balances**.
- Support **sell-on-credit** flows without losing control.
- Provide a clear foundation for **analytics and reporting**.

---

## Key Capabilities (with Origins)

- **Double-entry ledger per business** – Every financial operation posts balanced entries to a ledger scoped to a single business (channel).  
  **Origin:** Dukarun-Exclusive (see `LEDGER_ARCHITECTURE.md`).

- **Channel-specific chart of accounts** – Each business has its own accounts for cash, M‑Pesa, sales, purchases, AR, AP, etc.  
  **Origin:** Dukarun-Exclusive (see `CUSTOMER_PROVISIONING.md`).

- **Customer & supplier balances from ledger** – Customer and supplier balances are computed from ledger entries, not ad-hoc calculations.  
  **Origin:** Dukarun-Exclusive.

- **Credit approvals and limits** – Credit policies (who may buy on credit, up to how much) are enforced using credit flags and limits.  
  **Origin:** Dukarun-Exclusive (credit plugin + custom fields).

- **High-level dashboards & KPIs** – The dashboard presents key numbers (sales, inventory indicators) driven by backend services.  
  **Origin:** Dukarun-Enhanced (frontend dashboards backed by ledger-aware services).

---

## Double-Entry Ledger (Per Business)

### 1. Single Source of Truth

Per `LEDGER_ARCHITECTURE.md`, Dukarun treats the ledger as the **only** source of financial truth:

- Every financial action – sales, payments, purchases, adjustments – creates ledger entries.
- Each entry is **double-entry**:
  - Debits = Credits.
  - All entries are linked to a **channel** and usually a **customer or supplier**.

This ensures:

- Strong auditability.
- Reliable balances.
- A clean path to integrating with full accounting systems.

**Origin:** Dukarun-Exclusive.

---

### 2. Chart of Accounts per Channel

Each channel (business) has its own **chart of accounts**, including:

- Assets:
  - `CASH_ON_HAND`
  - `BANK_MAIN`
  - `CLEARING_MPESA`
  - `ACCOUNTS_RECEIVABLE` (customers who owe you)
- Liabilities:
  - `ACCOUNTS_PAYABLE` (suppliers you owe)
  - `TAX_PAYABLE`
- Income:
  - `SALES`
  - `SALES_RETURNS`
- Expenses:
  - `PURCHASES`
  - `PROCESSOR_FEES`
  - `CASH_SHORT_OVER`

During onboarding (see `CUSTOMER_PROVISIONING.md`), these accounts are created per channel, either automatically or via SQL scripts.

---

## Customer & Supplier Balances

### 1. How Balances Are Computed

In the ledger:

- **Customer balances** (Accounts Receivable) are computed from:
  - All entries in the `ACCOUNTS_RECEIVABLE` account for a given customer.
- **Supplier balances** (Accounts Payable) are computed from:
  - All entries in the `ACCOUNTS_PAYABLE` account for a given supplier.

The `outstandingAmount` custom field on the customer record is a **view** of this ledger data, not a standalone number.

**Interpretation:**

- For customers:
  - Negative outstanding amount: customer owes you money.
- For suppliers:
  - Positive outstanding amount: you owe the supplier money.

**Origin:** Dukarun-Exclusive ledger integration.

---

### 2. Why This Matters

Compared to spreadsheets or “total minus payments” in app logic:

- **No drift:** If you see a balance, it’s always reconcilable back to journal entries.
- **Safer automation:** Bulk adjustments, payments and refunds update the ledger, not random counters.
- **Easier auditing:** Your accountant can export journal entries and rebuild balances externally if needed.

---

## Credit Management

### 1. Credit Flags & Limits

Credit-related fields on the customer record (see `CUSTOMER_SUPPLIER_INTEGRATION.md` and `VENDURE_CUSTOM_FIELDS.md`):

- `isCreditApproved` – Boolean flag; only approved customers can buy on credit.
- `creditLimit` – Maximum allowed credit in base currency units.
- `outstandingAmount` – Current running balance from the ledger.

Available headroom is:

```text
availableCredit = creditLimit - abs(outstandingAmount)
```

The POS uses this to decide whether a **credit sale** is allowed at checkout.

**Origin:** Dukarun-Exclusive (credit plugin + ledger-aware validation).

---

### 2. Credit Checkout Behaviour

From a cashier’s point of view:

- If a customer is not credit-approved, or their headroom is insufficient:
  - The **credit payment option** will not be available (or will be blocked).
- If the customer is approved and has enough headroom:
  - The cashier can select “Pay on Credit”.
  - The ledger posts an entry increasing `ACCOUNTS_RECEIVABLE`.

From a finance point of view:

- All credit sales and repayments are traceable in the ledger.
- Adjusting credit limits and approvals is a controlled operation requiring specific permissions.

---

## Reporting & Dashboards

### 1. Operational Dashboards

The Dukarun dashboard (see `frontend/ARCHITECTURE.md`) surfaces operational KPIs such as:

- Total sales over a period.
- Stock summary.
- Low-stock alerts.
- Customer and supplier overviews.

These are fed by:

- Vendure queries for domain objects (products, orders, customers).
- Ledger-aware backend services for balances and summaries.

**Origin:** Dukarun-Enhanced (dashboard UX + ledger-backed services).

---

### 2. Export and Deep Analysis

For deeper analytics:

- You can query:
  - The admin GraphQL API for high-level data.
  - The ledger tables for journal entries (if you operate your own backend).
- Data can be exported to:
  - BI tools (Metabase, Superset, etc.).
  - Accounting tools via CSV or custom integrations.

While Dukarun ships with pragmatic dashboards, it intentionally keeps the underlying data model open for advanced usage.

---

## Reconciliation and SSOT consolidation

Because the ledger is the single source of truth, reconciliation makes sure operational records consolidate into it cleanly.

### What consolidation means

- Every sale, payment, purchase, and adjustment posts to the ledger.
- Customer and supplier balances, cash accounts, and reconciliation expected values are all read from the ledger.
- If an operational record and the ledger disagree, reconciliation picks the authoritative side and posts the adjustment needed to create one consistent view.

### Common reconciliation tasks

- **Order reconciliation**: choose to trust the ledger or trust the order model. Dukarun posts the adjustment needed to bring them into agreement.
- **Purchase reconciliation**: same choice for supplier purchases and accounts payable.
- **Balance alignment**: post a ledger adjustment to keep a customer or supplier balance consistent with the ledger.
- **Shift reconciliation backfill**: safely create a missing closing reconciliation for a cashier session. Running it again returns the existing record.
- **Divergence scans**: super-admin tools confirm inventory, accounts receivable, and accounts payable match the ledger and list any mismatch for consolidation.

These tools are meant for finance users, support staff, and operators. Daily users do not need them unless something looks wrong.

---

## How to Use & Configure (Workflows)

### A. Onboarding a Channel’s Ledger

**Who:** Dukarun ops or technical implementer.

1. After creating a new channel, ensure the **chart of accounts** is initialised:
   - Use the automated account initialisation if available.
   - Or run the SQL snippets from `CUSTOMER_PROVISIONING.md`.
2. Verify that:
   - Required accounts exist for the channel.
   - No “missing accounts” errors appear when transactions run.

Once set, all future financial operations will use these accounts.

---

### B. Approving a Customer for Credit

**Who:** Finance / back office with appropriate permissions.

1. Open the customer record in the dashboard.
2. In the **Financial / Credit** section:
   - Turn on **Credit Approved**.
   - Set a realistic **Credit Limit**.
3. Save.

From then on:

- The POS checks this flag and limit when attempting a credit sale.
- The ledger ensures that sales and payments are correctly recorded.

---

### C. Reviewing Customer & Supplier Balances

**Who:** Finance, owners.

1. Navigate to **Customers** or **Suppliers** list in the dashboard.
2. Look at the **Outstanding Amount** column:
   - Negative: customer owes you.
   - Positive: you owe supplier.
3. For more detail:
   - Open the individual record for more context.
   - Use external tools (where you have access) to query ledger entries for a deep audit.

---

### D. Reconciling Payments

**Who:** Finance / accounting.

1. For **customer payments**:
   - Record payments in Dukarun (cash, MPesa, etc.).
   - The ledger reduces `ACCOUNTS_RECEIVABLE` and updates appropriate cash accounts.
2. For **supplier payments**:
   - Record supplier payments via dedicated flows.
   - The ledger reduces `ACCOUNTS_PAYABLE` and updates cash/bank accounts.
3. Reconcile with:
   - External bank statements.
   - Paystack and M‑Pesa reports.
4. If an order, purchase, or balance no longer matches the ledger:
   - Use the reconciliation tools in the super-admin reconciliation UI.
   - Choose to trust the ledger or the operational record, then apply the adjustment so the ledger stays the single source of truth.

Because all movements go through the ledger, reconciling is a matter of matching journal entries to external statements.

---

## Limitations & Notes

- **Not a full ERP yet:** Dukarun’s ledger is robust but intentionally narrow in scope – it focuses on POS-related transactions and direct integrations.
- **Historical migration:** Moving legacy transaction history into the ledger may require custom migration work and careful reconciliation.
- **Reporting breadth:** Built-in dashboards are intentionally focused; broad BI and multi-entity financial reports are best handled by external tools connected to the underlying data.

---

## Vendure vs Dukarun: What’s What

- **Vendure Core**
  - Provides the base commerce entities (orders, customers, products).
  - Does not ship with a full ledger system.

- **Dukarun-Enhanced**
  - Integrates commerce events with financial posting services.
  - Ensures that core operations (orders, payments) are ledger-aware.

- **Dukarun-Exclusive**
  - The entire double-entry ledger design and implementation.
  - Per-channel chart of accounts and account initialisation.
  - Credit plugin and credit-limited checkout enforcement.
  - Financially-aware dashboards in the Dukarun frontends.

# Dashboard Sidebar Navigation

This document describes the dashboard sidebar navigation structure and how to extend it.

## Architecture

The sidebar uses a **flat list** with optional section labels (no collapsibles):

- **Overview** — First link
- **Nav sections** — Optional section labels (Finance, People) with items
- **Nav items** — Links; all share the same compact row style
- **Footer** — Segregated at bottom: Settings link, Company selector, Help, version

### Key Files

| File | Purpose |
|------|---------|
| `frontend/src/app/dashboard/layout/nav.types.ts` | `NavIcon`, `NavItem`, `NavSection` types |
| `frontend/src/app/dashboard/layout/dashboard-layout.component.ts` | `navSections()` computed, `overviewItem`, `hasSettingsForFooter()` |
| `frontend/src/app/dashboard/layout/dashboard-layout.component.html` | Sidebar template (flat list + footer with Settings) |
| `frontend/src/app/dashboard/components/shared/nav-icon.component.ts` | SVG icon renderer per `NavIcon` |

## Data Model

### NavSection

```ts
interface NavSection {
  label?: string;   // Optional section label (e.g. "Finance")
  items: NavItem[];
}
```

### NavItem

```ts
interface NavItem {
  label: string;
  icon: NavIcon;
  route: string | string[];
  queryParams?: Record<string, string>;
  visible?: () => boolean;
}
```

### NavIcon

Union type: `overview`, `sell`, `sales`, `payments`, `products`, `credit`, `customers`, `suppliers`, `purchases`, `accounting`, `stock-adjustments`, `settings`, `admin`, `upgrade`, `approvals`.

## Current Sidebar Structure

| Order | Section | Items |
|-------|---------|-------|
| 1 | — | Overview |
| 2 | Operations | Sell, Products, Sales, Purchases, Stock Adjustments |
| 3 | Finance | Payments, Credit, Accounting, Approvals |
| 4 | People | Customers, Suppliers |
| 5 | — | Admin, Upgrade (if trial) |
| Footer | — | Settings (when `hasUpdateSettingsPermission`), Company selector, Help |

- **Stock Adjustments**: `visible: hasManageStockAdjustmentsPermission`
- **Credit**: `visible: hasCreditManagementPermission`
- **Accounting**: `visible: hasUpdateSettingsPermission` — `/dashboard/accounting`
- **Approvals**: `visible: hasManageApprovalsPermission`
- **Admin section**: Only when `hasUpdateSettingsPermission`
- **Upgrade**: `visible: isTrialActive`
- **Settings**: In footer, only when `hasUpdateSettingsPermission`

## Routes

| Sidebar Item | Route |
|--------------|-------|
| Overview | `/dashboard` |
| Sell | `/dashboard/sell` |
| Products | `/dashboard/products` |
| Sales | `/dashboard/orders` |
| Purchases | `/dashboard/purchases` |
| Stock Adjustments | `/dashboard/stock-adjustments` |
| Payments | `/dashboard/payments` |
| Credit | `/dashboard/credit` |
| Accounting | `/dashboard/accounting` |
| Approvals | `/dashboard/approvals` |
| Customers | `/dashboard/customers` |
| Suppliers | `/dashboard/suppliers` |
| Admin | `/dashboard/admin` |
| Upgrade | `/dashboard/admin/subscription` |
| Settings (footer) | `/dashboard/settings` |

## Settings

- **Settings** (`/dashboard/settings`): Tabs — Notifications, Test Notifications. In footer with company selector.

## Accounting

- **Accounting** (`/dashboard/accounting`): Layout tabs — Ledger, Expenses, Inter-account transfers. Default redirect: `ledger`. `/dashboard/expenses` redirects to `accounting/expenses`.
- **Ledger** view (`/dashboard/accounting/ledger`): Internal tabs (query param) — Overview, Accounts, Transactions, Reconciliation.

## Admin

- **Admin** (`/dashboard/admin`): Tabs — General, Shifts, Audit Trail, Subscription, ML Model, Payment Methods, Team.

## Adding a New Nav Item

1. **Add icon** (if new): In `nav.types.ts`, extend `NavIcon`. In `nav-icon.component.ts`, add a `@case` for the new icon.
2. **Add item**: In `dashboard-layout.component.ts`, add to the appropriate section in `navSections`.
3. **Footer items**: Settings link is in the footer template; use `hasSettingsForFooter()` for visibility.

## Sync Process (for future refactors)

1. **Types**: Update `nav.types.ts` — add/remove `NavIcon`, adjust `NavSection`/`NavItem`.
2. **Icons**: Add/remove `@case` in `nav-icon.component.ts`.
3. **Data**: Update `navSections()` in `dashboard-layout.component.ts`.
4. **Template**: HTML iterates `navSections()`; filter items with `@if (item.visible === undefined || item.visible())`.
5. **Footer**: Settings and company selector live in the Sidebar Footer block.
6. **Routes**: Ensure routes match `app.routes.ts`.

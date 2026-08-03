# Transaction workflows

These workflows are database transactions. Angular collects intent and displays results; it
does not insert inventory, payments, or journal lines directly.

## Proformas

`delete_proforma` accepts only a tenant-owned order whose status is `draft`. It deletes the
non-posting order and its cascaded lines, and removes any pending below-wholesale approval that
would otherwise point at the deleted document. Completed and parked orders are never eligible;
they use the controlled reversal or settlement workflows instead. Deleting a proforma does not
require an open cashier session because it has no stock, payment, or ledger effect.

## Product opening stock

`create_catalog_product` creates the family, variants and optional opening stock atomically.
Each positive opening quantity creates an inventory batch and movement. Opening value posts
`DR INVENTORY / CR OPENING_BALANCE_EQUITY`. Services and non-tracked goods reject opening
stock, fractional quantities follow the variant setting, and stock locations are tenant scoped.

## Purchases

- `save_purchase_draft` stores editable intent and has no stock, AP, cash, or ledger effect.
- `confirm_purchase_draft` calls the same receiving path as an immediate purchase and only
  marks the draft confirmed if receiving and accounting succeed.
- `record_purchase` retains purchase lines, receiving location, batch/expiry metadata, notes,
  reference, and purchase date. It creates batches, movements and the balanced journal.
- `record_purchase_with_prices` validates optional wholesale/retail changes first, posts the
  purchase through `record_purchase`, and updates only the selected variant prices in the same
  transaction. Drafts retain these choices and use the same path when confirmed.
- `record_purchase_with_payment` and `confirm_purchase_draft_with_payment` accept the initial
  amount paid. Zero records credit, the full total records paid now, and an in-between amount
  records a credit purchase plus its allocated supplier payment atomically.
- `pay_purchase` allocates payment to one purchase; `pay_supplier` remains the oldest-first
  supplier-level shortcut.

`supplier_variant_performance` derives weighted average, latest and range costs from durable
purchase lines. It powers supplier comparisons without maintaining a second mutable score.
Suppliers are archived rather than deleted because purchases, inventory batches and journal
history retain their identity. Archiving is blocked while AP or an open purchase draft exists.

Paid purchases and supplier payments require an open cashier session at the journal boundary.
Credit purchases do not move money and remain available with the till closed.

## Customer credit

`post_customer_payment` accepts one receipt and allocates it oldest-outstanding-order first in
one transaction. Per-order allocation remains available. Statements are built from credit sales,
payments, reversals and adjustments. Refunds, reversals and balance corrections remain explicit,
permissioned RPCs with journal provenance.

## Platform operations

The super-admin Operations page exposes pending registrations, outbound delivery failures,
membership totals and the invariant count for unbalanced journals. `platform_broadcast` creates
one company-wide in-app notification for every approved company. Both operations RPCs require a
platform-admin JWT claim.

## Feature entitlements

Subscription tiers expose two separate contracts: boolean `features` answer whether a capability
exists, while numeric `limits` cap its usage. `current_entitlements` is the shared frontend read
model; it includes the tier, feature map, limits and current usage. UI gating is explanatory only:
write RPCs enforce subscription state, feature availability, permissions and limits inside the
database transaction.

Multiple stock locations use the `multipleLocations` feature and `maxStockLocations` limit. Trial
keeps its provisioned default location and may maintain it, but cannot create another. Location
creation, editing, default selection and deletion live in Settings. Locations carrying stock or
purchase history cannot be deleted.

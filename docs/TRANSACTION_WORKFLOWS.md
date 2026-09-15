# Transaction workflows

These workflows are database transactions. Angular collects intent and displays results; it
does not insert inventory, payments, or journal lines directly.

## Proformas

`delete_proforma` accepts only a tenant-owned order whose status is `draft`. It deletes the
non-posting order and its cascaded lines, and removes any pending below-wholesale approval that
would otherwise point at the deleted document. Completed and parked orders are never eligible;
they use the controlled reversal or settlement workflows instead. Deleting a proforma does not
require an open cashier session because it has no stock, payment, or ledger effect.

## Product creation, packs, and opening stock

The product editor calls `save_catalog_product_units(p_product, p_variants, p_client_ref)`. The
aggregate saves the product, variants, pack definitions, photo reference, categories, VAT treatment,
and optional opening stock in one database transaction. The existing catalogue creation/update
helpers run inside it. Product and pack edits require `ManageStockAdjustments`; category and VAT
treatment writes also enforce their existing `ManageCatalog` checks.

`p_client_ref` is a UUID scoped to the company. `catalog_save_requests` retains the request and
result, so retrying an identical save does not duplicate a product or opening stock. Reusing the
reference with a different payload raises `idempotency_conflict`. Image uploads retain the same
upload identity on retry; storage cleanup cannot delete an image currently attached to a product.

Each variant has a named `stock_unit`. A `variant_packs` row belongs to that variant and contains a
name, immutable whole `units_per_pack` greater than one, optional independent `sale_price`, optional
barcode, and active flag. Packs require whole-quantity goods. A null selling price permits buying
but excludes the pack from selling. Retirement preserves the identity used by completed documents
and queued transactions. Only active packs reserve their barcode, so replacements can reuse a
retired code. Active pack and effective base-variant barcodes cannot collide.

Opening quantities are sent in stock units. The editor converts whole opening packs plus loose
units before submitting. Each positive quantity creates a batch and movement. `opening_total_cost`
preserves exact acquisition value; rounded `opening_unit_cost` is only a per-stock-unit estimate.
Opening value posts `DR INVENTORY / CR OPENING_BALANCE_EQUITY`, with no supplier invoice or payment.
Services and non-tracked goods reject opening stock, fractional quantities follow the variant
setting, and stock locations are tenant scoped. Opening stock is only accepted for new variants.

The operator instructions are in [Creating a product](learning-platform/gitbook-import/products/creating-a-product.md)
and [Setting up and using packs](learning-platform/gitbook-import/products/using-product-packs.md).

## Sales, held drafts, and offline replay

Sale lines carry `pack_id`, `units_per_unit`, `expected_unit_price`, and `price_source` alongside
quantity and price intent. `resolve_transaction_unit` validates the active variant, whole pack
quantity, and pack ownership; `resolve_sale_units` checks current pricing and conversion. An
ordinary unit uses retail or authorized wholesale pricing. A pack uses its own selling price and
price floor, independently of the wholesale equivalent for its contents.

Cart lines have distinct IDs so individual units and multiple packs of one variant can coexist.
Their combined `quantity * units_per_unit` competes for the same location stock. Changing a cart
line's unit resets its price to the configured value and removes its custom-price adjustment.
Opening the unit editor loads the current variant, packs, and location stock online, or uses the
latest catalog snapshot offline. The existing line keeps its price and conversion until the
cashier confirms the edit. Confirmation uses the refreshed stock for the selected line and its
sibling selling units.

`order_lines`, `purchase_lines`, and `tax_document_lines` retain `pack_id`, `unit_name`,
`stock_unit_name`, and `units_per_unit`. Their generated `stock_quantity` drives inventory and
quantity analytics; document quantities and totals remain in the selected transaction unit.
Completed unit snapshots cannot be rewritten by later catalogue changes. Fiscal integration
envelopes express quantities in base stock units and preserve the exact document totals.

`save_draft` rejects legacy payloads that omit conversion metadata when replacing a pack-bearing
draft. Checkout also enforces this in `prepare_sale_order_core`, before creating a replacement
order and deleting the source draft. The source is locked for the check. The idempotency lookup
runs first, allowing a successful checkout to be retried after its source draft has been deleted.
The shared core covers immediate, cashier, fulfillment, and offline checkout paths that replace a
draft.

Sales acquire the shared company `catalog-units` advisory lock before locking a source draft or
resolving variant/pack rows. Catalog and purchase writers acquire the exclusive lock before their
row locks. Sales can resolve concurrently, while a catalog edit waits without holding the cache
journal needed by an in-flight sale. Legacy product, price, barcode, and workbook RPCs follow the
same order; row triggers alone cannot establish it because an UPDATE has already locked its row.

Offline carts and outbox entries retain pack identity, conversion, and expected price. A changed
price or unavailable pack can reject replay instead of silently repricing money already collected.
Queued sales remain distinct from completed server transactions; review their status in Pending
sync. Reopening a held sale checks current pack availability, prices, and total stock demand.

`complete_order_core` consumes FIFO using stock quantities and persists each line's COGS. A full
refund with return-to-stock restores the original movement quantities and exact acquisition costs,
including multiple lines that consumed the same batch.

## Purchases

- `save_purchase_workspace_draft` stores receiving, invoice, price-basis, expense, and settlement
  intent. Saving has no stock, AP, cash, or ledger effect. `save_purchase_draft_complete` resolves
  pack definitions and snapshots the selected buying units into the draft.
- `finalize_purchase_draft` and `finalize_purchase_draft_core` revalidate intent, call
  `record_purchase_complete_core`, apply account payments or supplier advances, and mark the draft
  confirmed only if the whole transaction succeeds. Compatibility RPCs such as
  `record_purchase_complete` and `record_purchase_with_prices` feed the same aggregate.
- Each purchase line's quantity and unit cost refer to the selected buying unit. The last explicit
  input (`value_source`: `unit` or `total`) determines its value. A total-authoritative line keeps
  the exact invoice amount; batch `original_cost`/`remaining_cost` preserve the recognized value
  through FIFO rather than reconstructing it from rounded per-piece costs.
- `new_wholesale_price` and `new_retail_price` refer to a stock unit. `new_pack_sale_price` refers
  to the whole selected pack. Updates require `ManageStockAdjustments` and apply on confirmation.
  Conflicting prices for a shared variant or pack reject the purchase. Supplier cost is an
  independent input, never derived from these selling prices.
- Purchase-associated expenses post in the same transaction. Supplier-bill expenses increase the
  invoice/AP total; separately paid expenses credit their selected asset account immediately.
  Both debit `EXPENSES`, remain linked to the purchase, and never affect product-cost intelligence.
- Purchase reversal requires the received stock and its full original cost to remain available.
  The check compares batch remaining quantity to the purchase line's `stock_quantity`, so a
  two-box purchase is compared with its full contents, not the document quantity of two.
- `pay_purchase` allocates payment to one purchase; `pay_supplier` remains the oldest-first
  supplier-level shortcut.

`supplier_variant_performance` derives weighted average, latest and range costs per stock unit
from durable purchase lines. It powers supplier comparisons without maintaining a second mutable score.
Suppliers are archived rather than deleted because purchases, inventory batches and journal
history retain their identity. Archiving is blocked while AP or an open purchase draft exists.

Paid purchases and supplier payments require an open cashier session at the journal boundary.
Credit purchases do not move money and remain available with the till closed.

### Purchase and catalogue lock order

Every purchase path takes the company `catalog-units:` transaction advisory lock before locking
draft, variant, or pack rows. This includes ordinary receipts with no selling-price changes, draft
save/edit, and confirmation of an existing draft. Receiving still emits catalogue stock changes,
so taking unit locks first can deadlock with a product editor holding catalogue cache-journal locks.
The workspace and finalizer wrappers acquire the lock before selecting the draft `FOR UPDATE`;
the internal receivers retain the same order for direct callers. Transactions for different
companies use different lock keys.

## Catalogue cache, workbooks, and storefront

- `catalog_pack_definitions` hydrates pack metadata into variant rows used by the shared catalogue
  cache, search, product editing, and purchasing. Pack writes notify the existing variant cache
  journal. Legacy cached rows without pack metadata cannot establish unique offline barcode matches.
- `resolve_catalog_selling_unit` returns the variant and an explicit `selected_pack_id`; scanning
  a pack adds that unit directly. Automatic barcode assignment remains base-variant-only.
- Version 6 product workbooks add a **Packs** sheet. `apply_catalog_workbook_units` validates
  `expected_packs` against current definitions and atomically applies pack, catalogue, stock, and
  batch changes. Pack-only updates are supported. Omitted pack rows preserve definitions;
  `active=false` retires them. New products need a fresh export before pack rows can reference them.
- `new_remaining_value_kes` becomes `new_remaining_cost` for an open-batch correction. The exact
  value applies to remaining stock before counted additions; consumed COGS stays unchanged. Version
  5 workbooks remain readable without the new optional sheets and fields.
- `storefront_product_units` extends the existing public visibility boundary with stock-unit names
  and active sellable packs. The API exposes price and availability, excluding cost, wholesale,
  barcodes, and exact stock. Public baskets distinguish variant-plus-pack identities; WhatsApp
  messages identify the unit and estimated total. They do not reserve stock or post a sale.
- The published `storefront-v1.yaml` uses JSON syntax, a YAML-compatible representation. The
  formatter is configured to preserve JSON because the contract test parses it with `JSON.parse`.

Apply the pack migrations through `0171_sale_catalog_lock_order` before releasing the
corresponding clients. Baseline historical lines default to a conversion factor of one. Regression
coverage lives in `0120_product_packs.test.sql`, `packs.concurrency.spec.mjs`, the cart/product/purchase
component tests, and the storefront API contract tests.

## Customer credit

`post_customer_payment` accepts one receipt and allocates it oldest-outstanding-order first in
one transaction. Per-order allocation remains available. Statements are built from credit sales,
payments, reversals and adjustments. Refunds, reversals and balance corrections remain explicit,
permissioned RPCs with journal provenance.

## Platform operations

The super-admin Operations page exposes pending registrations, outbound delivery failures,
membership totals and the invariant count for unbalanced journals. Platform communications use
the Communications draft, review and launch flow; Operations links there instead of exposing a
review-bypassing broadcast action. Operations and communications RPCs require a platform-admin
JWT claim.

## Feature entitlements

Subscription tiers use typed boolean capability columns and nullable integer quota columns.
`current_entitlements` is the shared frontend read model; it includes the tier, feature map, limits
and current usage. UI gating is explanatory only: write RPCs enforce subscription state, feature
availability, permissions and limits inside the database transaction. Trial is a subscription
status over the Standard tier, not a separate capability tier.

Multiple stock locations use the `multipleLocations` feature and `maxStockLocations` limit.
Location creation, editing, default selection and deletion live in Settings. Locations carrying
stock or purchase history cannot be deleted.

The other feature keys are `staffPerformance` and `commissions`. Staff performance also requires
the user's `ViewStaffPerformance` permission. Commissions require the tier feature, the company's
Settings opt-in, and the user's `ManageCommissions` permission. The supported numeric limits are
`maxTeamMembers`, `maxProducts` (active variants), `maxStockLocations`, `maxOrdersPerMonth`
(non-voided sales), and `smsPerPeriod`. A null limit is unlimited; zero prevents new usage.

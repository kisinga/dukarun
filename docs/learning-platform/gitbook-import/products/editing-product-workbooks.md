# Editing products, packs, and stock in a workbook

Use an exported product workbook to review several catalogue changes together. Start with a fresh
export from the shop and stock location you intend to update. Keep the original workbook as a
reference and edit a copy.

## Products and stock

In **Products & Stock**, retail and wholesale prices refer to one stock unit. Stock quantities are
also in stock units, even when the product can be sold in packs. For example, two trays of 30 eggs
must be entered as 60 eggs in a stock-count column.

Edit the intended yellow input cells. The linked latest-batch fields control buying cost, batch
number, and expiry. For a stock increase, supply the required latest-batch cost so Dukarun can
value the added units. Review the upload preview for any product or variant disable actions before
applying it.

## Packs

The **Packs** sheet lists whole-quantity goods and their existing packs. You can edit a pack name,
selling price, barcode, or active status. Prices are whole KES for the entire pack. Leave the
selling price blank to make it purchase-only.

- To add the first pack, fill the blank pack row for the variant.
- To add another pack, copy a row for that variant and clear the copied `pack_id`. This identity
  column is hidden in the export; temporarily unhide it when making a new row. Preserve
  `variant_id` and `expected_packs`.
- To retire a pack, set `active` to `FALSE`. Deleting pack rows preserves the existing packs.
- Existing `units_per_pack` values cannot change. Retire the old pack and add a replacement.
- Create a new product first, then download a fresh workbook before adding its packs. Pack rows
  need an existing variant identity.

Keep the original identity and baseline columns intact. They let Dukarun reject stale pack edits
instead of overwriting a later change made by another member of staff. Use the product editor to
change a stock-unit name on its own.

## Exact remaining stock value

If acquisition cost does not divide evenly per stock unit, enter the exact remaining batch value
in `new_remaining_value_kes`. Use the main sheet for the latest batch or **Batches** for another
open batch. The value replaces the calculation for stock already remaining; any additional counted
units are valued separately using the entered buying price.

For example, 100 tablets bought for KES 755 must retain a total value of KES 755, even if the
displayed per-tablet cost rounds to KES 8. A value correction changes remaining inventory value
and posts the difference. It does not rewrite the cost of goods already sold.

## Review and apply

1. Save the workbook, then open **Upload edited workbook** in Dukarun.
2. Check the preview for prices, stock, packs, batches, new products, and disable actions.
3. Resolve all errors and conflicts. If the catalogue or stock changed after export, download a
   fresh workbook and reapply the intended edits.
4. Choose **Apply workbook** and check the updated product and location stock.

Pack-only edits can be applied without an unrelated price or stock change. The submitted changes
apply together; a rejected pack, stock, or price change does not leave the other edits half-applied.
Your role needs catalogue management access, plus stock-adjustment access for packs or stock
changes. Batch-value corrections also require financial access.

See [Setting up and using packs](using-product-packs.md) for buying, selling, and counting examples.

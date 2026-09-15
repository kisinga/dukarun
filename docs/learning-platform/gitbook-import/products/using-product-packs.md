# Setting up and using packs

A pack is a named group of whole stock units belonging to one variant. For example, one egg is the
stock unit and a tray contains 30 eggs. A tray and a single egg draw from the same stock balance.
Use a separate variant when the items need separate stock, such as different colours or sealed
package sizes that you do not break into individual units.

## Configure a pack

1. Create or edit the product and open **Selling & stock**.
2. Select a physical-good variant with fractional quantities turned off. Give its stock unit a
   clear name, such as `egg`.
3. Choose **Add pack**, enter a name such as `Tray`, and set **egg per pack** to `30`.
4. Enter the **Selling price per pack (KES)**, or leave it blank if the pack is only used for buying.
5. Enter a **Pack barcode** if you want scanning to select this exact pack. Give each active selling
   unit its own barcode.
6. Save the product.

The pack price is independent of retail and wholesale prices for a single unit. With retail at
KES 20 per egg and wholesale at KES 17, a tray may have its own fixed price of KES 480. The displayed
per-unit price and comparison with wholesale are information only; they do not set the pack price.

You can change a pack's name, price, or barcode later. Its contents are fixed after saving. Use
**Remove** to retire a saved pack, then add a replacement with the new contents. Old documents keep
their original quantities and unit labels. A replacement may reuse a retired pack's barcode.

## Buy and sell using the same stock

| Action                            | Quantity entered      | Effect on stock  |
| --------------------------------- | --------------------- | ---------------- |
| Receive two trays of 30 eggs      | 2 trays               | Adds 60 eggs     |
| Sell one tray                     | 1 tray                | Removes 30 eggs  |
| Sell three individual eggs        | 3 eggs                | Removes 3 eggs   |
| Count two trays and one loose egg | 2 trays + 1 loose egg | Count is 61 eggs |

In **Purchases**, choose the **Buying unit** before entering quantity and cost. Changing the buying
unit clears the previous cost and total so you can enter the supplier's cost for that unit. Buying
cost is never inferred from the pack selling price.

In **Sell**, choosing a product with sellable packs opens **Sell as**. Choose the single unit or a
pack. A pack barcode adds that pack directly. Packs and individual units appear as separate sale
lines, and their combined demand must fit the stock at the current location. With 29 eggs left,
you can sell individual eggs but cannot sell a 30-egg tray.

Use **Change selling unit** on a cart line to change the unit and review its quantity. Dukarun
preserves the equivalent stock quantity where possible. If it does not make a whole number of
packs, enter a new quantity. Changing units uses the configured price and clears any previous
custom price. Pack price adjustments cannot go below the configured pack price in the Sell screen.

## Counts, transfers, and storefront orders

Stock adjustments and transfers offer **Count in** when packs exist. Enter whole packs and loose
units, then check the displayed total. The saved count or transfer always uses stock units.

On the public product page, customers choose **Buy as** and a quantity. The basket and WhatsApp
message include the pack name, contents, and estimated price. This is an order enquiry; stock and
payment are recorded when the shop completes the sale. Packs with no selling price are hidden.

## Held sales and offline work

Held sales are checked against current prices, active packs, and combined stock when reopened.
Review any warnings before checkout. Completed receipts keep the unit and price used for that sale.

Offline carts and queued sales retain the chosen pack and its conversion. Refresh the catalogue
while connected before relying on newly added pack barcodes offline. If a pack is retired or its
price changes before a queued sale syncs, the sale may need attention in **Pending sync**; retrying
does not change its recorded intent. Do not treat a queued sale as a server-confirmed transaction.

If an older app asks you to reopen it before editing or checking out a pack sale, finish other work
and reopen the app. This check prevents a pack from being mistaken for one individual unit.

Continue with [product creation](creating-a-product.md),
[barcode labels](generating-product-barcodes.md), or [workbook edits](editing-product-workbooks.md).

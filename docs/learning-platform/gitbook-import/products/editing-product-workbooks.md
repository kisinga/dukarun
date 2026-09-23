# Edit and import Products workbooks

Download an editable workbook from **Settings → Data import & export**. Choose the stock
location you want to count before downloading. The same workbook supports existing edits and
new products, sizes/types, manufacturers and packs.

## Three sheets

- **Products:** product details, every price and all stock.
- **Manufacturers:** names available in the Manufacturer dropdown. Add a name or rename an
  existing one here. Renaming a manufacturer affects its linked products throughout your shop.
- **Pack sizes:** pack names and contents, such as Box / 12. Definitions supply Sold as choices;
  they receive no price or stock of their own.

On Products, **Size / type** distinguishes versions with separate stock, such as Soap / 250g
and Soap / 500g. **Sold as** describes what the retail price buys: Single bar or Box of 12 bars.
Rice sold by weight can have no size/type and use Per kg.

## Change a price or count

Current prices and stock appear beside yellow **New** and **Counted stock** cells. Enter a
change in the yellow cell. Blank New / Counted cells preserve the saved value. Enter **0** to
count zero stock. Use **CLEAR** to remove wholesale pricing or make a pack purchase-only.

Count stock once on the **Single / Per** row. A Soap / 250g box uses the Soap / 250g stock
balance. Packs show grey **XXXX** for wholesale, buying and stock because those values belong
to their Single / Per row. Enter numeric quantities; the cell displays the measure for you.

**Buying prices are KES per one stock unit**, such as a piece, metre or pair, not the cost of
the whole pack. Divide the pack's buying cost by its contents before entering **New buying**:
a box costing KES 250 with 100 pieces means **KES 2.50 per piece**. Buying cells display the
unit and accept up to two decimal places. Retail prices still apply to the row's **Sold as**
option, so a pack row's retail price is for the whole pack.

Expand the columns after Counted stock for SKU, barcodes, tracking, tax category, availability
and latest-batch information. Optional details are edited in place; clearing an optional
barcode or batch detail removes it. Existing SKU and stock-unit identities cannot be cleared.
Tax categories come from your shop's tax configuration.

## Add a product or size/type

1. Fill a prepared blank Products row with Product, Manufacturer, optional Size / type and a
   **Single / Per** choice in Sold as.
2. Enter **New retail**. To start with stock, also enter **Counted stock** and **New buying**.
   Opening buying cost may be explicitly zero. Buying cost is stored with the opening stock.
3. To add another size/type to a product, use the same Product and Manufacturer and a different
   Size / type. Product details on a new child inherit the existing parent's values when left
   at their blank/default values.

The downloaded workbook prepares up to **10,000 selling-option rows**, including existing
rows and packs. Use its blank rows for bulk entry. Each reference sheet provides its existing
entries plus at least 50 new slots. The file limit is 10 MB.

## Add a pack

1. **Fill the Single / Per row first.** This makes that item's contextual pack choices available.
2. On **Pack sizes**, add the pack name and number of individual units if the definition is new.
3. Add a Products row with the same Product, Manufacturer and Size / type. Select the pack in
   **Sold as**, then enter its retail price and optional barcode.

A Box / 12 definition can supply choices for different products. Each assigned pack has its
own price and barcode. Leaving a new pack's retail price blank makes it purchase-only.
Existing pack contents are fixed; add a different definition and pack for a new count.

### Entry sequence and sorting

Keep a Single / Per row followed by its packs for readability. **Row position does not establish
ownership.** Import checks the entire table, including when a parent appears below its pack.
Repeat identifying fields; blank does not mean “same as above”. Sort complete rows through the
table headers so hidden references move with them.

Existing manufacturer and pack labels follow linked reference formulas. Choosing a different
entry replaces the formula with a value. If you subsequently rename that reference, reselect
any old literal selections. Use distinct parent names when identical names make a new pack's
parent ambiguous.

## Availability and inventory value

Set **Product active?** or **Selling option active?** to **No** to disable it. Removing a row
from the workbook leaves the saved record unchanged; it never deletes or disables a product.

Buying and exact-value corrections require financial and stock-adjustment permissions. They
apply to the latest open batch at the chosen location and may revalue remaining inventory.
Use **New buying** or **Revised batch value KES** for a correction, not both. Exact values are
kept separately: 97 eggs at a rounded buying price of 14 KES may have an actual remaining value
of 1,400 KES. Existing inventory history stays in the application.

## Upload and review

Upload the workbook and review current → proposed values, creations, pack assignments and
inventory effects. Fix errors using the displayed sheet, row and column. If saved catalogue or
stock values changed since export, download a fresh workbook and review your edits against it.

**Apply workbook** saves the reviewed changes together. A failed apply leaves no partial
product, manufacturer, pack or stock changes. Retrying after a connection failure uses the same
request and cannot repeat the adjustments. After success, download a fresh workbook for your
next changes.

Only the current three-sheet format is accepted. Download a fresh workbook to replace files
from earlier formats.

# Creating a product

## Why this matters

A product groups related items or services. Each variant has its own stock balance, prices, SKU,
and barcode. Packs let you buy or sell several units of the same variant together while sharing
that stock balance.

> **Interactive guide**
>
> <a href="https://app.dukarun.com/learn/creating-a-product" target="_top">Start the interactive
> guide in Dukarun</a>. It opens the real product screen and points to the controls as you work.

## Before you start

You need access to create and edit products. Category and VAT treatment changes require catalogue
management access as well. Know the product name, the price for one stock unit, and whether it is
a physical good or a service. If you are entering existing stock, count it and find its acquisition
cost before starting.

## Video

The task-specific walkthrough is being prepared. For now, watch this Dukarun overview.

{% embed url="https://youtu.be/dfykDyK6Fs8" %}

## Steps

1. Open **Products**, then choose **Add product**.
2. Enter the **Product name**. Add a manufacturer, photo, categories, and VAT treatment where
   applicable. A **Shared barcode** suits a product with one variant; individual variant barcodes
   take precedence.
3. Choose **Continue to selling & stock**. On a small screen, choose **Next: selling & stock**.
4. Keep one variant for a simple item. Use separate variants for versions with independent stock,
   such as red and blue shirts or sealed 1 kg and 2 kg bags. Use packs for a box of several units
   that can also be sold individually from the same stock.
5. Set the **Stock unit** for a physical good: for example, `egg`, `bottle`, or `tablet`. Enter the
   **Retail price per … (KES)** for one of those units. Add an optional wholesale price per stock
   unit. Prices use whole Kenyan shillings.
6. Keep **Track stock** on if purchases and sales should update quantities. Enable fractional
   quantities only when you sell fractions of the stock unit. Services do not track stock; packs
   require a physical good with whole quantities.
7. If needed, choose **Add pack**. Enter its name, contents, independent selling price, and optional
   barcode. Leave its selling price blank for a pack used only when purchasing. See
   [Setting up and using packs](using-product-packs.md).
8. If you already hold stock, expand **Opening stock** and follow the instructions below. Otherwise,
   receive it later through a purchase.
9. Review the quantities and prices, then choose **Create product**.

## Entering opening stock

Opening stock records goods already owned when you start using the product. Choose the receiving
location and **Opening stock unit**, then enter the quantity. When counting packs, enter the number
of whole packs and any **Loose …** units separately.

The **Unit cost (KES)** is the acquisition cost of one selected opening unit. If you select a box,
enter the cost of one box. **Total opening value (KES)** overrides that calculation with the exact
value of all opening stock, including loose units.

For example, two boxes of 100 tablets plus five loose tablets create 205 tablets in stock. If each
box cost KES 755, the calculated opening value rounds to KES 1,548. Enter an exact total instead if
your records show a different acquisition value. The retail price still refers to one tablet;
the box selling price is configured separately.

Opening stock is available for new, tracked variants. To change the count of an existing variant,
use **Adjust stock**; to record a new supplier invoice, use **Purchases**. Entering opening stock
does not create a supplier bill or record a payment.

## What changes in Dukarun

The product, variants, packs, selected categories, and VAT treatment save together. Any opening
stock increases inventory at the selected location and records opening inventory value. A tracked
variant with no stock cannot be sold until stock is received or adjusted.

The product photo and category choices belong to the shared product. Pack prices and barcodes
belong to the individual variant. Changes to the catalogue do not rewrite completed documents.

## Related terms

[Product](../glossary.md#product), [variant](../glossary.md#variant),
[stock unit](../glossary.md#stock-unit), [pack](../glossary.md#pack),
[selling price](../glossary.md#selling-price), and
[inventory tracking](../glossary.md#inventory-tracking).

## Continue the workflow

[Generate a barcode](generating-product-barcodes.md) or
[record a credit purchase](../purchases/recording-a-credit-purchase.md).

## If something does not look right

- If the product does not appear on the Sell screen, check that both the product and variant are
  active.
- If a physical item shows the wrong quantity, confirm that **Track stock** is on and that you are
  viewing the correct stock location.
- Naming the stock unit does not convert existing quantities. Stock-unit renaming is restricted
  once a named unit has transaction history.
- A saved pack's contents cannot change. Remove it and add a replacement; existing receipts keep
  the original contents. Remove active packs before switching a variant to fractional quantities
  or a service.

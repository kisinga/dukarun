# Packs + Variants: Dropped Path (Decision Record)

## Scenario that exposed the gap

**Example:** Black and white cable ties. They must be sold by **variant** (colour/size) and also by **pack** (e.g. piece vs box of 100). So we need both:

- Variants: non-negotiable (e.g. Black, White).
- Sale units: piece and pack.

That implies a **matrix**: each variant can have multiple sale units (Black–piece, Black–pack, White–piece, White–pack). The number of combinations grows with variants × pack sizes. Supporting this in the product-creation UI and data flow is complex; we tried a simpler path first and it didn’t cover this case.

---

## What we implemented (and are dropping)

- **“Sold in packs”** as a **separate** how-sold preset: **single variant only**, no variant dimensions.
- Stage 2 showed only a **sale-unit editor** (base unit + pack rows: label, factor, price, opening stock per row). No variant/SKU list.
- Opening stock per pack row was converted to base units and stored as the single variant’s `stockOnHand`.
- Helpers in `product-create.utils.ts`: `computePacksTotalBaseStock`, `resizeOpeningStocksToMatchUnits`, `buildPacksSaleUnitsJson`.

This fits “one product, one variant, many pack sizes” but **not** “many variants, each with pack sizes”.

---

## Why this path is insufficient

- **Variants are required** for many products (colour, size, etc.). Treating “sold in packs” as “no variants” is too restrictive.
- **Variants × sale units** would require either:
  - One variant per combination (e.g. “Black – piece”, “Black – pack”, “White – piece”, “White – pack”), which blows up SKUs and UX, or
  - Keeping variants as today and attaching multiple sale units **per variant** (current `saleUnits` on variant), which the **creation UI** we built did not support for the multi-variant case.

So the implemented UI (packs-only, no variants) doesn’t match the real need (variants + packs).

---

## Challenges for a full solution

1. **Product creation:** Choosing “sold in packs” and “has variants” would need a clear flow: define variants first, then define sale units (and optionally opening stock per variant×unit). That’s a much larger UI and state shape.
2. **Stock:** Opening stock per (variant × pack size) or per variant in base units with shared pack definitions—needs a clear model and forms.
3. **Cart/orders:** Already support “same variant, different unit” as separate lines; the main gap is **creation** and **configuration**, not selling.

---

## Possible directions for a future enhancement

- **Option A:** Keep variants as today; add optional **sale units** in the **existing** variant/SKU flow (e.g. when “sold in packs” is chosen, still show variant dimensions + SKU list, and allow defining sale units at product level applied to all variants, or per variant).
- **Option B:** Explicit “variant × sale unit” matrix (e.g. grid: variants as rows, sale units as columns; price/stock per cell). Maximum flexibility, highest UI and validation complexity.
- **Option C:** Sale units defined once at product level; every variant gets the same units. Creation stays “variants first, then one sale-units config”; no per-variant pack config. Easiest to implement but less flexible.

---

## Decision

**Drop the “Sold in packs” (packs-only, no variants) path for now.** Remove or hide the packs preset and the related creation UI/utils so we don’t maintain code for a path that doesn’t solve the real scenario. Revisit when we’re ready to design “variants + sale units” in creation (e.g. Option A or C above).

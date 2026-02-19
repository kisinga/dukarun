## Inventory & Stock Management

This guide explains how Dukarun helps you **track what you have, where it is, and how it moves**, in language that matches daily retail operations.

---

## What Problems This Solves

- Know **how much stock you have** at each shop or warehouse.
- Keep **products and services** organised in a single catalog.
- Support both **barcode-based goods** and **fresh produce/services** with label photos.
- Prepare for more advanced workflows like **bulk-to-pack conversion**.

---

## Key Capabilities (with Origins)

- **Product catalog with variants (SKUs)** – One product can have multiple sizes or price points (e.g. 1kg / 2kg / 5kg).  
  **Origin:** Vendure Core (products + product variants).

- **Stock locations per business** – Each business (channel) can define one or more stock locations (shops/warehouses) to track inventory.  
  **Origin:** Vendure Core (stock locations) used in a POS-oriented way.

- **POS-focused stock tracking** – Simple, location-based counts suitable for small retailers; shipping and fulfilment are simplified away.  
  **Origin:** Dukarun-Enhanced (order process and UI).

- **Barcode-based products** – Packaged goods can be scanned and matched by barcode in both product creation and POS checkout.  
  **Origin:** Dukarun-Enhanced (frontend barcode components on Vendure catalog).

- **Label-photo products (AI-ready)** – Fresh produce and services can be identified using price labels / service cards, not just barcodes.  
  **Origin:** Dukarun-Exclusive (frontend ML + backend ML pipeline on top of Vendure assets).

- **Service products without stock** – Services (haircuts, repairs) are treated as products that never go out of stock.  
  **Origin:** Vendure Core (trackInventory flag) configured by Dukarun.

- **Stock adjustments & conversion (emerging)** – The UI and ledger are prepared to support bulk-to-pack conversion (e.g. 100kg tomatoes → bag sizes) with proper audit trail.  
  **Origin:** Dukarun-Exclusive (partially implemented & planned).

---

## Catalog and Products

### 1. Product Structure

In Dukarun:

- **Product** – The main item (“Tomatoes”, “Coca Cola”, “Haircut”).
- **Variants / SKUs** – The different options:
  - Quantities (1kg, 2kg, 5kg).
  - Sizes (300ml, 500ml, 1L).
  - Service tiers (Kids, Regular, Premium).

Examples (from `frontend/ARCHITECTURE.md`):

```text
Product: "Tomatoes"
└── SKUs:
    ├── 1kg @ 100/=
    ├── 2kg @ 180/=
    └── 5kg @ 400/=

Product: "Haircut"
└── SKUs:
    ├── Kids @ 300/=
    ├── Regular @ 500/=
    └── Premium @ 800/=
```

**Origin:** Vendure Core for products/variants; Dukarun uses a simplified creation flow (see “Product Creation Flow” in `ARCHITECTURE.md`).

---

### 2. Product Types: Barcodes vs Label Photos vs Services

Dukarun supports three main ways to identify items:

- **Barcode products** (packaged goods)
  - Use the **Barcode Scanner** component in product creation.
  - Scan the barcode and link it to a product/variant.
  - At POS, cashiers scan the barcode and Dukarun adds the right SKU to the cart.
  - **Origin:** Dukarun-Enhanced (frontend, reusing Vendure SKUs).

- **Label/photo products** (fresh produce, bulk items)
  - Instead of scanning barcodes, you **take multiple photos of the price label/tag**.
  - Dukarun trains a per-business ML model to recognise these labels.
  - At POS, cashiers point the camera at the label; the model suggests the product and you choose the correct SKU (e.g. 2kg).
  - **Origin:** Dukarun-Exclusive (ML pipeline described in `ARCHITECTURE.md` and `ML_TRAINING_SETUP.md`).

- **Service products**
  - Use the same product/variant model but set **inventory tracking off**.
  - These never go “out of stock” and are ideal for services like haircuts.
  - **Origin:** Vendure Core (`trackInventory` flag) + Dukarun UI guidance.

From a business perspective, you manage **all of these in the same “Products” section**, but Dukarun gives you different identification tools and defaults per type.

---

## Stock Locations

### 1. What is a Stock Location?

For each business (channel), a **stock location** represents a:

- Physical shop (e.g. “Main Store”, “Kawangware Branch”).
- Warehouse or back room.

Vendure provides stock locations; Dukarun uses them in a **POS-focused** way:

- Orders are always tied to a location.
- Inventory is tracked per location.

**Origin:** Vendure Core (stock locations) + Dukarun-Enhanced provisioning (`CUSTOMER_PROVISIONING.md`).

---

### 2. Minimum Required Setup

Per the **Customer Provisioning Guide**:

Every new channel **must** have at least:

- One **stock location** – Required to create orders and track stock.
- Appropriate **payment methods** – Required to complete sales.

Provisioning workflow:

1. Create Channel (business).
2. Create at least one Stock Location and assign it to that channel.
3. Create Payment Methods for that channel.

If a business has multiple physical shops, you can create multiple stock locations.

---

### 3. Default Location & Active Context

The frontend uses a **channel-first** model (see `frontend/ARCHITECTURE.md`). At present:

- The dashboard is **channel-specific**.
- A **default stock location** is stored in channel custom fields (e.g. `defaultStockLocationId`) and used by the POS.
- The POS uses this default location when:
  - Creating orders.
  - Fetching stock counts.
  - Applying cashier flow toggles.

**Origin:** Dukarun-Enhanced (channel custom field + frontend services).

---

## Stock value at hand

On the **dashboard Overview**, the **Product & Inventory** card shows a **Stock value (at hand)** row with three numbers:

- **Retail** – Total value of current stock if sold at selling prices.
- **Wholesale** – Total value at wholesale prices (variant custom field).
- **Cost** – Total value at cost (from inventory batches; COGS basis).

Values are cached per channel and refresh when stock or prices change; a refresh button forces an immediate recompute. Implementation and API details are in **[STOCK_VALUE_STATS.md](../STOCK_VALUE_STATS.md)** (source of truth for this feature).

---

## Stock and Adjustments (Current & Future)

### 1. Current Stock Behaviour

Today, Dukarun supports:

- Viewing stock per product/variant at the active location.
- Reducing stock when sales complete (via Vendure’s core inventory handling).
- Keeping “edit product” screens focused on **metadata**, not direct stock changes – stock changes are intended to go through an **inventory module** for auditability.

There is also a `stock-adjustments` component on the frontend, which is the basis for:

- Manual corrections (e.g. stock takes, spoilage).
- Future bulk-to-pack conversion workflows.

**Origin:** Vendure Core for stock levels; Dukarun-Exclusive for UI and planned workflows.

---

### 2. Bulk-to-Pack Conversion (Planned)

Many Dukarun customers **buy in bulk and sell in smaller packs** (e.g. 100kg of tomatoes → 1kg, 2kg and 5kg bags). The future **Stock Conversion** module (outlined in `frontend/ARCHITECTURE.md`) aims to:

- Let you record a bulk purchase.
- Allocate the bulk into various SKUs.
- Automatically:
  - Increase SKU stock counts.
  - Track costs per SKU.
  - Track waste/losses.

While the architecture and ledger are already designed for this, the customer-facing UI is being iterated. In the current version:

- You can track stock per SKU.
- Bulk-to-pack conversion requires manual adjustments plus business discipline.

**Origin:** Dukarun-Exclusive (under active development).

---

## Services (Inventory-Optional Items)

Services (barbershops, salons, repair shops) are fully supported, using the same product catalog:

- Each service is a product (e.g. “Haircut”).
- Each tier is a variant (e.g. Kids, Regular, Premium).
- For services, Dukarun sets **`trackInventory = FALSE`**:
  - No stock counts.
  - No “out of stock” state.
  - Still fully integrated with sales and reporting.

This leverages Vendure’s native fields and avoids custom service entities.

**Origin:** Vendure Core + Dukarun-Enhanced UX and defaults.

---

## How to Use & Configure (Workflows)

### A. Creating a Simple Product with Stock

**Who:** Owners, managers, stock controllers.

1. In the Dukarun dashboard, go to **Products → Create**.
2. Choose how you will identify this product:
   - Scan a **barcode** (for packaged goods), or
   - Plan to use **label photos** (for fresh produce / bulk).
3. Enter the **product name** (e.g. “Tomatoes”, “Coca Cola”).
4. Add at least one **SKU/variant**:
   - Name (“1kg”, “500ml”).
   - Price (tax-inclusive, see price handling in frontend architecture).
   - Initial stock (per location, if supported in your current version).
5. Save.

Later, you can:

- Add more SKUs (e.g. 2kg, 5kg).
- Link the product to label photos and/or ML training if using AI recognition.

---

### B. Creating a Service Product

**Who:** Owners, service business managers.

1. Go to **Products → Create**.
2. Enter the name (e.g. “Haircut”, “Neck Massage”).
3. Add variants for tiers (Kids / Regular / Premium).
4. Ensure the “track inventory” option is **off** for these variants.
5. Optionally create **service cards** with icons and prices, and capture label photos for ML recognition.

This gives you clean revenue tracking for services without confusing stock numbers.

---

### C. Working with Stock Locations

**Who:** Dukarun provisioning team, advanced customers.

1. In the Vendure Admin UI (`/admin`), go to **Settings → Stock Locations**.
2. Create locations such as:
   - “Main Store”
   - “Downtown Branch”
3. Assign each location to the correct **channel**.
4. In the channel’s custom fields, set the **default stock location** (if exposed in the current admin UI).

From the POS perspective, this determines where stock is drawn from and where inventory is reported.

---

### D. Adjusting Stock (Manual Corrections)

**Who:** Managers, stock controllers.

Dukarun is converging on a pattern where:

- **Product edit forms** do not let you directly change stock.
- All stock changes (other than sales) are done via a **stock adjustments screen** (e.g. recounts, damage, shrinkage).

Depending on the current implementation stage:

1. Navigate to **Inventory → Stock Adjustments**.
2. Select the product/variant.
3. Enter the new quantity or the adjustment (e.g. “+10” after a delivery).
4. Supply a reason (e.g. “Stock take correction”).
5. Confirm.

Behind the scenes, Dukarun’s ledger and inventory services can tie these adjustments into financial reporting.

**Origin:** Dukarun-Exclusive UI on top of Vendure inventory.

---

## Limitations & Notes

- **Single default location per channel (today):** The current UI assumes one main location per business. Multi-location operations beyond that require more advanced configuration and are covered in future phases (see `frontend/ARCHITECTURE.md` “Future Enhancements”).
- **No built-in warehouse transfers yet:** Moving stock between locations will, in early versions, require manual adjustments; a dedicated transfer flow is planned.
- **Bulk conversion work in progress:** While the architecture supports it, the user interface for bulk-to-pack conversion is evolving and may not be visible in your build yet.

---

## Vendure vs Dukarun: What’s What

- **Vendure Core**
  - Product and variant model.
  - Stock locations and basic inventory tracking.
  - `trackInventory` flag for differentiating products vs services.

- **Dukarun-Enhanced**
  - POS-centric product creation and edit flows.
  - Barcode scanner components reused across product creation, POS checkout and inventory actions.
  - Simplified order process with no shipping requirements.

- **Dukarun-Exclusive**
  - Label-photo-based products and ML recognition.
  - Per-channel ML models and auto-extraction of product photos.
  - Planned stock conversion workflows with ledger integration.
  - Mobile-first product and inventory pages optimised for SMEs in African markets.

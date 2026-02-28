# Custom StockMovementService Override

This document describes why we override Vendure's `StockMovementService` and how it differs from the base implementation. This follows Vendure's [service decoration pattern](https://docs.vendure.io/current/core/reference/typescript-api/services/stock-movement-service): we extend the core service and register our implementation in the LedgerPlugin.

## Purpose: batch/COGS as source of truth

- **Fulfillment does not update StockLevel.** Our batch/COGS flow owns quantity on sale. The custom implementation creates `Sale` entities and publishes `StockMovementEvent`, but does **not** call `stockLevelService.updateStockOnHandForLocation` or `updateStockAllocatedForLocation`. This ensures a single write path for quantity and prevents "stock without batch" after backfill migrations.

- **Product create/update stock** is not a no-op at the persistence layer: we delegate to our local `StockMovementService.adjustStockLevel` (the same path used for purchases and adjustments) so batches are created. All stock changes go through one path.

## Overridden methods

| Method | Base behavior | Our behavior |
|--------|----------------|--------------|
| `createSalesForOrder` | Creates Sales, updates StockLevel, publishes event | Creates Sales, publishes event; **does not** update StockLevel |
| `createCancellationsForOrderLines` | Creates Cancellations, updates StockLevel, publishes event | Creates Cancellations, publishes event; **does not** update StockLevel |
| `createReleasesForOrderLines` | Creates Releases, updates StockLevel, publishes event | Creates Releases, publishes event; **does not** update StockLevel |
| `adjustProductVariantStock` | Adjusts stock via core logic, returns StockAdjustments | Delegates to local `StockMovementService.adjustStockLevel` with reason `'Product create/update'`; returns `[]` (no StockAdjustment from Vendure) |

## Registration

The override is registered in [LedgerPlugin](../../plugins/ledger/ledger.plugin.ts): we provide our class as `StockMovementService` and the original local implementation as `'LocalStockMovementService'`.

## Upgrade note

On Vendure upgrade, re-check the `StockMovementService` API in the [Vendure changelog](https://github.com/vendure-ecommerce/vendure/blob/master/CHANGELOG.md). If method signatures or events change, update [custom-vendure-stock-movement.service.ts](./custom-vendure-stock-movement.service.ts) and the tests in `spec/services/stock/custom-vendure-stock-movement.service.spec.ts`.

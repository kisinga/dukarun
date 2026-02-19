# Stock Value at Hand (Stats)

**Source of truth** for the “stock value at hand” feature: API, cache, invalidation, and UI. Use this doc when working on this feature in any editor or with other developers.

---

## What it is

A **per-channel stat** that answers: “What is the total value of my current stock?” using three methods:

| Method     | Meaning                          | Source |
|-----------|-----------------------------------|--------|
| **Retail**   | Sum of (stock on hand × selling price) per variant | Product variants + stock levels |
| **Wholesale**| Sum of (stock on hand × wholesale price) per variant | Product variant custom field `wholesalePrice` |
| **Cost**     | Sum of (batch quantity × unit cost) across all open batches | `inventory_batch` (FIFO/COGS) |

All values are in **cents** (smallest currency unit). The UI formats them with the channel currency.

---

## Where it appears

- **Dashboard → Overview**: Inside the **Product & Inventory** card, in a “Stock value (at hand)” row with Retail, Wholesale, and Cost plus a refresh button.

See also the customer-facing description in [Inventory & Stock](customer-features/inventory-and-stock.md#stock-value-at-hand).

---

## Backend

### API

- **Query**: `stockValueStats(stockLocationId: ID, forceRefresh: Boolean): StockValueStats!`
- **Type**: `StockValueStats { retail: Float! wholesale: Float! cost: Float! }` (values in cents)
- **Permission**: Same as dashboard stats (e.g. `ReadOrder`).
- **Plugin**: Ledger plugin (schema in `dashboard-stats.schema.ts`, resolver `StockValueStatsResolver`).

### Computation

- **Service**: `StockValuationService` (`backend/src/services/financial/stock-valuation.service.ts`)
  - **Cost**: Uses `InventoryReconciliationService.calculateInventoryValuation(ctx, channelId, today, stockLocationId)` (sum of `quantity * unitCost` over `inventory_batch`).
  - **Retail / Wholesale**: Single SQL joining `product_variant`, `product_channels_channel`, and `stock_level`; sums `price * qty` and `wholesalePrice * qty` (with optional `stockLocationId` filter).

### Cache

- **Storage**: Channel custom field `stockValueCache` (type `text` in config).
- **Shape**: JSON string: `{"retail":"...","wholesale":"...","cost":"...","updatedAt":"..."}` (amounts as strings to avoid number limits).
- **Behaviour**: Cache-first. If `forceRefresh` is false and `stockValueCache` is present and parseable, the resolver returns it; otherwise it computes, writes the cache, and returns.
- **Config**: In `vendure-config.ts`, Channel custom field `stockValueCache` must be `type: 'text'` so the DB column is `text` (see [CustomFieldType](https://docs.vendure.io/reference/typescript-api/custom-fields/custom-field-type)). Migration: `backend/src/migrations/8000000000014-AddChannelStockValueCache.ts`.

### Invalidation

Cache is cleared (so the next request recomputes) when:

1. **Stock level changes**: `StockMovementService.adjustStockLevel` publishes `StockLevelChangedEvent`; Ledger plugin subscriber calls `StockValuationService.invalidateCache(ctx)`.
2. **Sale recorded**: `InventoryService.recordSale` calls `StockValuationService.invalidateCache(transactionCtx)` at the end of the transaction.
3. **Variant/price changes**: Ledger plugin subscribes to `ProductVariantEvent` and calls `StockValuationService.invalidateCache(ctx)`.

No TTL; invalidation is event-based. Optional `forceRefresh: true` forces a recompute on the next query.

### Key files (backend)

| Area | File |
|------|------|
| Config | `backend/src/vendure-config.ts` (Channel custom field `stockValueCache`, type `text`) |
| Migration | `backend/src/migrations/8000000000014-AddChannelStockValueCache.ts` |
| Domain | `backend/src/domain/channel-custom-fields.ts` (`StockValueCache`, `parseStockValueCache`) |
| Event | `backend/src/infrastructure/events/custom-events.ts` (`StockLevelChangedEvent`) |
| Service | `backend/src/services/financial/stock-valuation.service.ts` |
| Schema | `backend/src/plugins/ledger/dashboard-stats.schema.ts` (type + query) |
| Resolver | `backend/src/plugins/ledger/stock-value-stats.resolver.ts` |
| Subscriber | `backend/src/plugins/ledger/stock-value-cache.subscriber.ts` |
| Emit event | `backend/src/services/stock/stock-movement.service.ts` (after `adjustStockLevel`) |
| Invalidate on sale | `backend/src/services/inventory/inventory.service.ts` (end of `recordSale`) |
| Plugin registration | `backend/src/plugins/ledger/ledger.plugin.ts` |

---

## Frontend

- **Query**: `GET_STOCK_VALUE_STATS` in `frontend/src/app/core/graphql/operations.graphql.ts`.
- **Service**: `DashboardService.loadStockValueStats(forceRefresh?)`; signals `stockValueStats` and `stockValueLoading`.
- **UI**: Overview component, inside the **Product & Inventory** card: “Stock value (at hand)” row with Retail, Wholesale, Cost and a refresh button (refresh calls `loadStockValueStats(true)`).
- **Load**: Stock value is loaded when the overview loads (same effect that fetches dashboard data), in addition to manual refresh.

---

## Migrations and schema

When adding or changing Channel custom fields used by this feature, follow the project rule for Vendure migrations and consult:

- [Vendure: Database migrations](https://docs.vendure.io/guides/developer-guide/migrations)
- [Vendure: CustomFieldType](https://docs.vendure.io/reference/typescript-api/custom-fields/custom-field-type)

See also `.cursor/rules/vendure-migrations.mdc`.

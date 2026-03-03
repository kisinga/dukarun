# Inventory Framework: FIFO & COGS

## Overview

The Dukarun inventory framework provides a composable, extensible system for tracking inventory with FIFO (First-In-First-Out) costing and COGS (Cost of Goods Sold) calculation. The framework is designed with data integrity and composability as core principles.

## Architecture

### Core Components

1. **InventoryStore** - Abstraction over inventory persistence
2. **CostingStrategy** - Pluggable cost allocation strategies (FIFO, FEFO, Average Cost, etc.)
3. **ExpiryPolicy** - Composable rules for handling expiry validation
4. **InventoryService** - High-level facade orchestrating all components
5. **Posting Policies** - Ledger integration for inventory postings

### Key Entities

- **`inventory_batch`** - Tracks batches of stock with cost and expiry
- **`inventory_movement`** - Immutable audit trail of all stock changes

## Usage

### Recording a Purchase

```typescript
const result = await inventoryService.recordPurchase(ctx, {
  purchaseId: 'purchase-123',
  channelId: channelId,
  stockLocationId: locationId,
  supplierId: 'supplier-456',
  purchaseReference: 'PO-001',
  isCreditPurchase: false,
  lines: [
    {
      productVariantId: variantId,
      quantity: 100,
      unitCost: 5000, // in cents
      expiryDate: new Date('2025-12-31'), // optional
    },
  ],
});
```

### Order flow & COGS

- **Re-check at recordSale:** Order line quantity is re-validated when `recordSale` runs (via `verifyStockLevel` and `allocateCost` under lock). Stock is consumed from batches only when `recordSale` succeeds.
- **Quantity changed after add-item:** If an order line's quantity is increased after add-item without a fresh stock check, `recordSale` may throw or skip COGS for that order when batch stock is insufficient.
- **Fulfillment without COGS:** Fulfillment can occur even when COGS is skipped (e.g. insufficient batch stock at payment time). Batch consumption and COGS are applied only when `recordSale` runs successfully; otherwise the order remains paid/fulfilled but with no COGS recorded.

### Recording a Sale (with COGS)

```typescript
const result = await inventoryService.recordSale(ctx, {
  orderId: 'order-789',
  orderCode: 'ORD-001',
  channelId: channelId,
  stockLocationId: locationId,
  customerId: 'customer-123',
  lines: [
    {
      productVariantId: variantId,
      quantity: 50,
    },
  ],
});
// result.totalCogs contains the COGS amount in cents
```

### Recording a Write-Off

```typescript
const result = await inventoryService.recordWriteOff(ctx, {
  adjustmentId: 'adjustment-456',
  channelId: channelId,
  stockLocationId: locationId,
  reason: 'damage',
  lines: [
    {
      productVariantId: variantId,
      quantity: 10,
    },
  ],
});
```

## Extending the Framework

### Adding a New Costing Strategy

1. Implement the `CostingStrategy` interface:

```typescript
@Injectable()
export class AverageCostingStrategy implements CostingStrategy {
  getName(): string {
    return 'AVERAGE';
  }

  async allocateCost(
    ctx: RequestContext,
    request: CostAllocationRequest
  ): Promise<CostAllocationResult> {
    // Implementation using average cost calculation
  }
}
```

2. Register the strategy in your module:

```typescript
providers: [
  {
    provide: 'CostingStrategy',
    useClass: AverageCostingStrategy,
  },
]
```

### Adding a New Expiry Policy

1. Implement the `ExpiryPolicy` interface:

```typescript
@Injectable()
export class StrictExpiryPolicy implements ExpiryPolicy {
  getName(): string {
    return 'STRICT';
  }

  async validateBeforeConsume(
    ctx: RequestContext,
    batch: InventoryBatch,
    quantity: number,
    movementType: MovementType
  ): Promise<ExpiryValidationResult> {
    // Strict validation logic
  }

  async onBatchCreated(ctx: RequestContext, batch: InventoryBatch): Promise<void> {
    // Hook implementation
  }

  async onBatchExpired(ctx: RequestContext, batch: InventoryBatch): Promise<void> {
    // Hook implementation
  }
}
```

2. Register the policy in your module.

## Configuration

### Per-Channel Configuration

Each channel can have its own inventory configuration:

```typescript
const config = await inventoryConfigService.getConfiguration(ctx, channelId);
// Returns: { costingStrategy: 'FIFO', expiryPolicy: 'DEFAULT', inventoryValuationMode: 'shadow' }
```

### Valuation Modes

- **`none`** - Inventory valuation disabled
- **`shadow`** - Framework runs alongside existing system for validation
- **`authoritative`** - Framework is the primary inventory system

## Reconciliation

### Inventory Valuation vs Ledger

```typescript
const reconciliation = await reconciliationService.getInventoryValuationVsLedger(ctx);
// Compares inventory batch valuation with ledger INVENTORY account balance
```

### Stock Level Reconciliation

```typescript
const reconciliation = await reconciliationService.reconcileStockLevels(
  ctx,
  variantId,
  locationId
);
// Compares batch sums with Vendure stock levels
```

## Data Integrity

### Invariants

- Batch quantity >= 0
- Movements are immutable once created
- Sum of movements = current stock
- Source tracking (sourceType, sourceId) provides idempotency

### Fractional quantities

- **Batch and movement:** `inventory_batch.quantity` and `inventory_movement.quantity` use float and support fractional quantities. COGS is computed as `allocationQuantity * batch.unitCost` and stored in cents (integer).
- **Analytics:** `sale_cogs.quantity` is stored as `decimal(12,0)`; fractional order line quantities are rounded at persistence when writing to `sale_cogs`. `cogsCents` remains exact (integer cents).

### Concurrency Control

- Per-SKU/location locking using `SELECT ... FOR UPDATE`
- Lock ordering: channel → location → variant
- Locks held only within transaction boundaries

### Verification Patterns

- Batch verification after creation
- Stock level verification before consumption
- Allocation verification after cost allocation
- Ledger posting verification (idempotency check)

## Integration with Existing Services

### StockManagementService Integration

The framework integrates with `StockManagementService` in shadow mode:

1. **Phase 1 (Shadow Mode)**: Runs alongside existing flows for validation
2. **Phase 2 (Gradual Migration)**: Route operations through InventoryService for selected channels
3. **Phase 3 (Authoritative Mode)**: Use InventoryService as primary, deprecate old flows

### Shadow Mode

When enabled, purchases are recorded in both the existing system and the inventory framework:

```typescript
// In StockManagementService.recordPurchase()
if (inventoryService && inventoryConfig) {
  const isValuationEnabled = await inventoryConfig.isValuationEnabled(ctx, channelId);
  if (isValuationEnabled) {
    await inventoryService.recordPurchase(ctx, { ... });
  }
}
```

## Related Documentation

- **[Ledger Architecture](./LEDGER_ARCHITECTURE.md)**: Financial system design
- **[Infrastructure Patterns](./INFRASTRUCTURE_PATTERNS.md)**: General infrastructure patterns
- **[Provisioning Principles](./PROVISIONING_PRINCIPLES.md)**: Data integrity patterns


# Audit System

## Overview

The audit system provides comprehensive, channel-scoped logging of all sensitive operations in the platform. It captures user actions and system events with full attribution, creating a complete audit trail for compliance and debugging.

**Architecture:** Uses a separate TimescaleDB database for audit logs, providing clear separation of concerns and time-series optimized storage with automatic retention policies (2 years).

## Core Principle

**Simple API, clear pattern, related code together.** Inject `AuditService`, call `log()`. That's it.

## Architecture

### Components

1. **AuditLog Entity** - Time-series table storing all audit events (TimescaleDB hypertable)
2. **AuditDbConnection** - Separate database connection to TimescaleDB
3. **AuditService** - Simple service with intuitive API for logging events
4. **UserContextResolver** - Helper to resolve user context from RequestContext or entity custom fields
5. **VendureEventAuditSubscriber** - Subscribes to Vendure events and logs them
6. **AuditLogInterceptor** - Automatically logs mutations decorated with `@AuditLog`
7. **MutationAuditGuard** - Fallback: logs all mutations without `@AuditLog` (including Vendure built-ins)

### Database

- **Separate TimescaleDB instance** - Dedicated database for audit logs
- **Hypertable** - Partitioned by timestamp (7-day chunks) for efficient time-series queries
- **Automatic Retention** - Data older than 2 years (730 days) is automatically purged
- **Clear Separation** - Audit logs are completely separate from main application database

### Key Features

- **Channel-Scoped:** All audit records are associated with a channel
- **User Attribution:** Tracks who performed each action
- **IP Address Logging:** Captures client IP address for user-associated events (handles reverse proxy headers)
- **Single Source of Truth:** User actions store attribution immediately; system events inherit
- **Non-Blocking:** Audit logging failures don't prevent operations
- **Time-Series Optimized:** Efficient querying with proper indexes

## Usage

### Declarative: @AuditLog Decorator (Preferred for Resolvers)

For GraphQL mutations, use the `@AuditLog` decorator to declare audit requirements. The interceptor automatically logs after successful execution.

```typescript
import { AuditLog as AuditLogDecorator } from '../../infrastructure/audit/audit-log.decorator';
import { AUDIT_EVENTS } from '../../infrastructure/audit/audit-events.catalog';

@Mutation()
@Allow(SomePermission.Permission)
@AuditLogDecorator({
  eventType: AUDIT_EVENTS.MY_EVENT,
  entityType: 'MyEntity',
  extractEntityId: (result, args) => result?.id ?? args?.input?.id ?? null,
})
async myMutation(@Ctx() ctx: RequestContext, @Args('input') input: MyInput): Promise<MyResult> {
  return this.myService.doWork(ctx, input);
}
```

**Decorator options:**
- `eventType` (required) - Use constants from `AUDIT_EVENTS` catalog for type safety
- `entityType` (optional) - Entity type for filtering (e.g. 'Order', 'Reconciliation')
- `extractEntityId` (optional) - `(result, args) => string | null` - extracts entity ID from mutation result/args
- `includeArgs` (optional) - Include mutation args in audit data
- `includeResult` (optional) - Include mutation result in audit data

**Enforcement:**
- Mutations with `@AuditLog` are logged by `AuditLogInterceptor` after success
- Mutations without `@AuditLog` are logged by `MutationAuditGuard` with a generic `mutation.{name}` event
- This guarantees every mutation is audited

### Manual: AuditService.log() (For Services)

When audit logging cannot be done at the resolver level (e.g. service methods called from multiple places):

```typescript
@Injectable()
export class MyService {
  constructor(
    private readonly auditService: AuditService
    // ... other dependencies
  ) {}

  async performAction(ctx: RequestContext, input: SomeInput): Promise<Result> {
    const result = await this.doWork(ctx, input);

    // Log user action
    await this.auditService.log(ctx, 'my_action.performed', {
      entityType: 'MyEntity',
      entityId: result.id.toString(),
      data: {
        /* relevant data */
      },
    });

    return result;
  }
}
```

### When to Use `log()` vs `logSystemEvent()`

**Use `log()` for:**

- Direct user actions (order creation, payment addition, settings changes)
- Operations triggered by user requests
- Any action where `RequestContext.activeUserId` is available

**Use `logSystemEvent()` for:**

- Vendure events (OrderStateTransitionEvent, PaymentStateTransitionEvent)
- System-triggered events that inherit user context from entities
- Events where user context comes from entity custom fields

### Updating Entity Custom Fields

For entities that need quick user lookups (Order, Payment, Customer), update custom fields when actions occur:

```typescript
// Update order custom fields
await this.orderService.update(ctx, {
  id: orderId,
  customFields: {
    createdByUserId: ctx.activeUserId,
    lastModifiedByUserId: ctx.activeUserId,
  },
});

// Then log audit event
await this.auditService.log(ctx, 'order.created', {
  entityType: 'Order',
  entityId: orderId.toString(),
  data: { orderCode: order.code, total: order.total },
});
```

## Event Types

Use the `AUDIT_EVENTS` catalog for type-safe event types:

```typescript
import { AUDIT_EVENTS } from './audit-events.catalog';

await this.auditService.log(ctx, AUDIT_EVENTS.ORDER_CREATED, { ... });
```

**Convention:** `{entity}.{action}` or `{entity}.{category}.{action}` (e.g. `order.created`, `customer.credit.approved`)

**Examples:**
- `order.created` - Order creation
- `order.state_changed` - Order state transition
- `customer.credit.approved` - Credit approval
- `customer.credit.limit_changed` - Credit limit change
- `admin.invited` - Admin invitation
- `channel.settings.updated` - Channel settings change
- `approval.reviewed` - Approval request approved or rejected (payload: approvalId, type, status, reviewedById, message)

See `audit-events.catalog.ts` for the full list.

## Querying Audit Log

```typescript
// Get all events for an entity
const events = await this.auditService.getAuditTrail(ctx, {
  entityType: 'Order',
  entityId: orderId.toString(),
});

// Get events by user
const userEvents = await this.auditService.getAuditTrail(ctx, {
  userId: userId.toString(),
});

// Get events by type
const orderEvents = await this.auditService.getAuditTrail(ctx, {
  eventType: 'order.created',
});

// Get events in time range
const recentEvents = await this.auditService.getAuditTrail(ctx, {
  startDate: new Date('2024-01-01'),
  endDate: new Date('2024-12-31'),
});
```

## Integration Guidelines

### 1. Inject AuditService

Add `AuditService` to your service constructor:

```typescript
constructor(
  // ... existing dependencies
  private readonly auditService: AuditService
) {}
```

### 2. Log After Actions

Log immediately after performing the action:

```typescript
async createSomething(ctx: RequestContext, input: Input): Promise<Entity> {
  const entity = await this.createEntity(ctx, input);

  // Update custom fields if needed
  await this.updateEntityCustomFields(ctx, entity.id, {
    createdByUserId: ctx.activeUserId
  });

  // Log audit event
  await this.auditService.log(ctx, 'entity.created', {
    entityType: 'Entity',
    entityId: entity.id.toString(),
    data: { /* relevant data */ }
  });

  return entity;
}
```

### 3. Handle Errors Gracefully

Wrap audit logging in try-catch or use `.catch()` to prevent failures:

```typescript
await this.auditService.log(ctx, 'action', options).catch(err => {
  this.logger.warn(`Failed to log audit: ${err.message}`);
});
```

### 4. Include Relevant Data

Store all relevant information in the `data` field:

```typescript
await this.auditService.log(ctx, 'order.created', {
  entityType: 'Order',
  entityId: order.id.toString(),
  data: {
    orderCode: order.code,
    total: order.total,
    customerId: order.customer?.id.toString(),
    paymentMethod: input.paymentMethodCode,
    itemCount: order.lines.length,
  },
});
```

## Best Practices

1. **Prefer @AuditLog for Resolvers:** Use the decorator on mutations for automatic, consistent logging
2. **Use AUDIT_EVENTS Catalog:** Import from `audit-events.catalog.ts` for type safety
3. **Log Immediately:** For manual logging, log right after the action
4. **Include Context:** Store all relevant data in the `data` field (minimal metadata for sensitive data)
5. **Use Descriptive Event Types:** Follow the `entity.action` convention
6. **Update Custom Fields:** For Order, Payment, Customer - update custom fields for quick lookups
7. **Non-Blocking:** Never let audit logging failures break operations
8. **Channel-Scoped:** Always ensure `channelId` is available in RequestContext

### When to Use Decorator vs Manual

- **@AuditLog decorator:** Resolver mutations that perform a single identifiable action
- **Manual AuditService.log():** Service methods called from multiple resolvers; operations that bypass resolvers (e.g. background jobs)

## Entity Custom Fields

Only these entities have user tracking custom fields:

- **Order:** `createdByUserId`, `lastModifiedByUserId`
- **Payment:** `addedByUserId`
- **Customer:** `creditApprovedByUserId`

These are updated by services when actions occur and used by system events to inherit user context.

## System Events

System events (from VendureEventAuditSubscriber) automatically:

1. Look up user context from entity custom fields
2. Fall back to `event.ctx.activeUserId` if available
3. Store as `null` with metadata if no user context found

This ensures system events inherit user attribution from the original user action.

## IP Address Logging

The audit system automatically captures the client IP address for all user-associated events. This provides an additional layer of security and auditability.

### How It Works

- **Automatic Capture:** IP addresses are extracted automatically when a `userId` is associated with an audit event
- **Reverse Proxy Support:** Uses the `request-ip` library to properly handle reverse proxy headers (`X-Forwarded-For`, `X-Real-IP`) with fallback to direct connection IP
- **Best-Effort:** IP extraction is non-blocking and returns `null` if the request object is unavailable (e.g., background/system events)
- **Trust Model:** IP addresses are derived directly from the network connection and cannot be overridden by caller-provided audit `data` - this ensures the IP address reflects the actual network source

### When IP is Captured

- **User Actions:** IP is captured for all events logged via `log()` when a `userId` is present
- **System Events:** IP is captured for events logged via `logSystemEvent()` when a user is associated with the event
- **Background Events:** IP will be `null` for events that don't have an associated HTTP request (e.g., scheduled jobs, background workers)

### GraphQL Access

The `ipAddress` field is available in the GraphQL `AuditLog` type:

```graphql
query {
  auditLogs {
    id
    timestamp
    userId
    ipAddress # Client IP address (null if not available)
    eventType
    data
  }
}
```

## Future Enhancements

- GraphQL queries for audit log retrieval
- Admin UI for viewing audit trails
- Real-time audit log streaming
- Retention policies and archival
- TimescaleDB migration for better performance

# Backend Infrastructure Patterns

This document outlines the architectural patterns, organization principles, and best practices used in the Dukarun backend.

**Scope**: This document covers general infrastructure patterns applicable across the entire backend. For provisioning-specific patterns (Hybrid Strategy, Repository Bootstrap, M2M assignment verification), see [PROVISIONING_PRINCIPLES.md](./PROVISIONING_PRINCIPLES.md).

## Table of Contents

1. [Service Organization](#service-organization)
2. [Dependency Injection Patterns](#dependency-injection-patterns)
3. [Event-Driven Communication](#event-driven-communication)
4. [Plugin Architecture](#plugin-architecture)
5. [Error Handling](#error-handling)
6. [Transaction Management](#transaction-management)
7. [Entity Relationship Patterns](#entity-relationship-patterns)

## Service Organization

### Directory Structure

Services are organized by **business domain** rather than technical layer:

```
backend/src/
├── services/              # Business logic services (domain-driven)
│   ├── auth/             # Authentication domain
│   ├── orders/           # Order management domain
│   ├── credit/           # Credit management domain
│   ├── subscriptions/    # Subscription domain
│   ├── payments/         # Payment processing domain
│   ├── ml/               # Machine learning domain
│   ├── notifications/    # Notification domain
│   └── channels/         # Channel management domain
│
├── infrastructure/        # External integrations & shared infrastructure
│   ├── sms/              # SMS infrastructure
│   ├── events/           # Event system infrastructure
│   └── storage/          # Storage abstractions
│
└── plugins/              # Vendure plugins (organized by domain)
    ├── auth/
    ├── orders/
    ├── credit/
    ├── subscriptions/
    ├── payments/
    ├── ml/
    ├── notifications/
    ├── channels/
    ├── pricing/
    └── inventory/
```

### Principles

1. **Domain-Driven Organization**: Services grouped by business capability
2. **Infrastructure Separation**: External integrations isolated from business logic
3. **Composability**: Services can be easily imported and reused
4. **Clear Boundaries**: Each domain has clear responsibilities

### Service Types

#### Domain Services (`services/`)

- Contain business logic for a specific domain
- Examples: `CreditService`, `OrderCreationService`, `SubscriptionService`
- Should not depend on other domain services directly (use events for cross-domain communication)

#### Infrastructure Services (`infrastructure/`)

- Provide technical capabilities (SMS, events, storage)
- Can be used by multiple domain services
- Examples: `SmsService`, `ChannelEventRouterService`, `RegistrationStorageService`

### When to Create a New Service

1. **New Domain**: Create a new folder under `services/` for a new business domain
2. **New Infrastructure**: Create under `infrastructure/` if it's a shared technical capability
3. **Extend Existing**: Add methods to existing service if it's the same domain

## Dependency Injection Patterns

### Standard Injection

```typescript
@Injectable()
export class CreditService {
  constructor(
    private readonly connection: TransactionalConnection,
    private readonly communicationService: ChannelCommunicationService
  ) {}
}
```

### Optional Dependencies (Circular Dependency Handling)

When services have circular dependencies, use `@Optional()` decorator:

```typescript
@Injectable()
export class CreditService {
    constructor(
        private readonly connection: TransactionalConnection,
        @Optional() private readonly communicationService?: ChannelCommunicationService,
    ) {}

    // Always check if optional service exists before using
    if (this.communicationService) {
        await this.communicationService.sendBalanceChangeNotification(...);
    }
}
```

**When to use `@Optional()`:**

- When there's a potential circular dependency
- When the service can function without the dependency
- When the dependency is provided conditionally

**Best Practices:**

- Always check for existence before using optional dependencies
- Log warnings when optional dependencies are missing (if critical)
- Document why the dependency is optional

### Service Locator Pattern

For cases where DI is not possible (e.g., payment handlers), use a service locator:

```typescript
// services/payments/payment-handlers.ts
let creditServiceRef: any | null = null;

export function setPaymentHandlerCreditService(creditService: any): void {
  creditServiceRef = creditService;
}

// In credit plugin
@Injectable()
class PaymentHandlerInitializer implements OnModuleInit {
  constructor(private creditService: CreditService) {}
  onModuleInit() {
    setPaymentHandlerCreditService(this.creditService);
  }
}
```

**When to use Service Locator:**

- When DI is not available (e.g., in PaymentMethodHandler)
- As a last resort - prefer DI when possible

## Event-Driven Communication

### Channel Events System

The channel events system provides decoupled communication between services:

```
Service A → ChannelEventRouterService → Action Handlers → Service B
```

### Event Flow

1. **Service emits event** via `ChannelEventRouterService.routeEvent()`
2. **Router determines** which handlers should process the event
3. **Handlers execute** actions (SMS, push, in-app notifications)
4. **Actions are tracked** for analytics and rate limiting

### Event Types

Events are defined in `infrastructure/events/types/event-type.enum.ts`:

- `CUSTOMER_CREATED`
- `CUSTOMER_CREDIT_APPROVED`
- `ORDER_PAYMENT_SETTLED`
- `ML_TRAINING_COMPLETED`
- etc.

### Action Handlers

Handlers implement `IChannelActionHandler` interface:

- `InAppActionHandler` - Creates in-app notifications
- `PushActionHandler` - Sends push notifications
- `SmsActionHandler` - Sends SMS messages

### Using Events

```typescript
// In a service
await this.eventRouter.routeEvent({
  type: ChannelEventType.CUSTOMER_CREDIT_APPROVED,
  channelId,
  category: ActionCategory.CUSTOMER_COMMUNICATION,
  context: ctx,
  data: { customerId, creditLimit },
  targetCustomerId: customerId,
});
```

### Benefits

- **Decoupling**: Services don't need direct references
- **Extensibility**: Easy to add new action handlers
- **Configurability**: Per-channel event configuration
- **Tracking**: Built-in action tracking and analytics

## Plugin Architecture

### Plugin Structure

Each plugin follows this structure:

```
plugins/{domain}/
├── {domain}.plugin.ts      # Plugin registration
├── {domain}.resolver.ts    # GraphQL resolvers
├── {domain}.schema.ts      # GraphQL schema (if needed)
├── {domain}.entity.ts      # TypeORM entities (if needed)
├── permissions.ts          # Custom permissions (if needed)
└── *.subscriber.ts         # Event subscribers (if needed)
```

### Plugin Registration

```typescript
@VendurePlugin({
  imports: [PluginCommonModule],
  providers: [Service1, Service2, Resolver],
  adminApiExtensions: {
    schema: SCHEMA,
    resolvers: [Resolver],
  },
})
export class DomainPlugin {}
```

### Service Exposure

Services are provided in the plugin's `providers` array. They can be:

- Used within the plugin
- Exported for use by other plugins
- Injected into resolvers, subscribers, etc.

### Importing Services in Plugins

Always import from the new service locations:

```typescript
// ✅ Correct
import { CreditService } from '../../services/credit/credit.service';

// ❌ Wrong
import { CreditService } from './credit.service';
```

## Error Handling

### Service-Level Errors

Services should throw appropriate errors:

```typescript
if (!customer) {
  throw new UserInputError(`Customer ${customerId} not found`);
}
```

### Error Types

- `UserInputError` - Invalid user input
- `Error` - Generic errors
- Custom errors for domain-specific cases

### Logging

Use NestJS Logger:

```typescript
private readonly logger = new Logger('ServiceName');

this.logger.error(`Failed to process: ${error.message}`, error);
this.logger.log(`Operation completed successfully`);
```

## Transaction Management

### Using Transactions

Wrap operations in transactions for atomicity:

```typescript
async createOrder(ctx: RequestContext, input: CreateOrderInput): Promise<Order> {
    return this.connection.withTransaction(ctx, async (transactionCtx) => {
        // All operations here are atomic
        const order = await this.createDraftOrder(transactionCtx, input);
        await this.addItems(transactionCtx, order.id, input.items);
        return order;
    });
}
```

### When to Use Transactions

- Multiple related database operations
- Operations that must succeed or fail together
- Complex business logic with multiple steps

## Entity Relationship Patterns

### Many-to-Many Relationships

For M2M relationships (entity ↔ channel), use TypeORM relation manager (Vendure's standard approach).

**Why**: Vendure doesn't provide service methods for M2M assignments. TypeORM relation manager is the framework-standard approach.

**Generic Utility**: Use `assignEntityToChannel()` from `backend/src/utils/entity-relation.util.ts` for consistency.

**Example**:

```typescript
import { assignEntityToChannel } from '../../utils/entity-relation.util';

await assignEntityToChannel(connection, ctx, channelId, 'stockLocations', stockLocationId);
```

**Note**: For provisioning-specific patterns (Hybrid Strategy, verification patterns, etc.), see **[PROVISIONING_PRINCIPLES.md](./PROVISIONING_PRINCIPLES.md)**.

## Best Practices Summary

1. **Organize by Domain**: Group related services together
2. **Separate Infrastructure**: Keep technical services separate from business logic
3. **Use Events for Cross-Domain**: Avoid direct dependencies between domains
4. **Handle Circular Dependencies**: Use `@Optional()` when necessary
5. **Wrap in Transactions**: Use transactions for multi-step operations
6. **Log Appropriately**: Use structured logging with context
7. **Document Dependencies**: Comment on why dependencies are optional
8. **Keep Plugins Focused**: Each plugin should handle one domain

## Migration Notes

- All services moved from `plugins/` to `services/` or `infrastructure/`
- All imports updated to reference new locations
- Plugins reorganized into domain folders
- Circular dependencies handled with `@Optional()` pattern
- Service locator pattern maintained for payment handlers

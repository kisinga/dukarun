# Provisioning Principles

> **Vendure-first data-write philosophy for customer registration and provisioning**

This document establishes the guiding principles for entity creation during customer registration and provisioning flows. It defines when to use Vendure services versus direct repository access, and provides architectural context for the system.

**Scope**: This document is the single source of truth for provisioning patterns. For general infrastructure patterns (service organization, DI, events, plugins), see [INFRASTRUCTURE_PATTERNS.md](./INFRASTRUCTURE_PATTERNS.md).

## Core Principle: Vendure-First Data Writes

**Use Vendure services as the canonical data-writers. Direct repository writes are exceptions that must be documented.**

### Why Vendure Services?

Vendure services provide:

1. **Permission Checks**: Built-in authorization via `getPermittedChannels()` and role-based filtering
2. **Business Logic**: Validation, relationships, and side effects handled correctly
3. **Audit Trails**: Automatic tracking of entity creation and modifications
4. **Consistency**: Framework-level guarantees about data integrity
5. **Future-Proofing**: Framework updates maintain compatibility

### When Repository Access is Acceptable

Direct repository access is acceptable when:

1. **No Service Exists**: Entity has no Vendure service (e.g., `Seller`)
2. **Verification Only**: Loading entities with relations for verification (e.g., checking role-channel linkage)
3. **Edge Cases**: Operations that services don't support (e.g., updating user identifier after creation)
4. **Performance**: Bulk operations where service overhead is prohibitive
5. **Provisioning Bootstrap**: Initial creation of system-critical entities (Role, Administrator) where permission caching prevents service usage

**All repository usage must be documented with a comment explaining why the service wasn't used.**

## Provisioning Flow Architecture

### Entity Creation Order

The provisioning flow follows a strict sequence to ensure dependencies are satisfied:

```
1. Validate Input (currency, channel code, zones)
2. Create Seller (vendor entity for channel isolation)
3. Create Channel (company workspace) - requires seller
4. Create Stock Location and assign to channel
5. Create Payment Methods (Cash + M-Pesa) and assign to channel
6. Initialize Chart of Accounts (ledger accounts)
7. Create Role (access control) with all permissions and assign to channel
8. Create Administrator (user + admin) with role assignment
```

### Repository Bootstrap Pattern

During provisioning, the SuperAdmin creates the initial resources for a new tenant. However, Vendure's `RoleService` and `AdministratorService` enforce strict permission checks that require the user to have permissions on the _target channel_.

Because the channel is created within the same transaction, the permission system's cache often fails to reflect the SuperAdmin's access to this new channel immediately. This leads to `ForbiddenError` when using standard services.

**Strategy: Repository Bootstrap**

To resolve this, we treat the initial provisioning of **Role** and **Administrator** as system-level operations that bypass standard permission checks:

1. **Role Creation**: Use `connection.getRepository(Role).save()` to create the admin role and assign permissions/channels directly.
2. **User/Admin Creation**: Use repository access to create `User`, `NativeAuthenticationMethod`, and `Administrator` entities.
3. **Event Publishing**: Manually publish `RoleEvent` and `AdministratorEvent` to ensure system consistency (e.g., audit logs, side effects).

This is a documented exception to the "Vendure-First" rule, applied only during the critical bootstrapping phase.

### Hybrid Strategy Pattern

**When to Use**: Entities that need M2M assignment to channels during provisioning.

**Pattern**:

1. **Create via Service**: Use Vendure service (StockLocationService, PaymentMethodService, etc.)
   - Ensures validation, defaults, and business logic
   - Publishes entity creation events
2. **Assign via Repository**: Use TypeORM relation manager for M2M linking
   - Bypasses permission cache issues on new channels
   - Direct join table write (Vendure's internal pattern)
3. **Verify Assignment**: Always verify assignment succeeded (see Verification Pattern below)
4. **Publish ChangeChannelEvent**: Manually publish event for consistency
   - Ensures subscribers (indexers, etc.) are notified
   - Maintains event-driven architecture

**Examples**:

- StockLocation → Channel (stockLocations relation)
- PaymentMethod → Channel (paymentMethods relation)
- Asset → Channel (via AssetService.assignToChannel when available)

**Generic Implementation**:

- Utility functions: `backend/src/utils/entity-relation.util.ts`
- Base class: `backend/src/services/provisioning/hybrid-entity-provisioner.service.ts`

**Example Implementation**:

```typescript
// 1. Create via service
const stockLocation = await this.stockLocationService.create(ctx, input);

// 2. Assign via repository (using utility)
await assignEntityToChannel(this.connection, ctx, channelId, 'stockLocations', stockLocation.id);

// 3. Verify assignment succeeded
const isAssigned = await verifyEntityChannelAssignment(
  this.connection,
  ctx,
  channelId,
  'stockLocations',
  stockLocation.id
);
if (!isAssigned) {
  throw new Error(`Failed to assign stock location ${stockLocation.id} to channel ${channelId}`);
}

// 4. Publish event
await this.eventBus.publish(
  new ChangeChannelEvent(ctx, stockLocation, [channelId], 'assigned', StockLocation)
);
```

### RequestContext Management

**Problem**: Vendure services perform permission checks that require:

- `ctx.user` to be set (for role checks)
- `ctx.seller` to be set (for channel filtering via `getPermittedChannels()`)

**Solution**: Use `ProvisioningContextAdapter` to:

- Build seller-aware `RequestContext` for service calls
- Validate seller/channel/admin existence before operations
- Provide structured logging for debugging permission failures

#### Context Adapter Pattern

Use `ProvisioningContextAdapter` for building seller-aware contexts during provisioning:

```typescript
await this.contextAdapter.withSellerScope(ctx, channelId, async (scopedCtx) => {
  // Service calls here have proper seller/channel context
  return await this.someService.method(scopedCtx, ...);
});
```

**Benefits**:

- Validates seller/channel existence before operations
- Automatically sets seller on context for permission checks
- Provides structured debug logging (feature-flag friendly)
- Ensures transactional consistency

#### Context Utility Functions

Reusable utilities in `backend/src/utils/request-context.util.ts`:

- `withChannel()`: Set channel on context temporarily
- `withSeller()`: Set seller on context temporarily
- `withSuperadminUser()`: Set superadmin user for system operations
- `withSellerFromChannel()`: Get seller from channel and set on context

**Pattern**: All utilities preserve transaction context by modifying the same RequestContext object. This ensures that operations within a transaction share the same context state.

**Example**:

```typescript
await withChannel(ctx, channel, async (ctxWithChannel) => {
  return await withSellerFromChannel(
    ctxWithChannel,
    channelId,
    connection,
    async (ctxWithSeller) => {
      // Context now has both channel and seller set
      return await someService.method(ctxWithSeller, ...);
    }
  );
});
```

### Service Responsibilities

Each provisioner service handles one Line of Business (LOB):

- **SellerProvisionerService**: Creates seller entities (uses repository - no service exists)
- **ChannelProvisionerService**: Creates channels via `ChannelService.create()`
- **StoreProvisionerService**: Creates stock locations via `StockLocationService.create()`. Assigns to channel via **Hybrid Strategy** (see below).
- **PaymentProvisionerService**: Creates payment methods via `PaymentMethodService.create()`. Assigns to channel via **Hybrid Strategy**.
- **RoleProvisionerService**: Creates roles via **Repository Bootstrap** (bypassing `RoleService.create` due to permission cache issues)
- **AccessProvisionerService**: Creates users and administrators via **Repository Bootstrap**. Updates via repository to ensure consistency.
- **ChartOfAccountsService**: Initializes ledger accounts (uses repository - custom domain)

## Repository Bootstrap Pattern

### When to Use

Repository Bootstrap is used for initial provisioning of system-critical entities where permission caching prevents service usage:

- **Role Creation**: Initial admin role for new channel
- **Administrator Creation**: Initial admin user for new channel
- **User Creation**: Initial user account during provisioning

**Upgrade checklist:** On Vendure upgrade, verify that RoleService and AdministratorService still do not offer a supported bootstrap/system context; if they do, consider migrating to it and removing repository bootstrap.

### Example: Role Creation

```typescript
// ✅ CORRECT: Use Repository Bootstrap for initial role creation
// Bypasses RoleService.create() permission checks
const role = new Role({
  code: roleCode,
  description: ...,
  permissions: ALL_ADMIN_PERMISSIONS,
  channels: [channel],
});
await roleRepo.save(role);
await eventBus.publish(new RoleEvent(ctx, role, 'created', ...));
```

## Many-to-Many Assignment Pattern

**Standard Approach**: TypeORM relation manager (Vendure's internal pattern)

**Why**: Vendure doesn't provide service methods for M2M assignments. TypeORM relation manager is the framework-standard approach.

All channel M2M assignment (stockLocations, paymentMethods, etc.) must go through `assignEntityToChannel` / `verifyEntityChannelAssignment` for consistency.

**Direct Usage** (when utility is not available):

```typescript
// ✅ ACCEPTABLE: TypeORM relation manager for M2M (no service methods exist)
// Exception per PROVISIONING_PRINCIPLES.md: "No Service Exists" OR "Provisioning Bootstrap"
const channelRepo = connection.getRepository(ctx, Channel);
await channelRepo
  .createQueryBuilder()
  .relation(Channel, 'stockLocations') // or 'paymentMethods'
  .of(channelId)
  .add(stockLocationId);
```

**Using Generic Utility** (Recommended):

```typescript
// ✅ PREFERRED: Use generic utility for consistency
import { assignEntityToChannel } from '../../../utils/entity-relation.util';

await assignEntityToChannel(connection, ctx, channelId, 'stockLocations', stockLocationId);
```

### Assignment Verification Pattern (Required)

After assignment, always verify the assignment succeeded to ensure it persisted correctly within the transaction:

```typescript
import {
  assignEntityToChannel,
  verifyEntityChannelAssignment,
} from '../../../utils/entity-relation.util';

// 1. Assign entity to channel
await assignEntityToChannel(connection, ctx, channelId, 'stockLocations', stockLocationId);

// 2. Verify assignment succeeded
const isAssigned = await verifyEntityChannelAssignment(
  connection,
  ctx,
  channelId,
  'stockLocations',
  stockLocationId
);

// 3. Throw error if verification fails
if (!isAssigned) {
  throw new Error(
    `Failed to assign stock location ${stockLocationId} to channel ${channelId}. Assignment verification failed.`
  );
}
```

**Why Verification is Required**:

- TypeORM relation manager operations may not be immediately visible within a transaction
- Explicit flush ensures changes are persisted before verification
- Verification catches assignment failures immediately, preventing silent failures
- Provides clear error messages for debugging

**Implementation Details**:

- `assignEntityToChannel()` saves the channel entity to ensure persistence within the transaction
- Verification should happen immediately after assignment within the same transaction
- This pattern is used in `StoreProvisionerService` and `ChannelAssignmentService`

**See Also**: `backend/src/utils/entity-relation.util.ts` for implementation details.

## Error Handling

All provisioning operations must:

1. **Use Structured Errors**: `RegistrationErrorService` provides consistent error codes
2. **Log Context**: Include channel ID, seller ID, and operation type in logs
3. **Audit Trails**: `RegistrationAuditorService` logs all entity creation
4. **Transaction Safety**: All operations run within `connection.withTransaction()`

**Error Handling Pattern**:

```typescript
try {
  // Operation
} catch (error: any) {
  // If it's already our custom error, re-throw it
  if (error.code === 'CUSTOM_ERROR_CODE') {
    throw error;
  }
  // Otherwise, wrap the error
  const errorMessage = error instanceof Error ? error.message : String(error);
  this.logger.error(`Operation failed: ${errorMessage}`);
  throw this.errorService.createError('CUSTOM_ERROR_CODE', `Operation failed: ${errorMessage}`);
}
```

## Testing Requirements

Behavioral tests must verify:

- [ ] Seller created and linked to channel
- [ ] Channel created with correct configuration
- [ ] Stock location created and assigned to channel (with verification)
- [ ] Payment methods (Cash + M-Pesa) created and assigned to channel
- [ ] Chart of Accounts initialized with all required accounts
- [ ] Role created with all required permissions and assigned to channel
- [ ] Administrator created with role assignment
- [ ] User-role linkage verified
- [ ] All entities created (Bootstrap entities via Repo, others via Services)
- [ ] Assignment verification succeeds for all M2M relationships

---

## Related Documentation

- **[Customer Provisioning Guide](./CUSTOMER_PROVISIONING.md)**: Step-by-step provisioning checklist
- **[Registration Channel Setup](./REGISTRATION_CHANNEL_SETUP.md)**: Channel configuration details
- **[Infrastructure Patterns](./INFRASTRUCTURE_PATTERNS.md)**: General infrastructure patterns (service organization, DI, events, plugins)
- **[Ledger Architecture](./LEDGER_ARCHITECTURE.md)**: Financial system design
- **[Architecture Overview](../ARCHITECTURE.md)**: Complete system design

---

**Last Updated**: 2025-11-24
**Version**: 1.1
**Status**: Active

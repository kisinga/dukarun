# Channel Registration Setup

## Overview

This document describes the automatic channel setup that occurs during business registration, including seller creation, zone configuration, and stock location linking.

## Registration Flow

When a new business is registered, the following entities are automatically created in order:

1. **Seller** - One seller per channel for isolation and future-proofing
2. **Channel** - Company workspace with proper configuration
3. **Stock Location** - Physical store location
4. **Payment Methods** - Cash and M-Pesa payment handlers
5. **Role** - Admin role with full permissions
6. **Administrator** - User account with role assignment

## Channel Configuration

### Seller Assignment

- **One seller per channel** - Each business gets its own isolated seller entity
- Seller name format: `"{companyName} Seller"`
- Provides proper separation of concerns and future-proofs for features that rely on seller-channel relationships

### Zone Configuration

- **Default Shipping Zone**: Kenya zone (looked up by name "Kenya")
- **Default Tax Zone**: Kenya zone (same zone for both shipping and tax)

**Prerequisites:**
- The "Kenya" zone must exist in the system before registration
- This zone is automatically created during bootstrap via `ensureKenyaContext` (see [INFRASTRUCTURE.md](./INFRASTRUCTURE.md#required-database-state))
- If automatic seeding is disabled (`AUTO_SEED_KENYA=false`), the zone must be created manually in Vendure admin: Settings → Zones

### Tax Settings

- **pricesIncludeTax**: `true` - All prices displayed include tax

### Stock Location Linking

- Stock location is automatically created during registration
- Location is automatically assigned to the channel via many-to-many relationship
- Assignment is verified after save to ensure proper linking

**Implementation Details**: See [PROVISIONING_PRINCIPLES.md](./PROVISIONING_PRINCIPLES.md) for:
- Hybrid Strategy Pattern
- Many-to-Many Assignment Pattern
- Assignment Verification Pattern

## Implementation Details

### Services

- **SellerProvisionerService** - Creates seller per channel (uses repository - no service exists)
- **ChannelProvisionerService** - Creates channel with seller, zones, and tax settings (uses ChannelService)
- **StoreProvisionerService** - Creates stock location and assigns to channel (uses Hybrid Strategy)
- **PaymentProvisionerService** - Creates payment methods and assigns to channel (uses Hybrid Strategy)
- **RoleProvisionerService** - Creates admin role (uses Repository Bootstrap)
- **AccessProvisionerService** - Creates administrator and user (uses Repository Bootstrap)

**For detailed patterns and principles, see [PROVISIONING_PRINCIPLES.md](./PROVISIONING_PRINCIPLES.md)**.


## Testing

See test suite in `backend/spec/services/auth/registration.service.spec.ts` and `backend/spec/services/auth/registration-flow.integration.spec.ts` for:
- Seller creation per channel
- Kenya zone assignment
- pricesIncludeTax = true
- Stock location linking
- Complete registration flow validation


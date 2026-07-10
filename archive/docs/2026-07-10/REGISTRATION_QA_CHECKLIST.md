# Registration Flow QA Checklist

This document provides a comprehensive QA checklist for testing the registration and login flows, covering all edge cases and validation scenarios.

## Prerequisites

Before testing, ensure:

- [ ] Backend server is running
- [ ] Redis is available and connected
- [ ] Default channel has shipping and tax zones configured
- [ ] Payment handlers (cash-payment, mpesa-payment) are registered in vendure-config.ts
- [ ] Database is clean or existing test data is noted

## Test Scenarios

### 1. Successful Registration Flow

**Test Case:** Complete successful registration with all valid inputs

**Steps:**

1. Navigate to signup page
2. Enter valid company information (company name, code, currency)
3. Enter valid admin information (first name, last name, phone, optional email)
4. Enter valid store information (store name, optional address)
5. Request OTP
6. Enter correct OTP
7. Complete registration

**Expected Results:**

- [ ] Registration data stored in Redis temporarily
- [ ] OTP sent successfully
- [ ] Channel created with correct code and token
- [ ] Stock location created and assigned to channel
- [ ] Two payment methods (Cash + M-Pesa) created and assigned to channel
- [ ] Admin role created with ALL required permissions (see Permission Checklist below)
- [ ] Role properly linked to channel (visible in Vendure admin UI)
- [ ] User created with phone number as identifier
- [ ] Administrator created and linked to user
- [ ] User's authorizationStatus set to PENDING
- [ ] All audit logs created (channel, stock location, payment methods, role, user, admin)
- [ ] User redirected to login page with success message

**Verification:**

- [ ] Check database: Channel exists with correct code
- [ ] Check database: Stock location exists and linked to channel
- [ ] Check database: Payment methods exist and linked to channel
- [ ] Check database: Role exists with correct permissions and channel linkage
- [ ] Check database: User exists with phone as identifier and PENDING status
- [ ] Check database: Administrator exists and linked to user
- [ ] Check Vendure admin UI: Role is visible and shows correct permissions
- [ ] Check audit logs: All entity creation events logged

---

### 2. Authorization Status Enforcement

**Test Case:** PENDING users cannot login

**Steps:**

1. Complete registration (user will have PENDING status)
2. Attempt to login with phone number
3. Enter correct OTP

**Expected Results:**

- [ ] Login request fails with success: false
- [ ] Error message: "Account pending approval. You'll be able to log in after an admin approves your account."
- [ ] authorizationStatus returned as PENDING
- [ ] No session token created

**Test Case:** REJECTED users cannot login

**Steps:**

1. Manually set a user's authorizationStatus to REJECTED in database
2. Attempt to login with phone number
3. Enter correct OTP

**Expected Results:**

- [ ] Login request fails with success: false
- [ ] Error message: "Account rejected. Please contact support if you believe this is an error."
- [ ] authorizationStatus returned as REJECTED
- [ ] No session token created

**Test Case:** APPROVED users can login

**Steps:**

1. Manually set a user's authorizationStatus to APPROVED in database
2. Attempt to login with phone number
3. Enter correct OTP

**Expected Results:**

- [ ] Login request succeeds with success: true
- [ ] Session token created and returned
- [ ] authorizationStatus returned as APPROVED
- [ ] User can access the system

---

### 3. Validation Errors

**Test Case:** Invalid currency code

**Steps:**

1. Submit registration with invalid currency code (e.g., "XXX")

**Expected Results:**

- [ ] Error: `REGISTRATION_CURRENCY_INVALID: Invalid currency code "XXX". Must be a valid CurrencyCode enum value.`

**Test Case:** Duplicate channel code

**Steps:**

1. Complete registration with company code "test-company"
2. Attempt another registration with same company code "test-company"

**Expected Results:**

- [ ] Error: `REGISTRATION_CHANNEL_CODE_EXISTS: Channel with code "test-company" already exists. Please choose a different company code.`
- [ ] First registration succeeds, second fails

**Test Case:** Duplicate phone number

**Steps:**

1. Complete registration with phone number "0712345678"
2. Attempt another registration with same phone number "0712345678"

**Expected Results:**

- [ ] Error: `REGISTRATION_DUPLICATE_USER: An account with this phone number already exists. Please login instead.`

**Test Case:** Missing default zones

**Steps:**

1. Remove defaultShippingZone or defaultTaxZone from default channel
2. Attempt registration

**Expected Results:**

- [ ] Error: `REGISTRATION_ZONES_MISSING: Default zones not configured...`
- [ ] Clear instructions provided on how to fix the configuration

**Test Case:** Phone number format consistency

**Steps:**

1. Submit registration with phone "712345678" (missing leading 0)
2. Submit registration with phone "0712345678" (with leading 0)

**Expected Results:**

- [ ] Both formats normalized to "0712345678"
- [ ] User.identifier stored as "0712345678"
- [ ] Administrator.emailAddress stored as "0712345678"

---

### 4. Payment Method Validation

**Test Case:** Missing payment handler (Cash)

**Steps:**

1. Temporarily remove cashPaymentHandler from paymentOptions.paymentMethodHandlers
2. Attempt registration

**Expected Results:**

- [ ] Error: `REGISTRATION_PAYMENT_HANDLER_MISSING: Payment handler 'cash-payment' is not configured...`
- [ ] Clear instructions on how to fix

**Test Case:** Missing payment handler (M-Pesa)

**Steps:**

1. Temporarily remove mpesaPaymentHandler from paymentOptions.paymentMethodHandlers
2. Attempt registration

**Expected Results:**

- [ ] Error: `REGISTRATION_PAYMENT_HANDLER_MISSING: Payment handler 'mpesa-payment' is not configured...`
- [ ] Clear instructions on how to fix

**Test Case:** Payment method assignment validation

**Steps:**

1. Complete successful registration
2. Check database for channel-payment method assignments

**Expected Results:**

- [ ] Channel has exactly 2 payment methods assigned (Cash + M-Pesa)
- [ ] Both payment methods verified after assignment (reload check passes)

---

### 5. Role Permissions & Linkage

**Test Case:** Role has all required permissions

**Steps:**

1. Complete registration
2. Check role permissions in database or Vendure admin UI

**Expected Results:**

- [ ] Role has ALL permissions listed in Permission Checklist below
- [ ] Permissions include: Asset, Catalog, Customer, Order, Product, ProductVariant, StockLocation, Payment, Fulfillment, Settings

**Test Case:** Role-channel linkage

**Steps:**

1. Complete registration
2. Check role-channel linkage

**Expected Results:**

- [ ] Role is linked to the newly created channel
- [ ] Verification check passes (role.channels includes channel)
- [ ] Role is visible in Vendure admin UI when viewing channels

**Test Case:** Role creation via RoleService vs Repository

**Steps:**

1. Complete registration
2. Check logs for role creation method

**Expected Results:**

- [ ] Logs show either "Role created via RoleService" or "Role created via repository"
- [ ] Role is functional regardless of creation method
- [ ] Role is visible in Vendure admin UI

**Test Case:** User-role linkage

**Steps:**

1. Complete registration
2. Check user-role linkage

**Expected Results:**

- [ ] User is linked to the admin role
- [ ] Verification check passes (user.roles includes role)

---

### 6. Stock Location Validation

**Test Case:** Stock location assignment

**Steps:**

1. Complete registration
2. Check stock location-channel linkage

**Expected Results:**

- [ ] Stock location created with correct name and description
- [ ] Stock location assigned to channel (many-to-many relationship)
- [ ] Verification check passes (channel.stockLocations includes stock location)

**Test Case:** Frontend stock location availability

**Steps:**

1. Complete registration
2. Login as approved user
3. Navigate to POS/product creation page

**Expected Results:**

- [ ] Stock location service returns at least one location
- [ ] No error: "No stock locations found..."
- [ ] Default location is available

---

### 7. Partial Failure Recovery

**Test Case:** Transaction rollback on channel creation failure

**Steps:**

1. Set up scenario where channel creation would fail (e.g., duplicate code check fails due to race condition)
2. Attempt registration

**Expected Results:**

- [ ] Transaction rolls back
- [ ] No partial entities created (no orphaned stock locations, payment methods, roles, users)
- [ ] Error message with REGISTRATION\_ prefix for easy debugging

**Test Case:** Transaction rollback on stock location creation failure

**Steps:**

1. Mock stock location creation to fail
2. Attempt registration

**Expected Results:**

- [ ] Transaction rolls back
- [ ] Channel creation also rolled back
- [ ] No partial state

**Test Case:** Transaction rollback on role creation failure

**Steps:**

1. Mock role creation to fail
2. Attempt registration

**Expected Results:**

- [ ] Transaction rolls back
- [ ] Channel, stock location, payment methods rolled back
- [ ] No partial state

---

### 8. Idempotency

**Test Case:** Registration retry after partial failure

**Steps:**

1. Start registration
2. Cause transaction to fail mid-way
3. Retry registration with same phone number and company code

**Expected Results:**

- [ ] If user was created but provisioning incomplete: Error "Account already exists"
- [ ] If channel was created but provisioning incomplete: Error "Channel code already exists"
- [ ] Manual repair required by ops (documented in error messages)

**Test Case:** Multiple registration attempts with same data

**Steps:**

1. Complete registration
2. Attempt registration again with same phone and company code

**Expected Results:**

- [ ] First registration succeeds
- [ ] Second registration fails with duplicate user/channel error

---

### 9. Audit Logging Completeness

**Test Case:** All entity creations are audited

**Steps:**

1. Complete registration
2. Check audit logs

**Expected Results:**

- [ ] Audit log: channel.created (with channelId, code, companyName, currency)
- [ ] Audit log: stocklocation.created (with stockLocationId, name, channelId)
- [ ] Audit log: paymentmethod.created (for Cash, with channelId, code, handler)
- [ ] Audit log: paymentmethod.created (for M-Pesa, with channelId, code, handler)
- [ ] Audit log: role.created (with roleId, code, channelId, permissionCount)
- [ ] Audit log: user.created (with userId, identifier, adminId)
- [ ] Audit log: admin.created (with adminId, userId, firstName, lastName)

---

### 10. Error Messages & Debugging

**Test Case:** Error message clarity

**Steps:**

1. Trigger various validation errors
2. Check error messages

**Expected Results:**

- [ ] All errors have REGISTRATION\_ prefix for easy filtering
- [ ] Error messages are user-friendly and actionable
- [ ] Error messages include enough context for debugging (channelId, companyCode, etc.)

**Test Case:** Logging for troubleshooting

**Steps:**

1. Complete registration
2. Check console logs

**Expected Results:**

- [ ] Each step logged with clear prefix: `[RegistrationService]`
- [ ] Error logs include stack traces
- [ ] Success logs include entity IDs for verification

---

## Permission Checklist

The admin role created during registration MUST include ALL of the following permissions:

### Asset

- [ ] CreateAsset
- [ ] ReadAsset
- [ ] UpdateAsset
- [ ] DeleteAsset

### Catalog

- [ ] CreateCatalog
- [ ] ReadCatalog
- [ ] UpdateCatalog
- [ ] DeleteCatalog

### Customer

- [ ] CreateCustomer
- [ ] ReadCustomer
- [ ] UpdateCustomer
- [ ] DeleteCustomer

### Order

- [ ] CreateOrder
- [ ] ReadOrder
- [ ] UpdateOrder
- [ ] DeleteOrder

### Product

- [ ] CreateProduct
- [ ] ReadProduct
- [ ] UpdateProduct
- [ ] DeleteProduct

### ProductVariant

- [ ] CreateProductVariant
- [ ] ReadProductVariant
- [ ] UpdateProductVariant
- [ ] DeleteProductVariant

### StockLocation

- [ ] CreateStockLocation
- [ ] ReadStockLocation
- [ ] UpdateStockLocation

### Payment

- [ ] CreatePayment
- [ ] ReadPayment
- [ ] UpdatePayment
- [ ] SettlePayment

### Fulfillment

- [ ] CreateFulfillment
- [ ] ReadFulfillment
- [ ] UpdateFulfillment

### Settings

- [ ] ReadSettings
- [ ] UpdateSettings

**Total: 38 permissions**

---

## Edge Cases Summary

The following edge cases are explicitly handled and should be tested:

1. ✅ **Partial Failure Recovery**: Transaction rollback ensures no orphaned entities
2. ✅ **Idempotency**: Duplicate checks prevent re-registration with same phone/company code
3. ✅ **Duplicate Prevention**: User and channel uniqueness validated before creation
4. ✅ **Role Assignment**: Role-channel-user linkages verified after creation
5. ✅ **Context Issues**: Uses RequestContext.empty() for privileged operations, falls back to repository if needed
6. ✅ **User permissions on newly created role**: Full permission set verified
7. ✅ **Channel token uniqueness validation**: Checked before creation
8. ✅ **Stock location assignment validation**: Verified after assignment
9. ✅ **Payment method handler existence check**: Errors caught and clearly reported
10. ✅ **Zone validation (shipping/tax zones)**: Validated with clear error messages
11. ✅ **Currency code validation**: Validated against CurrencyCode enum
12. ✅ **Phone number format consistency**: Normalized at start, used consistently
13. ✅ **Duplicate registration prevention**: User and channel checks in place
14. ✅ **Transaction rollback on partial failure**: All operations wrapped in transaction
15. ✅ **Audit logging completeness**: All entity creations logged

---

## Manual Testing Instructions

### Setup Test Environment

```bash
# Ensure backend is running
npm run start:dev

# Ensure Redis is available
redis-cli ping

# Check default channel has zones
# Navigate to Vendure admin UI → Settings → Channels → Default Channel
# Verify defaultShippingZone and defaultTaxZone are set
```

### Test Registration Flow

1. Open signup page
2. Fill out registration form
3. Request OTP
4. Verify OTP (check console for OTP in development)
5. Complete registration
6. Verify user cannot login (PENDING status)
7. Manually approve user in database: `UPDATE user SET customFields = jsonb_set(customFields, '{authorizationStatus}', '"APPROVED"') WHERE identifier = '0712345678';`
8. Verify user can login after approval

### Database Verification Queries

```sql
-- Check channel creation
SELECT id, code, token FROM channel WHERE code = 'test-company';

-- Check stock location assignment
SELECT sl.id, sl.name, c.id as channel_id
FROM stock_location sl
JOIN channel_stock_locations csl ON sl.id = csl.stock_location_id
JOIN channel c ON c.id = csl.channel_id
WHERE c.code = 'test-company';

-- Check payment methods assignment
SELECT pm.id, pm.code, pm.handler_code
FROM payment_method pm
JOIN channel_payment_methods cpm ON pm.id = cpm.payment_method_id
JOIN channel c ON c.id = cpm.channel_id
WHERE c.code = 'test-company';

-- Check role creation and permissions
SELECT r.id, r.code, r.description, array_length(r.permissions, 1) as permission_count
FROM role r
WHERE r.code = 'test-company-admin';

-- Check role-channel linkage
SELECT r.id, r.code, c.id as channel_id, c.code as channel_code
FROM role r
JOIN role_channels rc ON r.id = rc.role_id
JOIN channel c ON c.id = rc.channel_id
WHERE r.code = 'test-company-admin';

-- Check user creation
SELECT u.id, u.identifier, u.custom_fields->>'authorizationStatus' as status
FROM "user" u
WHERE u.identifier = '0712345678';

-- Check user-role linkage
SELECT u.id, u.identifier, r.code as role_code
FROM "user" u
JOIN user_roles ur ON u.id = ur.user_id
JOIN role r ON r.id = ur.role_id
WHERE u.identifier = '0712345678';

-- Check administrator creation
SELECT a.id, a."emailAddress", a."firstName", a."lastName", u.id as user_id
FROM administrator a
JOIN "user" u ON a."userId" = u.id
WHERE u.identifier = '0712345678';
```

---

## Known Limitations

1. **Full Idempotency**: If a transaction fails after user creation but before all provisioning completes, manual repair is required. The duplicate checks will prevent re-registration, but the partial state must be cleaned up manually.

2. **Chart of Accounts**: Ledger account initialization for new channels is not yet implemented. This must be handled separately or via migration.

3. **RoleService Fallback**: If RoleService.create() fails due to permission issues, the code falls back to repository-based creation. Both paths are functional, but RoleService is preferred for integration with Vendure's role management system.

---

## Related Documentation

- [CUSTOMER_PROVISIONING.md](./CUSTOMER_PROVISIONING.md) - Customer provisioning requirements
- [REGISTRATION_FIELDS.md](./REGISTRATION_FIELDS.md) - Registration field specifications
- [AUTHORIZATION_WORKFLOW.md](./AUTHORIZATION_WORKFLOW.md) - Authorization workflow documentation

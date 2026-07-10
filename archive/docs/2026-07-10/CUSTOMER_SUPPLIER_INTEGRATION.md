# Customer and Supplier Integration

## Overview

This document describes the integration of customers and suppliers in the Dukarun system using Vendure's Customer entity with custom fields.

## Key Insight

**Every supplier is also a customer** - this design allows suppliers to also place orders and be managed through the same customer system.

## Architecture

### Backend (Vendure)

The system extends Vendure's `Customer` entity with custom fields to support both customer and supplier functionality:

```typescript
Customer: [
    {
        name: 'isSupplier',
        type: 'boolean',
        label: [{ languageCode: LanguageCode.en, value: 'Is Supplier' }],
        description: [{ languageCode: LanguageCode.en, value: 'Marks this customer as a supplier' }],
        defaultValue: false,
        public: false,
        nullable: false,
        ui: { tab: 'Business Type' },
    },
    {
        name: 'supplierType',
        type: 'string',
        label: [{ languageCode: LanguageCode.en, value: 'Supplier Type' }],
        description: [{ languageCode: LanguageCode.en, value: 'Type of supplier (e.g., Manufacturer, Distributor, etc.)' }],
        public: true,
        nullable: true,
        ui: { tab: 'Supplier Info' },
    },
    {
        name: 'contactPerson',
        type: 'string',
        label: [{ languageCode: LanguageCode.en, value: 'Contact Person' }],
        description: [{ languageCode: LanguageCode.en, value: 'Primary contact person for this supplier' }],
        public: true,
        nullable: true,
        ui: { tab: 'Supplier Info' },
    },
    {
        name: 'taxId',
        type: 'string',
        label: [{ languageCode: LanguageCode.en, value: 'Tax ID' }],
        description: [{ languageCode: LanguageCode.en, value: 'Tax identification number' }],
        public: true,
        nullable: true,
        ui: { tab: 'Supplier Info' },
    },
    {
        name: 'paymentTerms',
        type: 'string',
        label: [{ languageCode: LanguageCode.en, value: 'Payment Terms' }],
        description: [{ languageCode: LanguageCode.en, value: 'Payment terms for this supplier (e.g., Net 30, COD, etc.)' }],
        public: true,
        nullable: true,
        ui: { tab: 'Supplier Info' },
    },
    {
        name: 'notes',
        type: 'text',
        label: [{ languageCode: LanguageCode.en, value: 'Supplier Notes' }],
        description: [{ languageCode: LanguageCode.en, value: 'Additional notes about this supplier' }],
        public: true,
        nullable: true,
        ui: { tab: 'Supplier Info' },
    },
    {
        name: 'isCreditApproved',
        type: 'boolean',
        label: [{ languageCode: LanguageCode.en, value: 'Credit Approved' }],
        description: [{ languageCode: LanguageCode.en, value: 'Whether the customer is eligible for credit purchases' }],
        defaultValue: false,
        public: false,
        nullable: false,
        ui: { tab: 'Financial' },
    },
    {
        name: 'creditLimit',
        type: 'float',
        label: [{ languageCode: LanguageCode.en, value: 'Credit Limit' }],
        description: [{ languageCode: LanguageCode.en, value: 'Maximum allowed credit balance in currency units' }],
        defaultValue: 0,
        public: false,
        nullable: false,
        ui: { tab: 'Financial' },
    },
    {
        name: 'outstandingAmount',
        type: 'float',
        label: [{ languageCode: LanguageCode.en, value: 'Outstanding Amount' }],
        description: [{ languageCode: LanguageCode.en, value: 'Amount owed to this supplier (positive) or amount customer owes (negative)' }],
        defaultValue: 0,
        public: true,
        nullable: false,
        ui: { tab: 'Financial' },
    },
],
```

### Database Schema

The system uses two migrations to manage the custom fields:

1. **1760550000000-AddCustomerSupplierFields.ts** - Initial migration adding all custom fields
2. **1760560000000-UpdateCustomerSupplierFields.ts** - Update migration removing `supplierCode` and adding `outstandingAmount`

### Field Mapping

The frontend uses business-friendly field names that are mapped to Vendure's standard fields:

- **Business Name** → `firstName` (Vendure field)
- **Contact Person** → `lastName` (Vendure field)
- **Email Address** → `emailAddress` (Vendure field)
- **Phone Number** → `phoneNumber` (Vendure field)

This mapping allows us to use business-appropriate terminology in the UI while maintaining compatibility with Vendure's existing schema.

## Frontend Implementation

### Form Structure

#### Customer Creation Form

- **Business Name** (required, min 2 characters)
- **Contact Person** (required, min 2 characters)
- **Email Address** (optional, email validation)
- **Phone Number** (required, format: 0XXXXXXXXX)

#### Supplier Creation Form (Two-Step Process)

**Step 1: Basic Information**

- **Business Name** (required, min 2 characters)
- **Contact Person** (required, min 2 characters)
- **Email Address** (optional, email validation)
- **Phone Number** (required, format: 0XXXXXXXXX)

**Step 2: Supplier Details** (All Optional)

- **Supplier Type** (dropdown: Manufacturer, Distributor, Wholesaler, Retailer, Service Provider, Other)
- **Contact Person** (text field for additional contact info)
- **Payment Terms** (dropdown: Net 15, Net 30, Net 60, COD, Prepaid, Other)
- **Notes** (textarea for additional information)

### Shared Components

#### PersonEditFormComponent

Reusable form component for editing basic person information:

- Used by both customer and supplier edit forms
- Mobile-optimized with touch-friendly inputs
- Consistent validation and error handling
- Signal-based reactive updates

#### Field Validation

**Phone Number Format**

- **Pattern**: `^0\d{9}$` (10 digits starting with 0)
- **Example**: `0123456789`
- **Error Message**: "Phone must be in format 0XXXXXXXXX (10 digits starting with 0)"

**Email Validation**

- Standard email format validation
- Optional field (no required validation)

**Business Name & Contact Person**

- Required fields
- Minimum 2 characters
- No maximum length restriction

### Mobile Optimization

All forms are optimized for mobile devices:

- Touch-friendly input fields
- Responsive design with max-width containers
- Clear visual hierarchy with emojis for field identification
- Proper keyboard types (tel for phone, email for email)
- Accessible labels and error messages

## Payment Tracking

### Outstanding Amount Field

The `outstandingAmount` custom field tracks financial relationships:

```typescript
// Company owes supplier $500
customer.outstandingAmount = 500.0;

// Customer owes company $300
customer.outstandingAmount = -300.0;

// No outstanding balance
customer.outstandingAmount = 0.0;
```

### Stats Integration

Replace address-based stats with outstanding amount tracking:

- Show total amount owed to suppliers
- Show total amount owed by customers
- Display individual balances in customer/supplier list views

## Usage Examples

### Creating a Customer

```typescript
const customerData = {
  businessName: 'ABC Company Ltd',
  contactPerson: 'John Smith',
  emailAddress: 'john@abccompany.com',
  phoneNumber: '0123456789',
};

const customerId = await customerService.createCustomer(customerData);
```

### Creating a Supplier

```typescript
const supplierData = {
  // Basic info (mapped to firstName/lastName)
  businessName: 'XYZ Suppliers',
  contactPerson: 'Jane Doe',
  emailAddress: 'jane@xyzsuppliers.com',
  phoneNumber: '0987654321',

  // Supplier-specific fields
  supplierType: 'Manufacturer',
  paymentTerms: 'Net 30',
  notes: 'Reliable supplier for electronics',
};

const supplierId = await supplierService.createSupplier(supplierData);
```

### Updating Outstanding Amount

```typescript
// Mark customer as supplier and set outstanding amount
await customerService.updateCustomer(customerId, {
  customFields: {
    isSupplier: true,
    outstandingAmount: 1500.0, // Company owes supplier $1500
  },
});
```

## Component Architecture

### Customer Components

- **CustomerCreateComponent** - Single-step customer creation form
- **CustomerEditComponent** - Uses PersonEditFormComponent for basic info editing
- **CustomersComponent** - List view with outstanding amount display

### Supplier Components

- **SupplierCreateComponent** - Two-step supplier creation process
- **SupplierEditComponent** - Two-step editing with shared PersonEditFormComponent
- **SuppliersComponent** - List view with outstanding amount display

### Shared Components

- **PersonEditFormComponent** - Reusable form for basic person information
- **Form validation utilities** - Consistent error handling across forms

## Database Migrations

### Migration 1: AddCustomerSupplierFields

```sql
-- Adds initial custom fields for supplier functionality
ALTER TABLE customer ADD COLUMN "customFieldsIssupplier" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE customer ADD COLUMN "customFieldsSuppliertype" VARCHAR(255);
ALTER TABLE customer ADD COLUMN "customFieldsContactperson" VARCHAR(255);
ALTER TABLE customer ADD COLUMN "customFieldsTaxid" VARCHAR(255);
ALTER TABLE customer ADD COLUMN "customFieldsPaymentterms" VARCHAR(255);
ALTER TABLE customer ADD COLUMN "customFieldsNotes" TEXT;
```

### Migration 2: UpdateCustomerSupplierFields

```sql
-- Removes supplierCode and adds outstandingAmount
ALTER TABLE customer DROP COLUMN IF EXISTS "customFieldsSuppliercode";
ALTER TABLE customer ADD COLUMN IF NOT EXISTS "customFieldsOutstandingamount" DOUBLE PRECISION NOT NULL DEFAULT 0;
```

## Benefits

1. **Unified Management** - Single system for both customers and suppliers
2. **Flexible Relationships** - Suppliers can also be customers
3. **Financial Tracking** - Built-in outstanding amount tracking
4. **Mobile-First** - Optimized for mobile business operations
5. **KISS Principle** - Simple, maintainable implementation
6. **Scalable** - Foundation for future payment and accounting features
7. **Consistent UX** - Shared components ensure consistent user experience

### Credit Management Workflow (Nov 2025)

- Credit approvals and limit adjustments flow through the new credit plugin (`backend/src/plugins/credit`).
- Back-office roles need the custom permissions `ApproveCustomerCredit` (toggle eligibility) and `ManageCustomerCreditLimit` (set ceilings).
- The POS blocks credit checkout unless the customer is approved **and** `creditLimit - abs(outstandingAmount)` covers the cart total.
- The admin dashboard now exposes `/dashboard/credit`, allowing staff to review balances, approve/revoke credit, and adjust limits inline.

## Future Enhancements

- Payment history tracking
- Automated payment reminders
- Financial reporting and analytics
- Integration with accounting systems
- Bulk payment processing
- Credit limit management

## Future Optimizations

### Backend Filtering Implementation

**Current Implementation:**

- Frontend filtering is used to separate customers from suppliers
- Services filter results after fetching from GraphQL API
- Works correctly but not optimal for large datasets

**Optimization Opportunity:**

- **Issue**: Vendure's `CustomerFilterParameter` doesn't support custom field filtering despite documentation suggesting it should
- **Current Workaround**: Frontend filtering using `customer.customFields?.isSupplier`
- **Investigation Needed**:
  - Why Vendure custom field filtering isn't working (`filter: { customFields: { isSupplier: { eq: true } } }`)
  - Check if custom field filtering requires additional configuration
  - Verify if this is a version-specific limitation

**Recommended Solutions:**

1. **Customer Groups Approach** (Vendure Recommended):
   - Create "Suppliers" customer group in Vendure backend
   - Assign suppliers to this group during creation
   - Filter by customer group instead of custom fields
   - Use `filter: { customerGroupId: { eq: "suppliers-group-id" } }`

2. **Custom Backend Resolver**:
   - Implement custom GraphQL resolver for customer/supplier separation
   - Add dedicated endpoints like `getCustomersOnly()` and `getSuppliersOnly()`
   - Handle filtering at database level for better performance

**Benefits of Backend Filtering:**

- Better performance for large datasets
- Reduced network traffic
- Proper pagination support
- Database-level optimization
- Follows separation of concerns principle

**Implementation Priority:** Medium
**Effort Required:** Low-Medium (depending on chosen approach)
**Impact:** Performance optimization for large customer bases

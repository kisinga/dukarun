# Registration Fields Documentation

This document describes all fields captured during the registration process for backend authorization implementation.

## Field Order

Fields are collected in the following order on the frontend registration form:

### Step 1: Company & Admin Information

1. **Company Name** (string, required)
   - User input: Company/business name
   - Example: "Downtown Groceries"
   - Validation: Non-empty string, trimmed

2. **Company Code** (string, required)
   - Auto-generated from company name (editable)
   - Format: Lowercase, no spaces, hyphens allowed
   - Example: "downtown-groceries"
   - Validation: Must match regex `/^[a-z0-9-]+$/`

3. **Currency** (enum, required, default: KES)
   - Dropdown selection
   - Options: KES, USD, EUR, GBP
   - Default: KES

4. **Admin First Name** (string, required)
   - User's first name
   - Example: "John"
   - Validation: Non-empty string, trimmed

5. **Admin Last Name** (string, required)
   - User's last name
   - Example: "Doe"
   - Validation: Non-empty string, trimmed

6. **Admin Phone Number** (string, required)
   - Primary identifier for authentication
   - Format: Must be valid Kenyan phone number
   - Accepted formats:
     - `07XXXXXXXXX` (10 digits starting with 0)
     - `7XXXXXXXXX` (9 digits starting with 7)

   - Validation: Strict phone number validation enforced
   - This becomes the User `identifier` field in Vendure

7. **Admin Email** (string, optional)
   - User's email address
   - Example: "john@example.com"
   - Validation: Valid email format if provided, but not required

### Step 2: Store Location

8. **Store Name** (string, required)
   - Name of the physical store location
   - Example: "Main Store"
   - Validation: Non-empty string, trimmed

9. **Store Address** (string, optional)
   - Physical address of the store
   - Textarea input
   - Example: "123 Main Street, Nairobi, Kenya"
   - Validation: Optional, trimmed if provided

## Data Structure

The complete registration data is sent as a `RegistrationInput` object:

```typescript
interface RegistrationInput {
  // Company fields
  companyName: string;
  companyCode: string;
  currency: string;

  // Admin fields
  adminFirstName: string;
  adminLastName: string;
  adminPhoneNumber: string; // This becomes the User identifier
  adminEmail?: string;

  // Store fields
  storeName: string;
  storeAddress?: string;
}
```

## Backend Implementation Notes

1. **Phone Number as Identifier**: The `adminPhoneNumber` field should be used as the User entity's `identifier` field (not email). Vendure already supports custom identifiers.

2. **User Creation**: Create a User with:
   - `identifier`: `adminPhoneNumber` (formatted as 07XXXXXXXXX)
   - `customFields.authorizationStatus`: `PENDING`
   - No password required (passwordless authentication)

3. **Customer Creation**: Create a Customer with:
   - `firstName`: `adminFirstName`
   - `lastName`: `adminLastName`
   - `phoneNumber`: `adminPhoneNumber`
   - `emailAddress`: `adminEmail` (if provided)

4. **Channel Creation**: Create a Channel with:
   - `name`: `companyName`
   - `code`: `companyCode`
   - `defaultCurrencyCode`: `currency`

5. **Stock Location Creation**: Create a Stock Location with:
   - `name`: `storeName`
   - `description`: `storeAddress` (if provided)
   - Assigned to the created channel

## Additional Custom Fields

The following custom fields should be added to the User entity for authorization tracking:

- `authorizationStatus` (enum: `PENDING`, `APPROVED`, `REJECTED`)
  - Default value: `PENDING`
  - Required for tracking registration approval state

## Registration Flow

1. User completes registration form
2. User receives OTP via SMS
3. User verifies OTP
4. Backend creates:
   - User with phone as identifier, status `PENDING`
   - Customer
   - Channel
   - Stock Location
   - Admin user (linked to created User)
5. User account is in `PENDING` state until admin approval
6. Admin approves/rejects via admin interface
7. Only `APPROVED` users can login

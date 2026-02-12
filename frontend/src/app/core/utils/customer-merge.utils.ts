/**
 * Customer/Supplier Field Merging Utilities
 *
 * Provides intelligent field merging when adding capabilities to existing entities.
 * Preserves existing data while merging new capability-specific fields.
 */

/**
 * Strip GraphQL metadata fields from an object (__typename, etc.)
 * These fields are only for query responses, not mutation inputs
 *
 * @param obj - Object that may contain GraphQL metadata
 * @returns Cleaned object without GraphQL metadata
 */
function stripGraphQLMetadata(obj: any): any {
  if (!obj || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(stripGraphQLMetadata);

  const cleaned: any = {};
  for (const [key, value] of Object.entries(obj)) {
    // Skip __typename and other GraphQL metadata
    if (key === '__typename') continue;
    cleaned[key] = stripGraphQLMetadata(value);
  }
  return cleaned;
}

/**
 * Merge supplier capability into existing customer
 *
 * @param existing - Existing customer entity
 * @param supplierData - New supplier data to merge
 * @returns UpdateCustomerInput with merged fields
 */
export function mergeSupplierCapability(
  existing: any,
  supplierData: {
    firstName?: string;
    lastName?: string;
    emailAddress?: string;
    phoneNumber?: string;
    supplierType?: string;
    contactPerson?: string;
    taxId?: string;
    notes?: string;
    isCreditApproved?: boolean;
    creditLimit?: number;
    creditDuration?: number;
  },
): any {
  const existingCustomFields = existing.customFields || {};
  const isAlreadySupplier = existingCustomFields.isSupplier === true;

  // Merge customer fields (update if provided, preserve existing otherwise)
  const mergedCustomerFields = {
    firstName: supplierData.firstName || existing.firstName,
    lastName: supplierData.lastName || existing.lastName,
    emailAddress: supplierData.emailAddress?.trim() || existing.emailAddress,
    phoneNumber: supplierData.phoneNumber || existing.phoneNumber,
  };

  // Merge supplier custom fields
  // Strategy: Update provided fields, preserve existing if not provided
  const mergedSupplierFields: any = {
    // Always set isSupplier to true when adding supplier capability
    isSupplier: true,
    // Update supplier-specific fields if provided, otherwise preserve existing (payment terms removed in favor of credit duration)
    supplierType: supplierData.supplierType?.trim() || existingCustomFields.supplierType || null,
    contactPerson: supplierData.contactPerson?.trim() || existingCustomFields.contactPerson || null,
    taxId: supplierData.taxId?.trim() || existingCustomFields.taxId || null,
    notes: supplierData.notes?.trim() || existingCustomFields.notes || null,
  };

  // Merge credit fields: use new values if provided, otherwise preserve existing
  const mergedCreditFields: any = {};
  if (supplierData.isCreditApproved !== undefined) {
    mergedCreditFields.isCreditApproved = supplierData.isCreditApproved;
  } else if (existingCustomFields.isCreditApproved !== undefined) {
    mergedCreditFields.isCreditApproved = existingCustomFields.isCreditApproved;
  }
  if (supplierData.creditLimit !== undefined && supplierData.creditLimit > 0) {
    mergedCreditFields.creditLimit = supplierData.creditLimit;
  } else if (existingCustomFields.creditLimit !== undefined) {
    mergedCreditFields.creditLimit = existingCustomFields.creditLimit;
  }
  if (supplierData.creditDuration !== undefined && supplierData.creditDuration > 0) {
    mergedCreditFields.creditDuration = supplierData.creditDuration;
  } else if (existingCustomFields.creditDuration !== undefined) {
    mergedCreditFields.creditDuration = existingCustomFields.creditDuration;
  }
  // Always preserve repayment tracking fields (these are system-managed)
  if (existingCustomFields.lastRepaymentDate !== undefined) {
    mergedCreditFields.lastRepaymentDate = existingCustomFields.lastRepaymentDate;
  }
  if (existingCustomFields.lastRepaymentAmount !== undefined) {
    mergedCreditFields.lastRepaymentAmount = existingCustomFields.lastRepaymentAmount;
  }

  // Strip GraphQL metadata from customFields before returning
  const cleanedCustomFields = stripGraphQLMetadata({
    ...mergedSupplierFields,
    ...mergedCreditFields,
  });

  return {
    id: existing.id,
    ...mergedCustomerFields,
    customFields: cleanedCustomFields,
  };
}

/**
 * Merge customer fields into existing entity (preserving supplier capability if exists)
 *
 * @param existing - Existing customer/supplier entity
 * @param customerData - New customer data to merge
 * @returns UpdateCustomerInput with merged fields
 */
export function mergeCustomerFields(
  existing: any,
  customerData: {
    firstName?: string;
    lastName?: string;
    emailAddress?: string;
    phoneNumber?: string;
  },
): any {
  const existingCustomFields = existing.customFields || {};
  const isSupplier = existingCustomFields.isSupplier === true;

  // Merge customer fields (update if provided, preserve existing otherwise)
  const mergedCustomerFields = {
    firstName: customerData.firstName || existing.firstName,
    lastName: customerData.lastName || existing.lastName,
    emailAddress: customerData.emailAddress?.trim() || existing.emailAddress,
    phoneNumber: customerData.phoneNumber || existing.phoneNumber,
  };

  // Preserve all custom fields (supplier fields, credit fields, etc.)
  // Strip GraphQL metadata (__typename) before returning
  const preservedCustomFields = stripGraphQLMetadata({ ...existingCustomFields });

  return {
    id: existing.id,
    ...mergedCustomerFields,
    customFields: preservedCustomFields,
  };
}

/**
 * Customer/Supplier Field Merging Utilities
 *
 * Provides intelligent field merging when adding capabilities to existing entities.
 * Preserves existing data while merging new capability-specific fields.
 */

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
    paymentTerms?: string;
    notes?: string;
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
    // Update supplier-specific fields if provided, otherwise preserve existing
    supplierType: supplierData.supplierType?.trim() || existingCustomFields.supplierType || null,
    contactPerson: supplierData.contactPerson?.trim() || existingCustomFields.contactPerson || null,
    taxId: supplierData.taxId?.trim() || existingCustomFields.taxId || null,
    paymentTerms: supplierData.paymentTerms?.trim() || existingCustomFields.paymentTerms || null,
    notes: supplierData.notes?.trim() || existingCustomFields.notes || null,
  };

  // Preserve credit fields (these should never be overwritten when adding supplier capability)
  const preservedCreditFields: any = {};
  if (existingCustomFields.isCreditApproved !== undefined) {
    preservedCreditFields.isCreditApproved = existingCustomFields.isCreditApproved;
  }
  if (existingCustomFields.creditLimit !== undefined) {
    preservedCreditFields.creditLimit = existingCustomFields.creditLimit;
  }
  if (existingCustomFields.creditDuration !== undefined) {
    preservedCreditFields.creditDuration = existingCustomFields.creditDuration;
  }
  if (existingCustomFields.lastRepaymentDate !== undefined) {
    preservedCreditFields.lastRepaymentDate = existingCustomFields.lastRepaymentDate;
  }
  if (existingCustomFields.lastRepaymentAmount !== undefined) {
    preservedCreditFields.lastRepaymentAmount = existingCustomFields.lastRepaymentAmount;
  }

  return {
    id: existing.id,
    ...mergedCustomerFields,
    customFields: {
      ...mergedSupplierFields,
      ...preservedCreditFields,
    },
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
  const preservedCustomFields = { ...existingCustomFields };

  return {
    id: existing.id,
    ...mergedCustomerFields,
    customFields: preservedCustomFields,
  };
}

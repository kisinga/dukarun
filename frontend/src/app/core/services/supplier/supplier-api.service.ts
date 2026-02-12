import { inject, Injectable } from '@angular/core';
import {
  CREATE_SUPPLIER,
  DELETE_SUPPLIER,
  GET_SUPPLIER,
  UPDATE_SUPPLIER,
  GET_CUSTOMERS,
  UPDATE_CUSTOMER,
  GET_CUSTOMER,
} from '../../graphql/operations.graphql';
import { formatPhoneNumber } from '../../utils/phone.utils';
import { mergeSupplierCapability } from '../../utils/customer-merge.utils';
import { ApolloService } from '../apollo.service';
import { SupplierInput } from '../supplier.service';
import { SupplierStateService } from './supplier-state.service';

/**
 * Supplier API Service
 *
 * Handles all GraphQL operations for supplier CRUD.
 * Pure API layer with no business logic.
 */
@Injectable({
  providedIn: 'root',
})
export class SupplierApiService {
  private readonly apolloService = inject(ApolloService);
  private readonly stateService = inject(SupplierStateService);

  /**
   * Create a new supplier
   * @param input - Supplier information
   * @returns Created supplier ID or null if failed
   */
  async createSupplier(input: SupplierInput): Promise<string | null> {
    this.stateService.setIsCreating(true);
    this.stateService.setError(null);

    try {
      const client = this.apolloService.getClient();

      // Normalize phone number to 07XXXXXXXX format
      const normalizedPhone = input.phoneNumber ? formatPhoneNumber(input.phoneNumber) : undefined;

      // Check for existing customer by phone number to prevent duplicates
      // Note: We check for any customer (supplier or not) since a customer can become a supplier
      if (normalizedPhone) {
        const existingResult = await client.query<any>({
          query: GET_CUSTOMERS,
          variables: {
            options: {
              take: 1,
              skip: 0,
              filter: {
                phoneNumber: { eq: normalizedPhone },
              },
            },
          },
          fetchPolicy: 'network-only',
        });

        const existingCustomers = existingResult.data?.customers?.items || [];
        if (existingCustomers.length > 0) {
          const existing = existingCustomers[0];
          console.log('✅ Found existing customer by phone:', existing.id);

          // Fetch full customer data including all custom fields
          const fullCustomerResult = await client.query<any>({
            query: GET_CUSTOMER,
            variables: { id: existing.id },
            fetchPolicy: 'network-only',
          });

          const fullCustomer = fullCustomerResult.data?.customer;
          if (!fullCustomer) {
            this.stateService.setError('Failed to fetch existing customer details');
            return null;
          }

          const isAlreadySupplier = fullCustomer.customFields?.isSupplier === true;

          if (isAlreadySupplier) {
            console.log(
              '📦 Existing entity already has supplier capability, updating supplier fields',
            );
          } else {
            console.log('➕ Adding supplier capability to existing customer');
          }

          // Generate email from phone if missing
          let emailAddress = input.emailAddress?.trim();
          if (!emailAddress && normalizedPhone) {
            // Backend will generate sentinel email
            console.log('📧 No email provided, backend will generate sentinel email');
          }

          // Merge supplier capability with existing customer data
          const updateInput = mergeSupplierCapability(fullCustomer, {
            firstName: input.firstName,
            lastName: input.lastName,
            emailAddress: emailAddress || fullCustomer.emailAddress,
            phoneNumber: normalizedPhone,
            supplierType: input.supplierType,
            contactPerson: input.contactPerson,
            taxId: input.taxId,
            notes: input.notes,
            isCreditApproved: input.isCreditApproved,
            creditLimit: input.creditLimit,
            creditDuration: input.creditDuration,
          });

          // Use UPDATE_CUSTOMER to add supplier capability
          const updateResult = await client.mutate<any>({
            mutation: UPDATE_CUSTOMER,
            variables: { input: updateInput },
          });

          const updated = updateResult.data?.updateCustomer;
          if (updated?.id) {
            console.log(
              `✅ ${isAlreadySupplier ? 'Supplier fields updated' : 'Supplier capability added'}:`,
              updated.id,
            );
            this.stateService.setIsCreating(false);
            return updated.id;
          } else if (updated?.errorCode) {
            this.stateService.setError(updated.message || 'Failed to add supplier capability');
            return null;
          } else {
            this.stateService.setError('Failed to add supplier capability');
            return null;
          }
        }
      }

      // Generate email from phone if missing or empty
      let emailAddress = input.emailAddress?.trim();
      if (!emailAddress && normalizedPhone) {
        // Backend will generate sentinel email
        console.log('📧 No email provided, backend will generate sentinel email');
      }

      // Ensure email structure for API (can be empty string if backend handles it?
      // Actually Vendure createCustomer might require it if not intercepted or if schema demands it.
      // But we are using createCustomerSafe which modifies it.
      // The API input expects emailAddress! (Non-nullable) usually.
      // Let's check CreateCustomerInput.
      // If it is mandatory in schema, we might need to send "" or null?
      // In TS interface usually string.
      // If I send "", backend intercepts it.

      const emailToSend = emailAddress || '';

      // Build customFields with supplier and credit fields (payment terms removed in favor of credit duration)
      const customFields: any = {
        isSupplier: true,
        supplierType: input.supplierType,
        contactPerson: input.contactPerson,
        taxId: input.taxId,
        notes: input.notes,
      };

      // Add supplier credit fields if provided
      if (input.isCreditApproved !== undefined) {
        customFields.isSupplierCreditApproved = input.isCreditApproved;
      }
      if (input.creditLimit !== undefined && input.creditLimit > 0) {
        customFields.supplierCreditLimit = input.creditLimit;
      }
      if (input.creditDuration !== undefined && input.creditDuration > 0) {
        customFields.supplierCreditDuration = input.creditDuration;
      }

      // Prepare input with only basic customer fields at top level, supplier fields in customFields
      const supplierInput = {
        firstName: input.firstName,
        lastName: input.lastName,
        emailAddress: emailToSend,
        phoneNumber: normalizedPhone,
        customFields,
      };

      const result = await client.mutate<any>({
        mutation: CREATE_SUPPLIER,
        variables: { input: supplierInput },
      });

      const supplier = result.data?.createCustomerSafe;
      if (supplier?.id) {
        console.log('✅ Supplier created:', supplier.id);
        return supplier.id;
      } else if (supplier?.errorCode) {
        this.stateService.setError(supplier.message || 'Failed to create supplier');
        return null;
      } else {
        this.stateService.setError('Failed to create supplier');
        return null;
      }
    } catch (error: any) {
      console.error('❌ Supplier creation failed:', error);
      this.stateService.setError(error.message || 'Failed to create supplier');
      return null;
    } finally {
      this.stateService.setIsCreating(false);
    }
  }

  /**
   * Check if a customer/supplier exists by phone number
   * @param phoneNumber - Phone number to check (will be normalized)
   * @returns Object with exists flag and customer info if found
   */
  async checkPhoneExists(phoneNumber: string): Promise<{
    exists: boolean;
    isSupplier: boolean;
    customerId?: string;
    customerName?: string;
  }> {
    if (!phoneNumber || !phoneNumber.trim()) {
      return { exists: false, isSupplier: false };
    }

    try {
      const client = this.apolloService.getClient();
      const normalizedPhone = formatPhoneNumber(phoneNumber);

      if (!normalizedPhone) {
        return { exists: false, isSupplier: false };
      }

      const result = await client.query<any>({
        query: GET_CUSTOMERS,
        variables: {
          options: {
            take: 1,
            skip: 0,
            filter: {
              phoneNumber: { eq: normalizedPhone },
            },
          },
        },
        fetchPolicy: 'network-only',
      });

      const items = result.data?.customers?.items ?? [];
      if (items.length === 0) {
        return { exists: false, isSupplier: false };
      }

      const customer = items[0];
      const isSupplier = customer.customFields?.isSupplier === true;

      return {
        exists: true,
        isSupplier,
        customerId: customer.id,
        customerName: `${customer.firstName} ${customer.lastName}`.trim(),
      };
    } catch (error) {
      console.error('Phone check failed:', error);
      // On error, assume it doesn't exist to avoid blocking valid operations
      return { exists: false, isSupplier: false };
    }
  }

  /**
   * Get supplier details by ID
   */
  async getSupplierById(id: string): Promise<any | null> {
    try {
      const client = this.apolloService.getClient();
      const result = await client.query<any>({
        query: GET_SUPPLIER,
        variables: { id },
        fetchPolicy: 'network-only',
      });
      return result.data?.customer || null;
    } catch (error) {
      console.error('Failed to fetch supplier:', error);
      return null;
    }
  }

  /**
   * Update an existing supplier
   * @param id - Supplier ID
   * @param input - Updated supplier information
   * @returns true if successful, false otherwise
   */
  async updateSupplier(id: string, input: Partial<SupplierInput>): Promise<boolean> {
    try {
      const client = this.apolloService.getClient();

      // UpdateCustomerInput allows only id, firstName, lastName, emailAddress, phoneNumber, title, customFields
      const supplierInput = {
        id,
        firstName: input.firstName,
        lastName: input.lastName,
        emailAddress: input.emailAddress,
        phoneNumber: input.phoneNumber ? formatPhoneNumber(input.phoneNumber) : input.phoneNumber,
        customFields: {
          isSupplier: true,
          supplierType: input.supplierType,
          contactPerson: input.contactPerson,
          taxId: input.taxId,
          notes: input.notes,
          isCreditApproved: input.isCreditApproved,
          creditLimit: input.creditLimit,
          creditDuration: input.creditDuration,
        },
      };

      const result = await client.mutate<any>({
        mutation: UPDATE_SUPPLIER,
        variables: { input: supplierInput },
      });

      const supplier = result.data?.updateCustomer;
      if (supplier?.id) {
        console.log('✅ Supplier updated:', supplier.id);
        return true;
      } else if (supplier?.errorCode) {
        this.stateService.setError(supplier.message || 'Failed to update supplier');
        return false;
      } else {
        this.stateService.setError('Failed to update supplier');
        return false;
      }
    } catch (error: any) {
      console.error('❌ Supplier update failed:', error);
      this.stateService.setError(error.message || 'Failed to update supplier');
      return false;
    }
  }

  /**
   * Delete a supplier by ID
   * @param supplierId - The ID of the supplier to delete
   * @returns true if successful, false otherwise
   */
  async deleteSupplier(supplierId: string): Promise<boolean> {
    try {
      console.log('🗑️ Deleting supplier:', supplierId);
      const client = this.apolloService.getClient();

      const result = await client.mutate<any>({
        mutation: DELETE_SUPPLIER,
        variables: { id: supplierId },
      });

      const deleteResult = result.data?.deleteCustomer;

      if (deleteResult?.result === 'DELETED') {
        console.log('✅ Supplier deleted successfully');
        return true;
      } else {
        console.error('❌ Delete failed:', deleteResult?.message);
        this.stateService.setError(deleteResult?.message || 'Failed to delete supplier');
        return false;
      }
    } catch (error: any) {
      console.error('❌ Delete supplier error:', error);
      this.stateService.setError(error.message || 'Failed to delete supplier');
      return false;
    }
  }
}

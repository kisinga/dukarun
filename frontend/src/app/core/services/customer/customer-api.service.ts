import { inject, Injectable } from '@angular/core';
import {
  CREATE_CUSTOMER,
  DELETE_CUSTOMER,
  GET_CUSTOMER,
  UPDATE_CUSTOMER,
  GET_CUSTOMERS,
} from '../../graphql/operations.graphql';
import { formatPhoneNumber } from '../../utils/phone.utils';
import { mergeCustomerFields } from '../../utils/customer-merge.utils';
import { ApolloService } from '../apollo.service';
import { CustomerInput } from '../customer.service';
import { CustomerStateService } from './customer-state.service';

/**
 * Customer API Service
 *
 * Handles all GraphQL operations for customer CRUD.
 * Pure API layer with no business logic.
 */
@Injectable({
  providedIn: 'root',
})
export class CustomerApiService {
  private readonly apolloService = inject(ApolloService);
  private readonly stateService = inject(CustomerStateService);

  /**
   * Create a new customer
   * @param input - Customer information
   * @returns Created customer ID or null if failed
   */
  async createCustomer(input: CustomerInput): Promise<string | null> {
    this.stateService.setIsCreating(true);
    this.stateService.setError(null);

    try {
      const client = this.apolloService.getClient();

      // Normalize phone number to 07XXXXXXXX format
      const normalizedPhone = input.phoneNumber ? formatPhoneNumber(input.phoneNumber) : undefined;

      // Check for existing customer by phone number to prevent duplicates
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

          const isSupplier = fullCustomer.customFields?.isSupplier === true;

          if (isSupplier) {
            console.log(
              '📦 Existing entity has supplier capability, preserving supplier fields while updating customer fields',
            );
          } else {
            console.log('📝 Updating existing customer fields');
          }

          // Generate email from phone if missing
          let emailAddress = input.emailAddress?.trim();
          if (!emailAddress && normalizedPhone) {
            // Backend handles sentinel email generation
            console.log('📧 No email provided, backend will generate sentinel email');
          }

          // Merge customer fields while preserving supplier capability and fields
          const updateInput = mergeCustomerFields(fullCustomer, {
            firstName: input.firstName,
            lastName: input.lastName,
            emailAddress: emailAddress || fullCustomer.emailAddress,
            phoneNumber: normalizedPhone,
          });

          // Use UPDATE_CUSTOMER to update customer fields (preserving supplier fields)
          const updateResult = await client.mutate<any>({
            mutation: UPDATE_CUSTOMER,
            variables: { input: updateInput },
          });

          const updated = updateResult.data?.updateCustomer;
          if (updated?.id) {
            console.log('✅ Customer fields updated:', updated.id);
            this.stateService.setIsCreating(false);
            return updated.id;
          } else if (updated?.errorCode) {
            this.stateService.setError(updated.message || 'Failed to update customer');
            return null;
          } else {
            this.stateService.setError('Failed to update customer');
            return null;
          }
        }
      }

      // Generate email from phone if missing or empty
      let emailAddress = input.emailAddress?.trim();
      if (!emailAddress && normalizedPhone) {
        // Backend handles sentinel email generation
        console.log('📧 No email provided, backend will generate sentinel email');
      }

      // Ensure email structure for API (can be empty string if backend handles it)
      // We send explicit empty string so that the backend interceptor can see it's missing
      // and generate the sentinel email if needed.
      const emailToSend = emailAddress || '';

      // Build customFields if credit fields are provided
      const customFields: any = {};
      if (input.isCreditApproved !== undefined) {
        customFields.isCreditApproved = input.isCreditApproved;
      }
      if (input.creditLimit !== undefined && input.creditLimit > 0) {
        customFields.creditLimit = input.creditLimit;
      }
      if (input.creditDuration !== undefined && input.creditDuration > 0) {
        customFields.creditDuration = input.creditDuration;
      }

      const normalizedInput: any = {
        firstName: input.firstName,
        lastName: input.lastName,
        phoneNumber: normalizedPhone,
        emailAddress: emailToSend,
      };

      // Only include customFields if there are any credit fields
      if (Object.keys(customFields).length > 0) {
        normalizedInput.customFields = customFields;
      }

      const result = await client.mutate<any>({
        mutation: CREATE_CUSTOMER,
        variables: { input: normalizedInput },
      });

      const customer = result.data?.createCustomer;
      if (customer?.id) {
        console.log('✅ Customer created:', customer.id);
        return customer.id;
      } else if (customer?.errorCode) {
        this.stateService.setError(customer.message || 'Failed to create customer');
        return null;
      } else {
        this.stateService.setError('Failed to create customer');
        return null;
      }
    } catch (error: any) {
      console.error('❌ Customer creation failed:', error);
      this.stateService.setError(error.message || 'Failed to create customer');
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
   * Get customer details by ID
   */
  async getCustomerById(id: string): Promise<any | null> {
    try {
      const client = this.apolloService.getClient();
      const result = await client.query<any>({
        query: GET_CUSTOMER,
        variables: { id },
        fetchPolicy: 'network-only',
      });
      return result.data?.customer || null;
    } catch (error) {
      console.error('Failed to fetch customer:', error);
      return null;
    }
  }

  /**
   * Update an existing customer
   * @param id - Customer ID
   * @param input - Updated customer information
   * @returns true if successful, false otherwise
   */
  async updateCustomer(id: string, input: Partial<CustomerInput>): Promise<boolean> {
    try {
      const client = this.apolloService.getClient();

      // UpdateCustomerInput allows only id, firstName, lastName, emailAddress, phoneNumber, title, customFields
      const mutationInput = {
        id,
        firstName: input.firstName,
        lastName: input.lastName,
        emailAddress: input.emailAddress,
        phoneNumber: input.phoneNumber ? formatPhoneNumber(input.phoneNumber) : input.phoneNumber,
        customFields:
          input.isCreditApproved !== undefined ||
          input.creditLimit !== undefined ||
          input.creditDuration !== undefined
            ? {
                ...(input.isCreditApproved !== undefined && {
                  isCreditApproved: input.isCreditApproved,
                }),
                ...(input.creditLimit !== undefined && { creditLimit: input.creditLimit }),
                ...(input.creditDuration !== undefined && { creditDuration: input.creditDuration }),
              }
            : undefined,
      };

      const result = await client.mutate<any>({
        mutation: UPDATE_CUSTOMER,
        variables: { input: mutationInput },
      });

      const customer = result.data?.updateCustomer;
      if (customer?.id) {
        console.log('✅ Customer updated:', customer.id);
        return true;
      } else if (customer?.errorCode) {
        this.stateService.setError(customer.message || 'Failed to update customer');
        return false;
      } else {
        this.stateService.setError('Failed to update customer');
        return false;
      }
    } catch (error: any) {
      console.error('❌ Customer update failed:', error);
      this.stateService.setError(error.message || 'Failed to update customer');
      return false;
    }
  }

  /**
   * Delete a customer by ID
   * @param customerId - The ID of the customer to delete
   * @returns true if successful, false otherwise
   */
  async deleteCustomer(customerId: string): Promise<boolean> {
    try {
      console.log('🗑️ Deleting customer:', customerId);
      const client = this.apolloService.getClient();

      const result = await client.mutate<any>({
        mutation: DELETE_CUSTOMER,
        variables: { id: customerId },
      });

      const deleteResult = result.data?.deleteCustomer;

      if (deleteResult?.result === 'DELETED') {
        console.log('✅ Customer deleted successfully');
        return true;
      } else {
        console.error('❌ Delete failed:', deleteResult?.message);
        this.stateService.setError(deleteResult?.message || 'Failed to delete customer');
        return false;
      }
    } catch (error: any) {
      console.error('❌ Delete customer error:', error);
      this.stateService.setError(error.message || 'Failed to delete customer');
      return false;
    }
  }
}

import { inject, Injectable } from '@angular/core';
import { CREATE_CUSTOMER_ADDRESS, DELETE_CUSTOMER_ADDRESS, UPDATE_CUSTOMER_ADDRESS } from '../operations.graphql';
import { ApolloService } from '../../../shared/services/apollo.service';
import { CustomerAddressInput } from './customer.service';

/**
 * Customer Address Service
 *
 * Handles all address-related operations for customers.
 * Pure API layer for address management.
 */
@Injectable({
  providedIn: 'root',
})
export class CustomerAddressService {
  private readonly apolloService = inject(ApolloService);

  /**
   * Create a new address for a customer
   * @param customerId - Customer ID
   * @param input - Address information
   * @returns Created address ID or null if failed
   */
  async createAddress(customerId: string, input: CustomerAddressInput): Promise<string | null> {
    try {
      const client = this.apolloService.getClient();

      const result = await client.mutate({
        mutation: CREATE_CUSTOMER_ADDRESS,
        variables: { customerId, input },
      });

      const address = result.data?.createCustomerAddress;
      if (address?.id) {
        console.log('✅ Customer address created:', address.id);
        return address.id;
      } else {
        console.error('❌ Failed to create customer address');
        return null;
      }
    } catch (error: any) {
      console.error('❌ Customer address creation failed:', error);
      return null;
    }
  }

  /**
   * Update an existing customer address
   * @param addressId - Address ID
   * @param input - Updated address information
   * @returns true if successful, false otherwise
   */
  async updateAddress(addressId: string, input: Partial<CustomerAddressInput>): Promise<boolean> {
    try {
      const client = this.apolloService.getClient();

      const result = await client.mutate({
        mutation: UPDATE_CUSTOMER_ADDRESS,
        variables: { input: { id: addressId, ...input } },
      });

      const address = result.data?.updateCustomerAddress;
      if (address?.id) {
        console.log('✅ Customer address updated:', address.id);
        return true;
      } else {
        console.error('❌ Failed to update customer address');
        return false;
      }
    } catch (error: any) {
      console.error('❌ Customer address update failed:', error);
      return false;
    }
  }

  /**
   * Delete a customer address
   * @param addressId - Address ID to delete
   * @returns true if successful, false otherwise
   */
  async deleteAddress(addressId: string): Promise<boolean> {
    try {
      const client = this.apolloService.getClient();

      const result = await client.mutate({
        mutation: DELETE_CUSTOMER_ADDRESS,
        variables: { id: addressId },
      });

      const deleteResult = result.data?.deleteCustomerAddress;

      if (deleteResult?.success) {
        console.log('✅ Customer address deleted successfully');
        return true;
      } else {
        console.error('❌ Failed to delete customer address');
        return false;
      }
    } catch (error: any) {
      console.error('❌ Delete customer address error:', error);
      return false;
    }
  }
}

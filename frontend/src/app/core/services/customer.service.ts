import { inject, Injectable } from '@angular/core';
import { CustomerAddressService } from './customer/customer-address.service';
import { CustomerApiService } from './customer/customer-api.service';
import { CustomerCreditService } from './customer/customer-credit.service';
import { CustomerPaymentService } from './customer/customer-payment.service';
import { CustomerSearchService } from './customer/customer-search.service';
import { CustomerStateService } from './customer/customer-state.service';

/**
 * Customer creation input
 */
export interface CustomerInput {
  firstName: string;
  lastName: string;
  emailAddress: string;
  phoneNumber?: string;
  password?: string;
  // Credit fields (optional, requires permissions)
  isCreditApproved?: boolean;
  creditLimit?: number;
  creditDuration?: number;
}

/**
 * Customer address input
 */
export interface CustomerAddressInput {
  fullName: string;
  streetLine1: string;
  streetLine2?: string;
  city: string;
  postalCode: string;
  countryCode: string;
  phoneNumber?: string;
}

/**
 * Credit customer summary interface
 *
 * ARCHITECTURE: Ledger as Single Source of Truth
 * - outstandingAmount: Computed from Accounts Receivable (AR) ledger account
 * - availableCredit: Calculated by backend from ledger (creditLimit - outstandingAmount)
 * - All financial data comes from the ledger via backend FinancialService
 * - No local calculations should be performed - backend is authoritative
 */
export interface CreditCustomerSummary {
  id: string;
  name: string;
  phone?: string;
  email?: string;
  isCreditApproved: boolean;
  creditLimit: number;
  outstandingAmount: number; // From ledger (AR account balance)
  availableCredit: number; // Calculated by backend from ledger
  lastRepaymentDate?: string | null;
  lastRepaymentAmount: number;
  creditDuration: number;
}

export interface CustomerRecord {
  id: string;
  firstName: string;
  lastName: string;
  emailAddress?: string | null;
  phoneNumber?: string | null;
  /**
   * Outstanding amount computed from ledger (Accounts Receivable account)
   * This is a snapshot - for real-time data, use getCreditSummary() which queries ledger directly
   */
  outstandingAmount?: number | null; // Computed from ledger by backend
  customFields?: {
    isSupplier?: boolean | null;
    supplierType?: string | null;
    contactPerson?: string | null;
    taxId?: string | null;
    paymentTerms?: string | null;
    notes?: string | null;
    isCreditApproved?: boolean | null;
    creditLimit?: number | null;
    lastRepaymentDate?: string | null;
    lastRepaymentAmount?: number | null;
    creditDuration?: number | null;
  } | null;
}

/**
 * Service for customer management operations
 *
 * ARCHITECTURE:
 * - Uses Vendure's Customer entity for customer management
 * - Supports address management for each customer
 * - All operations are channel-aware via ApolloService
 * - Composed of specialized sub-services for better maintainability
 */
@Injectable({
  providedIn: 'root',
})
export class CustomerService {
  // Inject all sub-services
  private readonly apiService = inject(CustomerApiService);
  private readonly addressService = inject(CustomerAddressService);
  private readonly creditService = inject(CustomerCreditService);
  private readonly paymentService = inject(CustomerPaymentService);
  private readonly searchService = inject(CustomerSearchService);
  private readonly stateService = inject(CustomerStateService);

  // Expose state signals from state service
  readonly isCreating = this.stateService.isCreating;
  readonly error = this.stateService.error;
  readonly isLoading = this.stateService.isLoading;
  readonly customers = this.stateService.customers;
  readonly totalItems = this.stateService.totalItems;

  /**
   * Create a new customer
   * @param input - Customer information
   * @returns Created customer ID or null if failed
   */
  async createCustomer(input: CustomerInput): Promise<string | null> {
    return this.apiService.createCustomer(input);
  }

  /**
   * Get customer details by ID
   */
  async getCustomerById(id: string): Promise<any | null> {
    return this.apiService.getCustomerById(id);
  }

  /**
   * Update an existing customer
   * @param id - Customer ID
   * @param input - Updated customer information
   * @returns true if successful, false otherwise
   */
  async updateCustomer(id: string, input: Partial<CustomerInput>): Promise<boolean> {
    return this.apiService.updateCustomer(id, input);
  }

  /**
   * Delete a customer by ID
   * @param customerId - The ID of the customer to delete
   * @returns true if successful, false otherwise
   */
  async deleteCustomer(customerId: string): Promise<boolean> {
    return this.apiService.deleteCustomer(customerId);
  }

  /**
   * Create a new address for a customer
   * @param customerId - Customer ID
   * @param input - Address information
   * @returns Created address ID or null if failed
   */
  async createCustomerAddress(
    customerId: string,
    input: CustomerAddressInput,
  ): Promise<string | null> {
    return this.addressService.createAddress(customerId, input);
  }

  /**
   * Update an existing customer address
   * @param addressId - Address ID
   * @param input - Updated address information
   * @returns true if successful, false otherwise
   */
  async updateCustomerAddress(
    addressId: string,
    input: Partial<CustomerAddressInput>,
  ): Promise<boolean> {
    return this.addressService.updateAddress(addressId, input);
  }

  /**
   * Delete a customer address
   * @param addressId - Address ID to delete
   * @returns true if successful, false otherwise
   */
  async deleteCustomerAddress(addressId: string): Promise<boolean> {
    return this.addressService.deleteAddress(addressId);
  }

  /**
   * Fetch all customers with optional pagination
   * @param options - Optional pagination and filter options
   */
  async fetchCustomers(options?: any): Promise<void> {
    return this.searchService.fetchCustomers(options);
  }

  /**
   * Search for customers (including suppliers)
   */
  async searchCustomers(term: string, take = 50): Promise<any[]> {
    return this.searchService.searchCustomers(term, take);
  }

  /**
   * Search for customers eligible for credit sales.
   */
  async searchCreditCustomers(term: string, take = 50): Promise<CreditCustomerSummary[]> {
    return this.creditService.searchCreditCustomers(term, take);
  }

  /**
   * Retrieve up-to-date credit summary for a customer.
   */
  async getCreditSummary(
    customerId: string,
    base?: Partial<CreditCustomerSummary>,
  ): Promise<CreditCustomerSummary> {
    return this.creditService.getCreditSummary(customerId, base);
  }

  /**
   * Validate credit availability for a given order total.
   * Uses backend validation for single source of truth.
   */
  async validateCustomerCredit(
    customerId: string,
    orderTotal: number,
    base?: Partial<CreditCustomerSummary>,
  ): Promise<{ summary: CreditCustomerSummary; error?: string }> {
    return this.creditService.validateCustomerCredit(customerId, orderTotal, base);
  }

  /**
   * Quickly create a customer record for checkout flows.
   */
  async quickCreateCustomer(input: {
    name: string;
    phone: string;
    email?: string;
  }): Promise<string | null> {
    return this.searchService.quickCreateCustomer(input);
  }

  async listCreditCustomers(take = 200): Promise<CreditCustomerSummary[]> {
    return this.creditService.listCreditCustomers(take);
  }

  async approveCustomerCredit(
    customerId: string,
    approved: boolean,
    creditLimit?: number,
    base?: Partial<CreditCustomerSummary>,
    creditDuration?: number,
  ): Promise<CreditCustomerSummary> {
    return this.creditService.approveCustomerCredit(
      customerId,
      approved,
      creditLimit,
      base,
      creditDuration,
    );
  }

  async updateCustomerCreditLimit(
    customerId: string,
    creditLimit: number,
    base?: Partial<CreditCustomerSummary>,
    creditDuration?: number,
  ): Promise<CreditCustomerSummary> {
    return this.creditService.updateCustomerCreditLimit(
      customerId,
      creditLimit,
      base,
      creditDuration,
    );
  }

  async updateCreditDuration(
    customerId: string,
    creditDuration: number,
    base?: Partial<CreditCustomerSummary>,
  ): Promise<CreditCustomerSummary> {
    return this.creditService.updateCreditDuration(customerId, creditDuration, base);
  }

  /**
   * Clear error state
   */
  clearError(): void {
    this.stateService.clearError();
  }

  /**
   * Record a bulk payment for a credit-approved customer
   * @param customerId - Customer ID
   * @param paymentAmount - Payment amount
   * @param referenceNumber - Payment reference number (optional)
   * @param orderIds - Optional array of specific order IDs to pay, if not provided pays all outstanding orders
   * @returns Payment allocation result or null if failed
   */
  async recordBulkPayment(
    customerId: string,
    paymentAmount: number,
    referenceNumber?: string,
    orderIds?: string[],
  ): Promise<{
    ordersPaid: Array<{ orderId: string; orderCode: string; amountPaid: number }>;
    remainingBalance: number;
    totalAllocated: number;
  } | null> {
    return this.paymentService.recordBulkPayment(
      customerId,
      paymentAmount,
      referenceNumber,
      orderIds,
    );
  }
}

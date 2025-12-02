import { inject, Injectable } from '@angular/core';
import { SupplierApiService } from './supplier/supplier-api.service';
import { SupplierSearchService } from './supplier/supplier-search.service';
import { SupplierStateService } from './supplier/supplier-state.service';

/**
 * Supplier creation input
 */
export interface SupplierInput {
  firstName: string;
  lastName: string;
  emailAddress: string;
  phoneNumber?: string;
  password?: string;
  // Supplier-specific custom fields
  supplierType?: string;
  contactPerson?: string;
  taxId?: string;
  paymentTerms?: string;
  notes?: string;
  // Credit fields (optional, requires permissions)
  isCreditApproved?: boolean;
  creditLimit?: number;
  creditDuration?: number;
}

/**
 * Service for supplier management operations
 *
 * ARCHITECTURE:
 * - Uses Vendure's Customer entity with custom fields for supplier management
 * - Suppliers are customers with isSupplier custom field set to true
 * - All operations are channel-aware via ApolloService
 * - Composed of specialized sub-services for better maintainability
 */
@Injectable({
  providedIn: 'root',
})
export class SupplierService {
  // Inject all sub-services
  private readonly apiService = inject(SupplierApiService);
  private readonly searchService = inject(SupplierSearchService);
  private readonly stateService = inject(SupplierStateService);

  // Expose state signals from state service
  readonly isCreating = this.stateService.isCreating;
  readonly error = this.stateService.error;
  readonly isLoading = this.stateService.isLoading;
  readonly suppliers = this.stateService.suppliers;
  readonly totalItems = this.stateService.totalItems;

  /**
   * Create a new supplier
   * @param input - Supplier information
   * @returns Created supplier ID or null if failed
   */
  async createSupplier(input: SupplierInput): Promise<string | null> {
    return this.apiService.createSupplier(input);
  }

  /**
   * Get supplier details by ID
   */
  async getSupplierById(id: string): Promise<any | null> {
    return this.apiService.getSupplierById(id);
  }

  /**
   * Update an existing supplier
   * @param id - Supplier ID
   * @param input - Updated supplier information
   * @returns true if successful, false otherwise
   */
  async updateSupplier(id: string, input: Partial<SupplierInput>): Promise<boolean> {
    return this.apiService.updateSupplier(id, input);
  }

  /**
   * Delete a supplier by ID
   * @param supplierId - The ID of the supplier to delete
   * @returns true if successful, false otherwise
   */
  async deleteSupplier(supplierId: string): Promise<boolean> {
    return this.apiService.deleteSupplier(supplierId);
  }

  /**
   * Fetch all suppliers with optional pagination
   * @param options - Optional pagination and filter options
   */
  async fetchSuppliers(options?: any): Promise<void> {
    return this.searchService.fetchSuppliers(options);
  }

  /**
   * Clear error state
   */
  clearError(): void {
    this.stateService.clearError();
  }
}

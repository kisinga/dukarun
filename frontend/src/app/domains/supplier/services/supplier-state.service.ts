import { Injectable, signal } from '@angular/core';

/**
 * Supplier State Service
 *
 * Manages shared state signals for supplier operations.
 * Provides centralized state management for supplier-related operations.
 */
@Injectable({
  providedIn: 'root',
})
export class SupplierStateService {
  // State for operation in progress
  private readonly isCreatingSignal = signal(false);
  private readonly errorSignal = signal<string | null>(null);
  private readonly isLoadingSignal = signal(false);
  private readonly suppliersSignal = signal<any[]>([]);
  private readonly totalItemsSignal = signal(0);

  readonly isCreating = this.isCreatingSignal.asReadonly();
  readonly error = this.errorSignal.asReadonly();
  readonly isLoading = this.isLoadingSignal.asReadonly();
  readonly suppliers = this.suppliersSignal.asReadonly();
  readonly totalItems = this.totalItemsSignal.asReadonly();

  setIsCreating(value: boolean): void {
    this.isCreatingSignal.set(value);
  }

  setError(error: string | null): void {
    this.errorSignal.set(error);
  }

  setIsLoading(value: boolean): void {
    this.isLoadingSignal.set(value);
  }

  setSuppliers(suppliers: any[]): void {
    this.suppliersSignal.set(suppliers);
  }

  setTotalItems(total: number): void {
    this.totalItemsSignal.set(total);
  }

  clearError(): void {
    this.errorSignal.set(null);
  }
}

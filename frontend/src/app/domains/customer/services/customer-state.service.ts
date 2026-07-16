import { Injectable, signal } from '@angular/core';

/**
 * Customer State Service
 *
 * Manages shared state signals for customer operations.
 * Provides centralized state management for customer-related operations.
 */
@Injectable({
  providedIn: 'root',
})
export class CustomerStateService {
  // State for operation in progress
  private readonly isCreatingSignal = signal(false);
  private readonly errorSignal = signal<string | null>(null);
  private readonly isLoadingSignal = signal(false);
  private readonly customersSignal = signal<any[]>([]);
  private readonly totalItemsSignal = signal(0);

  readonly isCreating = this.isCreatingSignal.asReadonly();
  readonly error = this.errorSignal.asReadonly();
  readonly isLoading = this.isLoadingSignal.asReadonly();
  readonly customers = this.customersSignal.asReadonly();
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

  setCustomers(customers: any[]): void {
    this.customersSignal.set(customers);
  }

  setTotalItems(total: number): void {
    this.totalItemsSignal.set(total);
  }

  clearError(): void {
    this.errorSignal.set(null);
  }
}

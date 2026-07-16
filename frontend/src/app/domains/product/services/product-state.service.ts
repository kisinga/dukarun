import { Injectable, signal } from '@angular/core';

/**
 * Product State Service
 *
 * Manages shared state signals for product operations.
 * Provides centralized state management for product-related operations.
 */
@Injectable({
  providedIn: 'root',
})
export class ProductStateService {
  // State for operation in progress
  private readonly isCreatingSignal = signal(false);
  private readonly errorSignal = signal<string | null>(null);
  private readonly isLoadingSignal = signal(false);
  private readonly productsSignal = signal<any[]>([]);
  private readonly totalItemsSignal = signal(0);

  readonly isCreating = this.isCreatingSignal.asReadonly();
  readonly error = this.errorSignal.asReadonly();
  readonly isLoading = this.isLoadingSignal.asReadonly();
  readonly products = this.productsSignal.asReadonly();
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

  setProducts(products: any[]): void {
    this.productsSignal.set(products);
  }

  setTotalItems(total: number): void {
    this.totalItemsSignal.set(total);
  }

  clearError(): void {
    this.errorSignal.set(null);
  }
}

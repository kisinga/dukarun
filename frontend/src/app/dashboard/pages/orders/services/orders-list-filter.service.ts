import { inject, Injectable, signal } from '@angular/core';

export interface OrdersListFilterState {
  searchQuery: string;
  stateFilter: string;
  stateFilterColor: string;
  customerIdFilter: string | null;
  dateFrom: string | null;
  dateTo: string | null;
}

/**
 * Single source of truth for orders list filter state.
 * Used by the Sales (orders) page, advanced filters modal, and chart click.
 * OrdersService stays dumb; the orders page builds OrderListOptions from this and calls fetchOrders(options).
 */
@Injectable({
  providedIn: 'root',
})
export class OrdersListFilterService {
  readonly searchQuery = signal('');
  readonly stateFilter = signal('');
  readonly stateFilterColor = signal<string>('primary');
  readonly customerIdFilter = signal<string | null>(null);
  readonly dateFrom = signal<string | null>(null);
  readonly dateTo = signal<string | null>(null);

  setFilters(partial: Partial<OrdersListFilterState>): void {
    if (partial.searchQuery !== undefined) this.searchQuery.set(partial.searchQuery);
    if (partial.stateFilter !== undefined) this.stateFilter.set(partial.stateFilter);
    if (partial.stateFilterColor !== undefined) this.stateFilterColor.set(partial.stateFilterColor);
    if (partial.customerIdFilter !== undefined) this.customerIdFilter.set(partial.customerIdFilter);
    if (partial.dateFrom !== undefined) this.dateFrom.set(partial.dateFrom);
    if (partial.dateTo !== undefined) this.dateTo.set(partial.dateTo);
  }

  clearFilters(): void {
    this.searchQuery.set('');
    this.stateFilter.set('');
    this.stateFilterColor.set('primary');
    this.customerIdFilter.set(null);
    this.dateFrom.set(null);
    this.dateTo.set(null);
  }

  setDateRange(from: string | null, to: string | null): void {
    this.dateFrom.set(from);
    this.dateTo.set(to);
  }

  /**
   * Set filter to a single day (e.g. from chart click). Both dateFrom and dateTo become that day.
   */
  setSingleDate(isoDate: string): void {
    const normalized = isoDate.slice(0, 10);
    this.dateFrom.set(normalized);
    this.dateTo.set(normalized);
  }

  hasActiveFilters(): boolean {
    return (
      this.searchQuery().trim() !== '' ||
      this.stateFilter() !== '' ||
      this.customerIdFilter() != null ||
      this.dateFrom() != null ||
      this.dateTo() != null
    );
  }
}

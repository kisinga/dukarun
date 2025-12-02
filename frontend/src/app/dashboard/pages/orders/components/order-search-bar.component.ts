import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, input, model } from '@angular/core';

/**
 * Order Search Bar Component
 *
 * Search and filter orders
 */
@Component({
  selector: 'app-order-search-bar',
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex flex-col sm:flex-row gap-2 sm:gap-3">
      <div class="flex-1">
        <input
          type="text"
          placeholder="Search by order code, customer name, or email..."
          class="input input-bordered w-full input-sm sm:input-md"
          [value]="searchQuery()"
          (input)="onSearchChange($event)"
        />
      </div>
      <div class="flex gap-2">
        <select
          class="select select-bordered select-sm sm:select-md flex-1 sm:flex-none sm:w-auto"
          [value]="stateFilter()"
          (change)="onStateFilterChange($event)"
        >
          <option value="">All States</option>
          <option value="Draft">Draft</option>
          <option value="ArrangingPayment">Unpaid</option>
          <option value="PaymentSettled">Paid (Unshipped)</option>
          <option value="Fulfilled">Paid (Shipped)</option>
        </select>
      </div>
    </div>
  `,
})
export class OrderSearchBarComponent {
  readonly searchQuery = model<string>('');
  readonly stateFilter = model<string>('');

  onSearchChange(event: Event): void {
    const target = event.target as HTMLInputElement;
    this.searchQuery.set(target.value);
  }

  onStateFilterChange(event: Event): void {
    const target = event.target as HTMLSelectElement;
    this.stateFilter.set(target.value);
  }
}

import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, input, model, output } from '@angular/core';

/**
 * Payment Search Bar Component
 *
 * Search and filter payments
 */
@Component({
  selector: 'app-payment-search-bar',
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex flex-col gap-2 sm:gap-3">
      <!-- Active Filter Badges -->
      @if (activeStateFilter()) {
        <div class="flex flex-wrap gap-2">
          <span [class]="'badge badge-' + filterColor() + ' gap-2'">
            {{ getFilterLabel() }}
            <button
              class="btn btn-ghost btn-xs btn-circle p-0 h-4 w-4 min-h-0"
              (click)="onClearFilter()"
              type="button"
              aria-label="Clear filter"
            >
              ×
            </button>
          </span>
        </div>
      }

      <div class="flex flex-col sm:flex-row gap-2 sm:gap-3">
        <div class="flex-1">
          <input
            type="text"
            placeholder="Search payments..."
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
            <option value="Created">Created</option>
            <option value="Authorized">Authorized</option>
            <option value="Settled">Settled</option>
            <option value="Declined">Declined</option>
            <option value="Cancelled">Cancelled</option>
          </select>
        </div>
      </div>
    </div>
  `,
})
export class PaymentSearchBarComponent {
  readonly searchQuery = model<string>('');
  readonly stateFilter = model<string>('');
  readonly activeStateFilter = input<string>('');
  readonly filterColor = input<string>('primary');
  readonly clearStateFilter = output<void>();

  onSearchChange(event: Event): void {
    const target = event.target as HTMLInputElement;
    this.searchQuery.set(target.value);
  }

  onStateFilterChange(event: Event): void {
    const target = event.target as HTMLSelectElement;
    this.stateFilter.set(target.value);
  }

  onClearFilter(): void {
    this.stateFilter.set('');
    this.clearStateFilter.emit();
  }

  getFilterLabel(): string {
    const filter = this.activeStateFilter();
    if (filter === 'Settled') return 'Successful';
    if (filter === 'Created') return 'Pending';
    if (filter === 'Declined') return 'Failed';
    return '';
  }
}

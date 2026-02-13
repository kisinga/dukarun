import { ChangeDetectionStrategy, Component, input, model } from '@angular/core';

/**
 * Standardized search bar for all list pages.
 *
 * Provides a consistent search input with icon and clear button.
 * Page-specific filters (selects, toggles, facet selectors) are
 * projected via the [filters] slot. Active filter badges are
 * projected via the [badges] slot.
 *
 * Usage:
 * ```html
 * <app-list-search-bar [(searchQuery)]="searchQuery" placeholder="Search orders...">
 *   <div badges>
 *     <span class="badge badge-warning gap-1.5">Active filter</span>
 *   </div>
 *   <div filters>
 *     <select class="select select-bordered select-sm">...</select>
 *   </div>
 * </app-list-search-bar>
 * ```
 */
@Component({
  selector: 'app-list-search-bar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      class="rounded-xl bg-base-100 shadow-sm border border-base-200 p-3 sm:p-4 flex flex-col gap-3"
    >
      <!-- Active filter badges -->
      <ng-content select="[badges]" />

      <!-- Search input -->
      <div class="relative max-w-lg">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          class="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-base-content/40 pointer-events-none"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
          />
        </svg>
        <input
          type="text"
          [placeholder]="placeholder()"
          class="input input-bordered input-sm sm:input-md w-full pl-9 pr-8"
          [value]="searchQuery()"
          (input)="onSearchInput($event)"
        />
        @if (searchQuery()) {
          <button
            type="button"
            class="absolute right-2 top-1/2 -translate-y-1/2 btn btn-ghost btn-xs btn-circle"
            (click)="searchQuery.set('')"
            aria-label="Clear search"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              class="h-3.5 w-3.5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        }
      </div>

      <!-- Page-specific filters -->
      <ng-content select="[filters]" />
    </div>
  `,
})
export class ListSearchBarComponent {
  readonly searchQuery = model<string>('');
  readonly placeholder = input<string>('Search...');

  onSearchInput(event: Event): void {
    const target = event.target as HTMLInputElement;
    this.searchQuery.set(target.value);
  }
}

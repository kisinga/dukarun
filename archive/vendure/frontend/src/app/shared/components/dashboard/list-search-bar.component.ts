import { ChangeDetectionStrategy, Component, input, model } from '@angular/core';
import { NgIcon } from '@ng-icons/core';

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
  imports: [NgIcon],
  template: `
    <div
      class="rounded-xl bg-base-100 shadow-sm border border-base-200 p-3 sm:p-4 flex flex-col gap-3"
    >
      <!-- Active filter badges -->
      <ng-content select="[badges]" />

      <!-- Search input -->
      <div class="relative max-w-lg">
        <ng-icon
          name="heroMagnifyingGlass"
          size="1rem"
          class="absolute left-3 top-1/2 -translate-y-1/2 text-base-content/40 pointer-events-none"
        />
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
            <ng-icon name="heroXMark" size="0.875rem" />
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

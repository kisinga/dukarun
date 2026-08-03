import { Component, input, model } from '@angular/core';
import { NgIcon } from '@ng-icons/core';

/**
 * Standardized search bar for all list pages (ported from the old app).
 * Page-specific filters project via [filters], active-filter badges via [badges].
 */
@Component({
  selector: 'app-list-search-bar',
  imports: [NgIcon],
  template: `
    <section class="card flex flex-col gap-3 bg-base-100 p-3 sm:p-4">
      <ng-content select="[summary]" />
      <ng-content select="[badges]" />

      <div class="flex flex-col gap-3 lg:flex-row lg:items-end">
        <div class="relative min-w-0 flex-1 lg:max-w-md">
          <ng-icon
            name="heroMagnifyingGlass"
            size="1rem"
            class="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-base-content/40"
          />
          <input
            type="search"
            [placeholder]="placeholder()"
            class="input input-bordered min-h-11 w-full pr-9 pl-9"
            [value]="searchQuery()"
            (input)="onSearchInput($event)"
          />
          @if (searchQuery()) {
            <button
              type="button"
              class="btn absolute top-1/2 right-2 btn-circle btn-ghost btn-xs -translate-y-1/2"
              (click)="searchQuery.set('')"
              aria-label="Clear search"
            >
              <ng-icon name="heroXMark" size="0.875rem" />
            </button>
          }
        </div>

        <div class="min-w-0 lg:ml-auto">
          <ng-content select="[filters]" />
        </div>
      </div>
    </section>
  `,
})
export class ListSearchBarComponent {
  readonly searchQuery = model<string>('');
  readonly placeholder = input<string>('Search...');

  protected onSearchInput(event: Event): void {
    this.searchQuery.set((event.target as HTMLInputElement).value);
  }
}

import { Component, input, model } from '@angular/core';
import { NgIcon } from '@ng-icons/core';

/**
 * Standardized search bar for all list pages (ported from the old app).
 * Page-specific filters project via [filters], active-filter badges via [badges].
 */
@Component({
  selector: 'app-list-search-bar',
  imports: [NgIcon],
  host: { class: 'mb-4 block' },
  template: `
    <section class="card flex flex-col gap-3 bg-base-100 p-4">
      <div class="flex flex-col gap-3 lg:flex-row lg:items-center">
        <div class="relative min-w-0 lg:w-80 lg:flex-none xl:w-96">
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

        <div class="min-w-0 flex-1">
          <ng-content select="[summary]" />
        </div>
      </div>

      <div class="-mx-4 border-t border-base-300/60 px-4 pt-3 empty:hidden">
        <ng-content select="[filters]" />
      </div>
      <ng-content select="[badges]" />
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

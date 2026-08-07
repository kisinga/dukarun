import { Component, input, model } from '@angular/core';
import { NgIcon } from '@ng-icons/core';

export interface ListSortOption {
  value: string;
  label: string;
}

export type ListSortDirection = 'asc' | 'desc';

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
      <div class="flex flex-col gap-3 lg:flex-row lg:items-center lg:gap-4">
        <div class="relative min-w-0 lg:w-72 lg:flex-none xl:w-80">
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

        @if (sortOptions().length > 0) {
          <div
            class="inline-flex w-fit max-w-full self-start overflow-hidden rounded-field border border-base-300 bg-base-100 shadow-xs transition focus-within:border-primary/40 focus-within:ring-2 focus-within:ring-primary/10 lg:ml-auto lg:flex-none lg:self-auto"
          >
            <div class="relative min-w-0">
              <select
                class="sort-select select min-h-11 w-52 max-w-[calc(100vw-6.5rem)] min-w-0 cursor-pointer rounded-none border-0 bg-transparent pr-10 select-sm"
                aria-label="Sort by"
                [value]="sortKey()"
                (change)="onSortKeyChange($event)"
              >
                @for (option of sortOptions(); track option.value) {
                  <option [value]="option.value">{{ option.label }}</option>
                }
              </select>
              <ng-icon
                name="heroChevronDown"
                size="0.875rem"
                class="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-base-content/55"
              />
            </div>
            <button
              type="button"
              class="btn min-h-11 w-11 shrink-0 rounded-none border-0 border-l border-base-300/70 btn-ghost btn-sm hover:bg-base-200"
              [attr.aria-label]="directionTitle()"
              (click)="toggleSortDirection()"
            >
              <ng-icon
                [name]="sortDirection() === 'asc' ? 'heroBarsArrowUp' : 'heroBarsArrowDown'"
                size="1.25rem"
                aria-hidden="true"
              />
            </button>
          </div>
        }
      </div>

      <div class="-mx-4 border-t border-base-300/60 px-4 pt-3 empty:hidden">
        <ng-content select="[filters]" />
      </div>
      <ng-content select="[badges]" />
    </section>
  `,
  styles: `
    .sort-select {
      appearance: none;
      background-image: none;
      box-shadow: none;
      outline: none;
    }
  `,
})
export class ListSearchBarComponent {
  readonly searchQuery = model<string>('');
  readonly placeholder = input<string>('Search...');
  readonly sortOptions = input<readonly ListSortOption[]>([]);
  readonly sortKey = model<string>('');
  readonly sortDirection = model<ListSortDirection>('asc');

  protected onSearchInput(event: Event): void {
    this.searchQuery.set((event.target as HTMLInputElement).value);
  }

  protected onSortKeyChange(event: Event): void {
    this.sortKey.set((event.target as HTMLSelectElement).value);
  }

  protected toggleSortDirection(): void {
    this.sortDirection.set(this.sortDirection() === 'asc' ? 'desc' : 'asc');
  }

  protected directionTitle(): string {
    return this.sortDirection() === 'asc'
      ? 'Ascending — change to descending'
      : 'Descending — change to ascending';
  }
}

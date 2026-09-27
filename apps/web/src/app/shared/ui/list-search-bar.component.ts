import {
  Component,
  HostListener,
  OnDestroy,
  effect,
  input,
  model,
  output,
  signal,
} from '@angular/core';
import { NgIcon } from '@ng-icons/core';

export interface ListSortOption {
  value: string;
  label: string;
}

export type ListSortDirection = 'asc' | 'desc';

/** Compact list toolbar with phone sort and filter disclosure. */
@Component({
  selector: 'app-list-search-bar',
  imports: [NgIcon],
  host: { class: 'mb-4 block' },
  template: `
    <section class="card flex min-w-0 flex-col gap-3 bg-base-100 p-3 md:p-4">
      <div
        class="list-toolbar-grid grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 md:grid-cols-[minmax(0,1fr)_auto] xl:grid-cols-[minmax(14rem,18rem)_minmax(0,1fr)_auto] xl:gap-4"
      >
        <div
          class="list-toolbar-search relative col-span-2 min-w-0 md:col-span-1 md:w-72 xl:w-full"
        >
          <ng-icon
            name="heroMagnifyingGlass"
            size="1rem"
            class="pointer-events-none absolute top-1/2 left-3 z-1 -translate-y-1/2 text-muted"
          />
          <input
            type="search"
            [placeholder]="placeholder()"
            [attr.aria-label]="searchLabel()"
            class="search-with-custom-clear input input-bordered min-h-11 w-full pr-11 pl-9"
            [value]="searchQuery()"
            (input)="onSearchInput($event)"
          />
          @if (searchQuery()) {
            <button
              type="button"
              class="btn absolute top-1/2 right-0.5 btn-circle btn-ghost btn-xs -translate-y-1/2"
              (click)="searchQuery.set('')"
              aria-label="Clear search"
            >
              <ng-icon name="heroXMark" size="0.875rem" />
            </button>
          }
        </div>

        <div
          class="list-toolbar-summary min-w-0 md:col-span-2 md:row-start-2 xl:col-span-1 xl:col-start-2 xl:row-start-1"
        >
          <ng-content select="[summary]" />
        </div>

        <div class="flex shrink-0 items-center justify-end gap-1 md:hidden">
          @if (sortOptions().length > 0) {
            <div class="relative">
              <button
                type="button"
                class="btn min-h-11 gap-1.5 btn-ghost btn-sm"
                aria-label="Sort list"
                [attr.aria-expanded]="sortOpen()"
                (click)="$event.stopPropagation(); sortOpen.set(!sortOpen())"
              >
                <ng-icon
                  [name]="sortDirection() === 'asc' ? 'heroBarsArrowUp' : 'heroBarsArrowDown'"
                  size="1.25rem"
                />
                <span class="hidden min-[360px]:inline">Sort</span>
              </button>
              @if (sortOpen()) {
                <div
                  class="absolute top-[calc(100%+0.375rem)] right-0 z-50 w-56 rounded-box border border-base-300 bg-base-100 p-1.5 shadow-overlay"
                >
                  @for (option of sortOptions(); track option.value) {
                    <button
                      type="button"
                      class="flex min-h-11 w-full items-center gap-2 rounded-field px-3 text-left text-sm hover:bg-base-200"
                      [class.bg-base-200]="sortKey() === option.value"
                      (click)="chooseSort(option.value)"
                    >
                      <ng-icon
                        name="heroCheck"
                        size="0.875rem"
                        [class.invisible]="sortKey() !== option.value"
                      />
                      <span class="min-w-0 flex-1 truncate">{{ option.label }}</span>
                    </button>
                  }
                  <button
                    type="button"
                    class="mt-1 flex min-h-11 w-full items-center gap-2 border-t border-base-300 px-3 pt-1 text-left text-sm"
                    (click)="toggleSortDirection(); sortOpen.set(false)"
                  >
                    <ng-icon
                      [name]="sortDirection() === 'asc' ? 'heroBarsArrowUp' : 'heroBarsArrowDown'"
                      size="1.25rem"
                    />
                    {{ sortDirection() === 'asc' ? 'Ascending' : 'Descending' }}
                  </button>
                </div>
              }
            </div>
          }
          @if (filtersEnabled()) {
            <button
              type="button"
              class="btn min-h-11 gap-1.5 btn-ghost btn-sm"
              aria-label="Filter list"
              [attr.aria-expanded]="filtersOpen()"
              (click)="filtersOpen.set(true)"
            >
              <span class="indicator">
                <ng-icon name="heroFunnel" size="1.25rem" />
                @if (activeFilterCount() > 0) {
                  <span class="badge indicator-item badge-primary badge-xs">{{
                    activeFilterCount()
                  }}</span>
                }
              </span>
              <span class="hidden min-[360px]:inline">Filters</span>
            </button>
          }
        </div>

        @if (sortOptions().length > 0) {
          <div
            class="list-toolbar-sort list-sort-control hidden w-56 min-w-0 items-stretch overflow-hidden rounded-field md:col-start-2 md:row-start-1 md:flex xl:col-start-3"
          >
            <select
              class="sort-select select min-h-11 min-w-0 flex-1 cursor-pointer rounded-none select-sm"
              aria-label="Sort by"
              [value]="sortKey()"
              (change)="onSortKeyChange($event)"
            >
              @for (option of sortOptions(); track option.value) {
                <option [value]="option.value">{{ option.label }}</option>
              }
            </select>
            <button
              type="button"
              class="sort-direction btn min-h-11 w-11 shrink-0 rounded-none btn-ghost btn-sm"
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

      @if (filtersEnabled()) {
        @if (filtersOpen()) {
          <button
            type="button"
            class="overlay-backdrop fixed inset-0 z-[65] md:hidden"
            aria-label="Close filters"
            (click)="filtersOpen.set(false)"
          ></button>
        }
        <div class="list-filter-panel" [class.list-filter-panel-open]="filtersOpen()">
          <div
            class="flex items-center justify-between border-b border-base-300/70 px-4 py-3 md:hidden"
          >
            <h2 class="section-title">{{ filterSheetTitle() }}</h2>
            <button
              type="button"
              class="btn btn-square btn-ghost btn-sm"
              aria-label="Close filters"
              (click)="filtersOpen.set(false)"
            >
              <ng-icon name="heroXMark" size="1rem" />
            </button>
          </div>
          <div class="list-filter-body">
            <ng-content select="[filters]" />
          </div>
          <div
            class="flex items-center gap-2 border-t border-base-300/70 bg-base-100 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] md:hidden"
          >
            @if (activeFilterCount() > 0) {
              <button type="button" class="btn min-h-11 btn-ghost" (click)="clearFilters.emit()">
                Clear all
              </button>
            }
            <button
              type="button"
              class="btn ml-auto min-h-11 btn-primary"
              (click)="filtersOpen.set(false)"
            >
              View results
            </button>
          </div>
        </div>
      }

      @if (activeFilterCount() > 0) {
        <div class="flex flex-wrap md:hidden" aria-label="Active filters">
          <button
            type="button"
            class="inline-flex min-h-11 items-center gap-1.5 rounded-selector bg-base-200 px-3 text-xs font-semibold"
            aria-label="Clear all active filters"
            (click)="clearFilters.emit()"
          >
            {{ activeFilterCount() }}
            {{ activeFilterCount() === 1 ? 'filter' : 'filters' }} active
            <ng-icon name="heroXMark" size="0.875rem" />
          </button>
        </div>
      }

      <ng-content select="[badges]" />
    </section>
  `,
  styles: `
    .list-toolbar-summary:empty {
      display: none;
    }

    .list-sort-control {
      height: 2.75rem;
      border: 1px solid var(--control-border);
      background: var(--surface-inset);
    }

    .list-sort-control:focus-within {
      border-color: var(--color-primary);
      outline: 2px solid var(--color-primary);
      outline-offset: 2px;
    }

    .list-sort-control .sort-select {
      height: 100%;
      min-height: 0;
      border: 0;
      box-shadow: none;
      outline: none;
      background-color: transparent;
    }

    .sort-direction {
      height: 100%;
      min-height: 0;
      border: 0;
      border-left: 1px solid var(--control-border);
      background: transparent;
      box-shadow: none;
    }

    .sort-direction:hover {
      background: var(--surface-action);
    }

    .list-filter-panel {
      position: fixed;
      right: 0;
      bottom: 0;
      left: 0;
      z-index: 70;
      display: flex;
      max-height: 88dvh;
      flex-direction: column;
      border: 1px solid var(--color-base-300);
      border-bottom: 0;
      border-radius: var(--radius-box) var(--radius-box) 0 0;
      background: var(--color-base-100);
      box-shadow: var(--shadow-overlay);
      transform: translateY(100%);
      transition: transform 180ms ease-out;
    }

    .list-filter-panel-open {
      transform: none;
    }

    .list-filter-body {
      min-height: 0;
      overflow-y: auto;
      padding: 1rem;
    }

    @media (min-width: 768px) {
      .list-filter-panel {
        position: static;
        z-index: auto;
        display: block;
        max-height: none;
        border: 0;
        border-top: 1px solid var(--surface-border);
        border-radius: 0;
        box-shadow: none;
        transform: none;
        transition: none;
      }

      .list-filter-body {
        overflow: visible;
        padding: 0.75rem 0 0;
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .list-filter-panel {
        transition: none;
      }
    }
  `,
})
export class ListSearchBarComponent implements OnDestroy {
  readonly searchQuery = model<string>('');
  readonly placeholder = input<string>('Search...');
  readonly searchLabel = input('Search list');
  readonly sortOptions = input<readonly ListSortOption[]>([]);
  readonly sortKey = model<string>('');
  readonly sortDirection = model<ListSortDirection>('asc');
  readonly filtersEnabled = input(false);
  readonly activeFilterCount = input(0);
  readonly filterSheetTitle = input('Filters');
  readonly filtersOpen = model(false);
  readonly clearFilters = output<void>();

  protected readonly sortOpen = signal(false);
  private savedBodyOverflow: string | null = null;

  constructor() {
    effect(() => {
      if (this.filtersOpen() && this.isMobileViewport()) this.lockBody();
      else this.unlockBody();
    });
  }

  protected onSearchInput(event: Event): void {
    this.searchQuery.set((event.target as HTMLInputElement).value);
  }

  protected onSortKeyChange(event: Event): void {
    this.sortKey.set((event.target as HTMLSelectElement).value);
  }

  protected chooseSort(value: string): void {
    this.sortKey.set(value);
    this.sortOpen.set(false);
  }

  protected toggleSortDirection(): void {
    this.sortDirection.set(this.sortDirection() === 'asc' ? 'desc' : 'asc');
  }

  protected directionTitle(): string {
    return this.sortDirection() === 'asc'
      ? 'Ascending — change to descending'
      : 'Descending — change to ascending';
  }

  @HostListener('document:click')
  protected closeSort(): void {
    this.sortOpen.set(false);
  }

  @HostListener('document:keydown.escape')
  protected closeOverlays(): void {
    this.sortOpen.set(false);
    this.filtersOpen.set(false);
  }

  @HostListener('window:resize')
  protected syncBodyLock(): void {
    if (this.filtersOpen() && this.isMobileViewport()) this.lockBody();
    else this.unlockBody();
  }

  ngOnDestroy(): void {
    this.unlockBody();
  }

  private lockBody(): void {
    if (typeof document === 'undefined' || this.savedBodyOverflow !== null) return;
    this.savedBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
  }

  private unlockBody(): void {
    if (typeof document === 'undefined' || this.savedBodyOverflow === null) return;
    document.body.style.overflow = this.savedBodyOverflow;
    this.savedBodyOverflow = null;
  }

  private isMobileViewport(): boolean {
    return typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches;
  }
}

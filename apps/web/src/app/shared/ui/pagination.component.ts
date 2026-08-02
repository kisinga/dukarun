import { Component, computed, input, output } from '@angular/core';
import { NgIcon } from '@ng-icons/core';

/**
 * Pagination controls with page numbers (ported from the old app,
 * template inlined). Client-side paging: feed it page state and
 * re-slice your rows on (pageChange).
 */
@Component({
  selector: 'app-pagination',
  imports: [NgIcon],
  template: `
    <div class="border-t border-base-300/70 pt-3">
      <div class="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div class="flex flex-wrap items-center justify-center gap-x-3 gap-y-2 lg:justify-start">
          <span class="text-sm text-base-content/60">
            <span class="font-semibold text-base-content">{{ startItem() }}-{{ endItem() }}</span>
            of
            <span class="font-semibold text-base-content">{{ totalItems() }}</span>
            {{ itemLabel() }}
          </span>
        </div>

        <div class="flex items-center justify-center gap-2 lg:justify-end">
          <div class="join">
            <button
              class="join-item btn btn-square btn-sm"
              [disabled]="currentPage() === 1"
              (click)="onPageChange(1)"
              aria-label="First page"
              title="First page"
            >
              <ng-icon name="heroChevronDoubleLeft" size="1rem" />
            </button>
            <button
              class="join-item btn btn-square btn-sm"
              [disabled]="currentPage() === 1"
              (click)="onPageChange(currentPage() - 1)"
              aria-label="Previous page"
              title="Previous page"
            >
              <ng-icon name="heroChevronLeft" size="1rem" />
            </button>
          </div>

          <div class="join hidden sm:flex">
            @for (page of pageNumbers(); track page) {
              <button
                class="join-item btn min-w-9 btn-sm"
                [class.btn-active]="page === currentPage()"
                (click)="onPageChange(page)"
                [attr.aria-current]="page === currentPage() ? 'page' : null"
              >
                {{ page }}
              </button>
            }
          </div>

          <div class="join">
            <button
              class="join-item btn btn-square btn-sm"
              [disabled]="currentPage() === totalPages()"
              (click)="onPageChange(currentPage() + 1)"
              aria-label="Next page"
              title="Next page"
            >
              <ng-icon name="heroChevronRight" size="1rem" />
            </button>
            <button
              class="join-item btn btn-square btn-sm"
              [disabled]="currentPage() === totalPages()"
              (click)="onPageChange(totalPages())"
              aria-label="Last page"
              title="Last page"
            >
              <ng-icon name="heroChevronDoubleRight" size="1rem" />
            </button>
          </div>
        </div>
      </div>
    </div>
  `,
})
export class PaginationComponent {
  readonly currentPage = input.required<number>();
  readonly totalPages = input.required<number>();
  readonly totalItems = input.required<number>();
  readonly itemsPerPage = input.required<number>();
  readonly itemLabel = input<string>('items');

  readonly pageChange = output<number>();

  protected readonly startItem = computed(() => (this.currentPage() - 1) * this.itemsPerPage() + 1);
  protected readonly endItem = computed(() =>
    Math.min(this.currentPage() * this.itemsPerPage(), this.totalItems())
  );

  protected readonly pageNumbers = computed(() => {
    const total = this.totalPages();
    const current = this.currentPage();
    const pages: number[] = [];
    let start = Math.max(1, current - 2);
    const end = Math.min(total, start + 4);
    if (end - start < 4) start = Math.max(1, end - 4);
    for (let i = start; i <= end; i++) pages.push(i);
    return pages;
  });

  protected onPageChange(page: number): void {
    if (page >= 1 && page <= this.totalPages()) this.pageChange.emit(page);
  }
}

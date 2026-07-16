import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

/**
 * Pagination component
 * Responsive pagination controls with page numbers and navigation buttons
 * Supports optional items per page selector
 */
@Component({
    selector: 'app-pagination',
    imports: [CommonModule],
    templateUrl: './pagination.component.html',
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PaginationComponent {
    readonly currentPage = input.required<number>();
    readonly totalPages = input.required<number>();
    readonly totalItems = input.required<number>();
    readonly itemsPerPage = input.required<number>();
    readonly itemLabel = input<string>('items');
    /** Optional: Show items per page selector */
    readonly showItemsPerPage = input<boolean>(false);
    /** Optional: Available items per page options */
    readonly pageOptions = input<number[]>([10, 25, 50, 100]);

    readonly pageChange = output<number>();
    readonly itemsPerPageChange = output<number>();

    readonly startItem = computed(() => {
        return (this.currentPage() - 1) * this.itemsPerPage() + 1;
    });

    readonly endItem = computed(() => {
        return Math.min(this.currentPage() * this.itemsPerPage(), this.totalItems());
    });

    readonly pageNumbers = computed(() => {
        const total = this.totalPages();
        const current = this.currentPage();
        const pages: number[] = [];

        // Show max 5 page numbers
        let start = Math.max(1, current - 2);
        let end = Math.min(total, start + 4);

        // Adjust start if we're near the end
        if (end - start < 4) {
            start = Math.max(1, end - 4);
        }

        for (let i = start; i <= end; i++) {
            pages.push(i);
        }

        return pages;
    });

    onPageChange(page: number): void {
        if (page >= 1 && page <= this.totalPages()) {
            this.pageChange.emit(page);
        }
    }

    onItemsPerPageSelect(event: Event): void {
        const target = event.target as HTMLSelectElement;
        const value = Number.parseInt(target.value, 10);
        if (!Number.isNaN(value) && value > 0) {
            this.itemsPerPageChange.emit(value);
        }
    }
}


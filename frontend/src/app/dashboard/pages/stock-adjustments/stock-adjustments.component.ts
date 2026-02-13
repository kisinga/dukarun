import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { StockAdjustmentService } from '../../../core/services/stock-adjustment.service';
import { PageHeaderComponent } from '../../components/shared/page-header.component';
import { ListSearchBarComponent } from '../../components/shared/list-search-bar.component';
import { PaginationComponent } from '../../components/shared/pagination.component';
import { ADJUSTMENT_REASONS } from './components/stock-adjustment-form-fields.component';

@Component({
  selector: 'app-stock-adjustments',
  imports: [
    CommonModule,
    RouterLink,
    PageHeaderComponent,
    ListSearchBarComponent,
    PaginationComponent,
  ],
  templateUrl: './stock-adjustments.component.html',
  styleUrl: './stock-adjustments.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StockAdjustmentsComponent implements OnInit {
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  readonly stockAdjustmentService = inject(StockAdjustmentService);

  readonly adjustments = this.stockAdjustmentService.adjustments;
  readonly isLoadingList = this.stockAdjustmentService.isLoadingList;
  readonly errorList = this.stockAdjustmentService.errorList;
  readonly totalItems = this.stockAdjustmentService.totalItems;

  readonly searchQuery = signal('');
  readonly reasonFilter = signal('');
  readonly currentPage = signal(1);
  readonly itemsPerPage = signal(10);
  readonly pageOptions = [10, 25, 50, 100];

  /** Expansion state for list rows: adjustment id -> expanded */
  readonly expandedIds = signal<Record<string, boolean>>({});

  private readonly queryParams = toSignal(this.route.queryParams, {
    initialValue: {} as Record<string, string>,
  });

  readonly showRecordedSuccess = computed(() => this.queryParams()['recorded'] === '1');

  readonly reasonOptions = ADJUSTMENT_REASONS;

  readonly totalPages = computed(() => {
    const total = this.totalItems();
    const perPage = this.itemsPerPage();
    return Math.ceil(total / perPage) || 1;
  });

  readonly paginatedAdjustments = computed(() => {
    const list = this.adjustments();
    const query = this.searchQuery().toLowerCase().trim();
    if (!query) return list;
    return list.filter(
      (a) =>
        (a.reason && a.reason.toLowerCase().includes(query)) ||
        (a.notes && a.notes.toLowerCase().includes(query)),
    );
  });

  ngOnInit(): void {
    this.refreshAdjustments();
  }

  async refreshAdjustments(): Promise<void> {
    const page = this.currentPage();
    const perPage = this.itemsPerPage();
    const reason = this.reasonFilter();
    await this.stockAdjustmentService.fetchStockAdjustments({
      skip: (page - 1) * perPage,
      take: perPage,
      filter: reason ? { reason } : undefined,
    });
  }

  clearRecordedParam(): void {
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { recorded: null },
      queryParamsHandling: 'merge',
    });
  }

  onReasonFilterChange(value: string): void {
    this.reasonFilter.set(value);
    this.currentPage.set(1);
    this.refreshAdjustments();
  }

  clearReasonFilter(): void {
    this.reasonFilter.set('');
    this.currentPage.set(1);
    this.refreshAdjustments();
  }

  goToPage(page: number): void {
    this.currentPage.set(page);
    this.refreshAdjustments();
  }

  changeItemsPerPage(perPage: number): void {
    this.itemsPerPage.set(perPage);
    this.currentPage.set(1);
    this.refreshAdjustments();
  }

  clearListError(): void {
    this.stockAdjustmentService.clearListError();
  }

  getReasonLabel(value: string): string {
    return this.reasonOptions.find((r) => r.value === value)?.label ?? value;
  }

  formatDate(value: unknown): string {
    if (value == null) return '—';
    const d = new Date(value as string);
    return isNaN(d.getTime()) ? '—' : d.toLocaleDateString(undefined, { dateStyle: 'short' });
  }

  trackByAdjustmentId(_index: number, item: { id: string }): string {
    return item.id;
  }

  isExpanded(id: string): boolean {
    return !!this.expandedIds()[id];
  }

  toggleExpanded(id: string): void {
    this.expandedIds.update((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  expandAll(): void {
    const ids = this.paginatedAdjustments().reduce<Record<string, boolean>>((acc, adj) => {
      acc[adj.id] = true;
      return acc;
    }, {});
    this.expandedIds.set(ids);
  }

  collapseAll(): void {
    this.expandedIds.set({});
  }

  formatDifference(diff: number): string {
    if (diff > 0) return `+${diff}`;
    if (diff < 0) return String(diff);
    return '0';
  }

  /** Product name · Variant name (SKU) for list line items */
  getLineVariantDisplay(line: {
    variant?: { name?: string; sku?: string; product?: { name?: string } } | null;
    variantId?: string;
  }): string {
    const v = line.variant;
    if (!v) return line.variantId ?? '—';
    const productName = v.product?.name?.trim();
    const variantName = v.name?.trim();
    const sku = v.sku?.trim();
    const parts: string[] = [];
    if (productName) parts.push(productName);
    if (variantName && variantName !== productName) parts.push(variantName);
    const main = parts.length ? parts.join(' · ') : variantName || sku || line.variantId || '—';
    return sku ? `${main} (${sku})` : main;
  }
}

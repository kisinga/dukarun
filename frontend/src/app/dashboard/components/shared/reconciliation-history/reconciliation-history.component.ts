import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import {
  CashierSessionService,
  type Reconciliation,
  type ReconciliationAccountDetail,
} from '../../../../core/services/cashier-session/cashier-session.service';

/** Context for the shared reconciliation history table (list + pagination only). */
export interface ReconciliationHistoryContext {
  reconciliations: Reconciliation[];
  isLoading: boolean;
  totalItems: number;
  currentPage: number;
  pageSize: number;
  formatDate: (date: string) => string;
  formatCurrency: (amount: string) => string;
}

@Component({
  selector: 'app-reconciliation-history',
  imports: [CommonModule],
  templateUrl: './reconciliation-history.component.html',
  styleUrl: './reconciliation-history.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReconciliationHistoryComponent {
  private readonly cashierSessionService = inject(CashierSessionService);

  context = input.required<ReconciliationHistoryContext>();
  pageChange = output<number>();

  /** Expandable row: which reconciliation id is expanded (null = none). */
  readonly expandedRowId = signal<string | null>(null);
  /** Cached per-account details by reconciliation id (lazy-loaded on expand). */
  readonly detailsCache = signal<Record<string, ReconciliationAccountDetail[]>>({});
  /** Reconciliation id currently loading details (for spinner in expanded row). */
  readonly loadingDetailsId = signal<string | null>(null);

  readonly totalPages = computed(() => {
    const ctx = this.context();
    const total = ctx.totalItems;
    const size = ctx.pageSize;
    return Math.ceil(total / size) || 1;
  });

  readonly pageNumbers = computed(() => {
    const total = this.totalPages();
    return Array.from({ length: total }, (_, i) => i + 1);
  });

  hasVariance(r: Reconciliation): boolean {
    const v = parseInt(r.varianceAmount, 10);
    return !Number.isNaN(v) && v !== 0;
  }

  onPageChange(page: number): void {
    this.pageChange.emit(page);
  }

  isExpanded(r: Reconciliation): boolean {
    return this.expandedRowId() === r.id;
  }

  toggleExpand(r: Reconciliation): void {
    const id = r?.id;
    if (id == null || id === '' || id === '-1') return;
    const current = this.expandedRowId();
    if (current === r.id) {
      this.expandedRowId.set(null);
      return;
    }
    this.expandedRowId.set(r.id);
    const cache = this.detailsCache();
    if (cache[r.id] !== undefined) {
      return;
    }
    this.loadingDetailsId.set(r.id);
    this.cashierSessionService.getReconciliationDetails(r.id).subscribe({
      next: (details) => {
        this.detailsCache.update((c) => ({ ...c, [r.id]: details }));
        this.loadingDetailsId.set(null);
      },
      error: () => this.loadingDetailsId.set(null),
    });
  }

  getDetails(r: Reconciliation): ReconciliationAccountDetail[] {
    return this.detailsCache()[r.id] ?? [];
  }
}

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
import type { LedgerAccount } from '../../../../core/services/ledger/ledger.service';

@Component({
  selector: 'app-reconciliation-tab',
  imports: [CommonModule],
  templateUrl: './reconciliation-tab.component.html',
  styleUrl: './reconciliation-tab.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReconciliationTabComponent {
  private readonly cashierSessionService = inject(CashierSessionService);

  reconciliations = input.required<Reconciliation[]>();
  accounts = input<LedgerAccount[]>([]);
  channelId = input.required<number>();
  isLoading = input.required<boolean>();
  totalItems = input.required<number>();
  currentPage = input.required<number>();
  pageSize = input.required<number>();
  formatDate = input.required<(date: string) => string>();
  formatCurrency = input.required<(amountCentsOrString: string) => string>();

  pageChange = output<number>();
  reconciliationCreated = output<void>();

  /** Per-account declared amount (cents) for manual reconciliation form */
  manualDeclaredAmounts = signal<Record<string, number>>({});
  manualRangeStart = signal<string>('');
  manualRangeEnd = signal<string>('');
  manualNotes = signal<string>('');
  manualSubmitting = signal(false);
  manualError = signal<string | null>(null);

  /** Expandable row: which reconciliation id is expanded (null = none). */
  expandedRowId = signal<string | null>(null);
  /** Cached per-account details by reconciliation id (lazy-loaded on expand). */
  detailsCache = signal<Record<string, ReconciliationAccountDetail[]>>({});
  /** Reconciliation id currently loading details (for spinner in expanded row). */
  loadingDetailsId = signal<string | null>(null);

  totalPages = computed(() => {
    const total = this.totalItems();
    const size = this.pageSize();
    return Math.ceil(total / size) || 1;
  });

  pageNumbers = computed(() => {
    const total = this.totalPages();
    return Array.from({ length: total }, (_, i) => i + 1);
  });

  /** Leaf accounts only (no parents) for manual reconciliation */
  leafAccounts = computed(() => {
    const accounts = this.accounts();
    return accounts.filter((a) => !a.isParent && a.isActive);
  });

  hasVariance(r: Reconciliation): boolean {
    const v = parseInt(r.varianceAmount, 10);
    return !Number.isNaN(v) && v !== 0;
  }

  onPageChange(page: number) {
    this.pageChange.emit(page);
  }

  isExpanded(r: Reconciliation): boolean {
    return this.expandedRowId() === r.id;
  }

  toggleExpand(r: Reconciliation): void {
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

  setManualDeclared(accountId: string, value: number) {
    this.manualDeclaredAmounts.update((m) => ({ ...m, [accountId]: value }));
  }

  getManualDeclared(accountId: string): number {
    return this.manualDeclaredAmounts()[accountId] ?? 0;
  }

  submitManualReconciliation() {
    const channelId = this.channelId();
    const rangeStart = this.manualRangeStart();
    const rangeEnd = this.manualRangeEnd();
    const accounts = this.leafAccounts();
    const amounts = this.manualDeclaredAmounts();

    if (!rangeStart || !rangeEnd) {
      this.manualError.set('Please set date range');
      return;
    }
    if (accounts.length === 0) {
      this.manualError.set('No accounts available. Load accounting data first.');
      return;
    }

    const accountIds: string[] = [];
    const accountDeclaredAmounts: { accountId: string; amountCents: string }[] = [];
    let totalCents = 0;
    for (const acc of accounts) {
      const cents = amounts[acc.id] ?? 0;
      accountIds.push(acc.id);
      accountDeclaredAmounts.push({ accountId: acc.id, amountCents: String(cents) });
      totalCents += cents;
    }

    const scopeRefId = `${rangeEnd}-manual-${Date.now()}`;
    this.manualSubmitting.set(true);
    this.manualError.set(null);

    this.cashierSessionService
      .createManualReconciliation({
        channelId,
        scope: 'manual',
        scopeRefId,
        rangeStart,
        rangeEnd,
        actualBalance: String(totalCents),
        notes: this.manualNotes() || `Manual reconciliation ${rangeStart}–${rangeEnd}`,
        accountIds,
        accountDeclaredAmounts,
      })
      .subscribe({
        next: (recon) => {
          this.manualSubmitting.set(false);
          if (recon) {
            this.manualDeclaredAmounts.set({});
            this.manualNotes.set('');
            this.reconciliationCreated.emit();
          } else {
            this.manualError.set(
              this.cashierSessionService.error() ?? 'Failed to create reconciliation',
            );
          }
        },
        error: (err) => {
          this.manualSubmitting.set(false);
          this.manualError.set(err?.message ?? 'Failed to create reconciliation');
        },
      });
  }
}

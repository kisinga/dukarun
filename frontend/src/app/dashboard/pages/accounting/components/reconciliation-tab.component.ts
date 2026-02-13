import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
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
import type { ReconciliationTabContext } from '../accounting-context';

@Component({
  selector: 'app-reconciliation-tab',
  imports: [CommonModule],
  templateUrl: './reconciliation-tab.component.html',
  styleUrl: './reconciliation-tab.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReconciliationTabComponent {
  private readonly cashierSessionService = inject(CashierSessionService);

  context = input.required<ReconciliationTabContext>();

  pageChange = output<number>();
  reconciliationCreated = output<void>();

  /** Per-account declared amount (shillings) for manual reconciliation form; converted to cents on submit */
  manualDeclaredAmounts = signal<Record<string, number>>({});
  /** Accounts the user has unlocked for editing; only these are included when submitting. */
  manualEditedAccountIds = signal<Record<string, boolean>>({});
  /** Reconciliation date (as-of). Always today for manual; read-only. */
  reconciliationDate = signal<string>(ReconciliationTabComponent.getTodayIsoDate());
  manualNotes = signal<string>('');
  manualSubmitting = signal(false);
  manualError = signal<string | null>(null);

  /** Current ledger balance (cents) per account as of manual range end date; loaded when range end is set */
  manualBalancesAsOf = signal<
    Array<{ accountId: string; accountCode: string; accountName: string; balanceCents: string }>
  >([]);
  manualBalancesLoading = signal(false);

  /** Expandable row: which reconciliation id is expanded (null = none). */
  expandedRowId = signal<string | null>(null);
  /** Cached per-account details by reconciliation id (lazy-loaded on expand). */
  detailsCache = signal<Record<string, ReconciliationAccountDetail[]>>({});
  /** Reconciliation id currently loading details (for spinner in expanded row). */
  loadingDetailsId = signal<string | null>(null);

  totalPages = computed(() => {
    const total = this.context().totalItems;
    const size = this.context().pageSize;
    return Math.ceil(total / size) || 1;
  });

  pageNumbers = computed(() => {
    const total = this.totalPages();
    return Array.from({ length: total }, (_, i) => i + 1);
  });

  tableAccounts = computed(() => this.context().reconciliationTableAccounts);

  /** At least one non-system account is unlocked for editing. */
  hasEditedAccounts = computed(() => {
    const edited = this.manualEditedAccountIds();
    const accounts = this.tableAccounts();
    return accounts.some((acc) => !acc.isSystemAccount && edited[acc.id]);
  });

  static getTodayIsoDate(): string {
    return new Date().toISOString().slice(0, 10);
  }

  constructor() {
    effect((onCleanup) => {
      const asOfDate = this.reconciliationDate();
      const channelId = this.context().channelId;
      if (!asOfDate || !channelId || Number.isNaN(channelId)) {
        this.manualBalancesAsOf.set([]);
        return;
      }
      this.manualBalancesLoading.set(true);
      const sub = this.cashierSessionService.getAccountBalancesAsOf(channelId, asOfDate).subscribe({
        next: (list) => {
          this.manualBalancesAsOf.set(list);
          this.manualBalancesLoading.set(false);
        },
        error: () => this.manualBalancesLoading.set(false),
      });
      onCleanup(() => {
        sub.unsubscribe();
      });
    });
  }

  /** Current balance in shillings for an account (from ledger as of range end date). */
  getCurrentBalanceShillings(accountId: string): number {
    const list = this.manualBalancesAsOf();
    const item = list.find((b) => b.accountId === accountId);
    if (!item) return 0;
    const cents = parseInt(item.balanceCents, 10);
    return Number.isNaN(cents) ? 0 : cents / 100;
  }

  /** Variance in shillings (declared - current). */
  getVarianceShillings(accountId: string): number {
    const declared = this.getManualDeclared(accountId);
    const current = this.getCurrentBalanceShillings(accountId);
    return declared - current;
  }

  /** Format shillings for display (e.g. 2000 -> "2,000.00"). */
  formatShillings(shillings: number): string {
    return new Intl.NumberFormat('en-KE', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(shillings);
  }

  /** Account type label for display (e.g. asset -> Asset). */
  accountTypeLabel(type: string): string {
    return type ? type.charAt(0).toUpperCase() + type.slice(1).toLowerCase() : '';
  }

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

  /** Set declared amount in shillings (user-facing). */
  setManualDeclared(accountId: string, valueShillings: number) {
    this.manualDeclaredAmounts.update((m) => ({ ...m, [accountId]: valueShillings }));
  }

  /** Get declared amount in shillings (user-facing). */
  getManualDeclared(accountId: string): number {
    return this.manualDeclaredAmounts()[accountId] ?? 0;
  }

  /** Unlock an account for editing; only unlocked accounts are submitted and posted. */
  unlockAccountForEdit(accountId: string): void {
    this.manualEditedAccountIds.update((m) => ({ ...m, [accountId]: true }));
  }

  /** Whether the user has unlocked this account for editing. */
  isAccountUnlocked(accountId: string): boolean {
    return !!this.manualEditedAccountIds()[accountId];
  }

  submitManualReconciliation() {
    const channelId = this.context().channelId;
    const today = ReconciliationTabComponent.getTodayIsoDate();
    const accounts = this.tableAccounts();
    const amounts = this.manualDeclaredAmounts();
    const edited = this.manualEditedAccountIds();

    if (accounts.length === 0) {
      this.manualError.set('No accounts available. Load accounting data first.');
      return;
    }

    const declaredAmounts: { accountCode: string; amountCents: string }[] = [];
    let totalCents = 0;
    for (const acc of accounts) {
      if (acc.isSystemAccount || !edited[acc.id]) continue;
      const shillings = amounts[acc.id] ?? 0;
      const cents = Math.round(Number(shillings) * 100);
      declaredAmounts.push({ accountCode: acc.code, amountCents: String(cents) });
      totalCents += cents;
    }

    if (declaredAmounts.length === 0) {
      this.manualError.set('Unlock and enter declared amounts for at least one account.');
      return;
    }

    const scopeRefId = `manual-${Date.now()}`;
    this.manualSubmitting.set(true);
    this.manualError.set(null);

    this.cashierSessionService
      .createManualReconciliation({
        channelId,
        scope: 'manual',
        scopeRefId,
        actualBalance: String(totalCents),
        notes: this.manualNotes() || `Manual reconciliation as of ${today}`,
        declaredAmounts,
      })
      .subscribe({
        next: (recon) => {
          this.manualSubmitting.set(false);
          if (recon) {
            this.manualDeclaredAmounts.set({});
            this.manualEditedAccountIds.set({});
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

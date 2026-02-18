import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  CashierSessionService,
  type Reconciliation,
  type ReconciliationAccountDetail,
} from '../../../core/services/cashier-session/cashier-session.service';
import { CompanyService } from '../../../core/services/company.service';
import { ReconciliationHistoryComponent } from '../../components/shared/reconciliation-history/reconciliation-history.component';

@Component({
  selector: 'app-shifts',
  standalone: true,
  imports: [CommonModule, RouterLink, ReconciliationHistoryComponent],
  templateUrl: './shifts.component.html',
  styleUrl: './shifts.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ShiftsComponent implements OnInit {
  private readonly cashierSessionService = inject(CashierSessionService);
  private readonly companyService = inject(CompanyService);

  readonly currentSession = this.cashierSessionService.currentSession;
  readonly error = this.cashierSessionService.error;

  /** Reconciliation list (same API as accounting ledger tab). */
  readonly reconciliations = signal<Reconciliation[]>([]);
  readonly reconciliationsTotal = signal(0);
  readonly reconciliationsLoading = signal(false);
  readonly reconciliationPage = signal(1);
  readonly reconciliationPageSize = 50;

  /** Opening reconciliation details for the current (open) session – loaded when there is an active session. */
  readonly currentSessionOpeningDetails = signal<ReconciliationAccountDetail[] | null>(null);
  readonly loadingCurrentOpeningDetails = signal(false);

  readonly channelId = computed(() => {
    const id = this.companyService.activeCompanyId();
    return id ? parseInt(id, 10) : 0;
  });

  readonly hasActiveSession = this.cashierSessionService.hasActiveSession;

  /** Context for the shared reconciliation history component. */
  readonly reconciliationHistoryContext = computed(() => ({
    reconciliations: this.reconciliations(),
    isLoading: this.reconciliationsLoading(),
    totalItems: this.reconciliationsTotal(),
    currentPage: this.reconciliationPage(),
    pageSize: this.reconciliationPageSize,
    formatDate: (date: string) =>
      new Date(date).toLocaleDateString('en-KE', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      }),
    formatCurrency: (amountCentsOrString: string) => {
      const cents =
        typeof amountCentsOrString === 'string'
          ? parseInt(amountCentsOrString, 10)
          : amountCentsOrString;
      if (Number.isNaN(cents)) return '0.00';
      return (cents / 100).toLocaleString('en-KE', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
    },
  }));

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    const channelId = this.channelId();
    if (!channelId) return;

    // Open/close status is loaded globally by CashierSessionService when channel is set
    const session = this.cashierSessionService.currentSession();
    const sid = session?.id != null ? String(session.id) : '';
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sid);
    if (isUuid) this.loadCurrentSessionOpeningDetails(sid);
    else this.currentSessionOpeningDetails.set(null);
    this.loadReconciliations();
  }

  /** Load opening reconciliation details for the current session (variances at open). Shown at top when there is an open shift. */
  loadCurrentSessionOpeningDetails(sessionId: string): void {
    this.loadingCurrentOpeningDetails.set(true);
    this.currentSessionOpeningDetails.set(null);
    this.cashierSessionService.getSessionReconciliationDetails(sessionId, 'opening').subscribe({
      next: (details) => {
        this.currentSessionOpeningDetails.set(details);
        this.loadingCurrentOpeningDetails.set(false);
      },
      error: () => this.loadingCurrentOpeningDetails.set(false),
    });
  }

  loadReconciliations(): void {
    const channelId = this.channelId();
    if (!channelId) return;
    this.reconciliationsLoading.set(true);
    const page = this.reconciliationPage();
    const take = this.reconciliationPageSize;
    const skip = (page - 1) * take;
    this.cashierSessionService.getReconciliations(channelId, { take, skip }).subscribe({
      next: (res) => {
        this.reconciliations.set(res.items ?? []);
        this.reconciliationsTotal.set(res.totalItems ?? 0);
        this.reconciliationsLoading.set(false);
      },
      error: () => {
        this.reconciliations.set([]);
        this.reconciliationsTotal.set(0);
        this.reconciliationsLoading.set(false);
      },
    });
  }

  onReconciliationPageChange(page: number): void {
    this.reconciliationPage.set(page);
    this.loadReconciliations();
  }

  formatDateTime(dateStr: string): string {
    return new Date(dateStr).toLocaleString('en-KE', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  /** Format amount in cents for display (e.g. "12345" → "123.45"). */
  formatCents(cents: string | null): string {
    if (cents == null) return '–';
    const n = parseInt(cents, 10);
    if (Number.isNaN(n)) return cents;
    return (n / 100).toLocaleString('en-KE', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }
}

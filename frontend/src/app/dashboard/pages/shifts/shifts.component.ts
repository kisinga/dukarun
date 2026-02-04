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
  type CashierSession,
  type ReconciliationAccountDetail,
} from '../../../core/services/cashier-session/cashier-session.service';
import { CompanyService } from '../../../core/services/company.service';

@Component({
  selector: 'app-shifts',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './shifts.component.html',
  styleUrl: './shifts.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ShiftsComponent implements OnInit {
  private readonly cashierSessionService = inject(CashierSessionService);
  private readonly companyService = inject(CompanyService);

  readonly currentSession = this.cashierSessionService.currentSession;
  readonly sessions = this.cashierSessionService.sessions;
  readonly totalSessions = this.cashierSessionService.totalSessions;
  readonly isLoading = this.cashierSessionService.isLoading;
  readonly error = this.cashierSessionService.error;

  readonly sessionsPage = signal(1);
  readonly pageSize = signal(20);
  readonly pageSizeOptions = [10, 20, 50, 100] as const;

  /** Expand session row: which session id is expanded (null = none). */
  readonly expandedSessionId = signal<string | null>(null);
  /** Cached per-account details by session id (lazy-loaded on expand). */
  readonly sessionDetailsCache = signal<Record<string, ReconciliationAccountDetail[]>>({});
  /** Session id currently loading details. */
  readonly loadingDetailsSessionId = signal<string | null>(null);

  /** Opening reconciliation details for the current (open) session – loaded when there is an active session. */
  readonly currentSessionOpeningDetails = signal<ReconciliationAccountDetail[] | null>(null);
  readonly loadingCurrentOpeningDetails = signal(false);

  readonly channelId = computed(() => {
    const id = this.companyService.activeCompanyId();
    return id ? parseInt(id, 10) : 0;
  });

  readonly hasActiveSession = this.cashierSessionService.hasActiveSession;

  readonly totalPages = computed(() => {
    const total = this.totalSessions();
    const size = this.pageSize();
    return Math.max(1, Math.ceil(total / size));
  });

  /** Page numbers to show in pagination (max 7 slots; use -1 for ellipsis). */
  readonly pageNumbers = computed(() => {
    const current = this.sessionsPage();
    const total = this.totalPages();
    if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
    const pages: number[] = [];
    let start = Math.max(1, current - 3);
    let end = Math.min(total, start + 6);
    if (end - start < 6) start = Math.max(1, end - 6);
    if (start > 1) pages.push(1);
    if (start > 2) pages.push(-1);
    for (let p = start; p <= end; p++) pages.push(p);
    if (end < total - 1) pages.push(-1);
    if (end < total) pages.push(total);
    return pages;
  });

  /** "Showing 1–20 of 45" range (1-based). */
  readonly rangeStart = computed(() => {
    const page = this.sessionsPage();
    const size = this.pageSize();
    const total = this.totalSessions();
    if (total === 0) return 0;
    return (page - 1) * size + 1;
  });

  readonly rangeEnd = computed(() => {
    const page = this.sessionsPage();
    const size = this.pageSize();
    const total = this.totalSessions();
    return Math.min(page * size, total);
  });

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    const channelId = this.channelId();
    if (!channelId) return;

    this.cashierSessionService.getCurrentSession(channelId).subscribe({
      next: () => this.loadCurrentSessionOpeningDetails(),
    });
    this.loadSessions(channelId);
  }

  /** Load opening reconciliation details for the current session (variances at open). Shown at top when there is an open shift. */
  loadCurrentSessionOpeningDetails(): void {
    const session = this.cashierSessionService.currentSession();
    if (!session || this.cashierSessionService.hasActiveSession() !== true) {
      this.currentSessionOpeningDetails.set(null);
      return;
    }
    this.loadingCurrentOpeningDetails.set(true);
    this.currentSessionOpeningDetails.set(null);
    this.cashierSessionService.getSessionReconciliationDetails(session.id, 'opening').subscribe({
      next: (details) => {
        this.currentSessionOpeningDetails.set(details);
        this.loadingCurrentOpeningDetails.set(false);
      },
      error: () => this.loadingCurrentOpeningDetails.set(false),
    });
  }

  loadSessions(channelId: number): void {
    const page = this.sessionsPage();
    const size = this.pageSize();
    this.cashierSessionService
      .getSessions(channelId, {
        take: size,
        skip: (page - 1) * size,
      })
      .subscribe();
  }

  onSessionsPageChange(page: number): void {
    this.sessionsPage.set(page);
    const channelId = this.channelId();
    if (channelId) this.loadSessions(channelId);
  }

  onPageSizeChange(newSize: number): void {
    this.pageSize.set(newSize);
    this.sessionsPage.set(1);
    const channelId = this.channelId();
    if (channelId) this.loadSessions(channelId);
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

  sessionStatus(session: CashierSession): string {
    return session.closedAt ? 'Closed' : 'Open';
  }

  isExpanded(session: CashierSession): boolean {
    return this.expandedSessionId() === session.id;
  }

  toggleExpand(session: CashierSession): void {
    const current = this.expandedSessionId();
    if (current === session.id) {
      this.expandedSessionId.set(null);
      return;
    }
    this.expandedSessionId.set(session.id);
    const cache = this.sessionDetailsCache();
    if (cache[session.id] !== undefined) {
      return;
    }
    if (!session.closedAt) {
      return;
    }
    this.loadingDetailsSessionId.set(session.id);
    this.cashierSessionService.getSessionReconciliationDetails(session.id).subscribe({
      next: (details) => {
        this.sessionDetailsCache.update((c) => ({ ...c, [session.id]: details }));
        this.loadingDetailsSessionId.set(null);
      },
      error: () => this.loadingDetailsSessionId.set(null),
    });
  }

  getSessionDetails(session: CashierSession): ReconciliationAccountDetail[] {
    return this.sessionDetailsCache()[session.id] ?? [];
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

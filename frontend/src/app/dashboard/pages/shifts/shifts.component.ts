import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  effect,
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

/** Cached reconciliation details for a shift (opening and/or closing). */
export interface ShiftReconciliationDetails {
  opening: ReconciliationAccountDetail[];
  closing: ReconciliationAccountDetail[];
}

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
  readonly error = this.cashierSessionService.error;

  /** Shifts list (sessions). */
  readonly sessions = signal<CashierSession[]>([]);
  readonly sessionsTotal = signal(0);
  readonly sessionsLoading = signal(false);
  readonly sessionsPage = signal(1);
  readonly sessionsPageSize = 25;

  /** Opening reconciliation details for the current (open) session – loaded when there is an active session. */
  readonly currentSessionOpeningDetails = signal<ReconciliationAccountDetail[] | null>(null);
  readonly loadingCurrentOpeningDetails = signal(false);

  /** Expandable row: which session id is expanded (null = none). Per-shift reconciliation details cache. */
  readonly expandedSessionId = signal<string | null>(null);
  readonly shiftDetailsCache = signal<Record<string, ShiftReconciliationDetails>>({});
  readonly loadingDetailsSessionId = signal<string | null>(null);

  readonly channelId = computed(() => {
    const id = this.companyService.activeCompanyId();
    return id ? parseInt(id, 10) : 0;
  });

  readonly hasActiveSession = this.cashierSessionService.hasActiveSession;

  private static readonly UUID_REGEX =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  constructor() {
    // Load opening details whenever currentSession becomes available (same pattern as reconciliation
    // history: details load when the parent context is ready). Current session is set asynchronously
    // by CashierSessionService when channel loads, so we must react to it here instead of only in load().
    effect(() => {
      const channelId = this.channelId();
      const session = this.cashierSessionService.currentSession();
      if (!channelId) return;
      const sid = session?.id != null ? String(session.id).trim() : '';
      const valid = sid !== '' && sid !== '-1' && ShiftsComponent.UUID_REGEX.test(sid);
      if (valid) {
        this.loadCurrentSessionOpeningDetails(sid);
      } else {
        this.currentSessionOpeningDetails.set(null);
      }
    });
  }

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    const channelId = this.channelId();
    if (!channelId) return;

    // Opening details are driven by effect(); here we only refresh if we already have a session.
    const session = this.cashierSessionService.currentSession();
    const sid = session?.id != null ? String(session.id).trim() : '';
    const isValidSessionId = sid !== '' && sid !== '-1' && ShiftsComponent.UUID_REGEX.test(sid);
    if (isValidSessionId) {
      this.loadCurrentSessionOpeningDetails(sid);
    } else {
      this.currentSessionOpeningDetails.set(null);
    }
    this.loadSessions();
  }

  /** Load opening reconciliation details for the current session (variances at open). Shown at top when there is an open shift. */
  loadCurrentSessionOpeningDetails(sessionId: string): void {
    if (!sessionId || sessionId === '-1' || !ShiftsComponent.UUID_REGEX.test(sessionId)) {
      this.currentSessionOpeningDetails.set(null);
      return;
    }
    this.loadingCurrentOpeningDetails.set(true);
    this.currentSessionOpeningDetails.set(null);
    const channelId = this.channelId();
    this.cashierSessionService
      .getSessionReconciliationDetails(sessionId, 'opening', channelId || undefined)
      .subscribe({
        next: (details) => {
          // Only apply if this is still the current session (avoid stale response overwriting).
          const current = this.cashierSessionService.currentSession();
          if (current && String(current.id).trim() === sessionId) {
            this.currentSessionOpeningDetails.set(details);
          }
          this.loadingCurrentOpeningDetails.set(false);
        },
        error: () => this.loadingCurrentOpeningDetails.set(false),
      });
  }

  loadSessions(): void {
    const channelId = this.channelId();
    if (!channelId) return;
    this.sessionsLoading.set(true);
    const page = this.sessionsPage();
    const take = this.sessionsPageSize;
    const skip = (page - 1) * take;
    this.cashierSessionService.getSessions(channelId, { take, skip }).subscribe({
      next: (res) => {
        this.sessions.set(res.items ?? []);
        this.sessionsTotal.set(res.totalItems ?? 0);
        this.sessionsLoading.set(false);
      },
      error: () => {
        this.sessions.set([]);
        this.sessionsTotal.set(0);
        this.sessionsLoading.set(false);
      },
    });
  }

  onSessionsPageChange(page: number): void {
    this.sessionsPage.set(page);
    this.loadSessions();
  }

  readonly sessionsTotalPages = computed(() => {
    const total = this.sessionsTotal();
    const size = this.sessionsPageSize;
    return Math.ceil(total / size) || 1;
  });

  readonly sessionsPageNumbers = computed(() => {
    const total = this.sessionsTotalPages();
    return Array.from({ length: total }, (_, i) => i + 1);
  });

  isSessionExpanded(session: CashierSession): boolean {
    return this.expandedSessionId() === session.id;
  }

  getShiftDetails(session: CashierSession): ShiftReconciliationDetails | undefined {
    return this.shiftDetailsCache()[session.id];
  }

  toggleExpand(session: CashierSession): void {
    const id = session?.id;
    if (id == null || id === '' || id === '-1') return;
    const current = this.expandedSessionId();
    if (current === id) {
      this.expandedSessionId.set(null);
      return;
    }
    this.expandedSessionId.set(id);
    const cache = this.shiftDetailsCache();
    if (cache[id] !== undefined) {
      return;
    }
    this.loadShiftDetails(id);
  }

  /** Load opening and closing reconciliation details for a shift (lazy on expand). */
  loadShiftDetails(sessionId: string): void {
    if (!sessionId || sessionId === '-1' || !ShiftsComponent.UUID_REGEX.test(sessionId)) {
      return;
    }
    const channelId = this.channelId();
    this.loadingDetailsSessionId.set(sessionId);
    const done = (
      opening: ReconciliationAccountDetail[],
      closing: ReconciliationAccountDetail[],
    ) => {
      this.shiftDetailsCache.update((c) => ({
        ...c,
        [sessionId]: { opening, closing },
      }));
      this.loadingDetailsSessionId.set(null);
    };
    this.cashierSessionService
      .getSessionReconciliationDetails(sessionId, 'opening', channelId || undefined)
      .subscribe({
        next: (opening) => {
          this.cashierSessionService
            .getSessionReconciliationDetails(sessionId, 'closing', channelId || undefined)
            .subscribe({
              next: (closing) => done(opening, closing),
              error: () => done(opening, []),
            });
        },
        error: () => {
          this.cashierSessionService
            .getSessionReconciliationDetails(sessionId, 'closing', channelId || undefined)
            .subscribe({
              next: (closing) => done([], closing),
              error: () => done([], []),
            });
        },
      });
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

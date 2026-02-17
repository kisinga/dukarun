import { Injectable, inject, signal, computed, effect } from '@angular/core';
import moment from 'moment';
import { gql } from '@apollo/client/core';
import { ApolloService } from '../apollo.service';
import { CompanyService } from '../company.service';
import { map, catchError, of, from, tap } from 'rxjs';
import {
  GET_ACCOUNT_BALANCES_AS_OF,
  GET_CURRENT_CASHIER_SESSION,
  GET_CASHIER_SESSION,
  GET_CASHIER_SESSIONS,
  GET_CHANNEL_RECONCILIATION_CONFIG,
  GET_SHIFT_MODAL_PREFILL_DATA,
  GET_RECONCILIATIONS,
  GET_RECONCILIATION_DETAILS,
  GET_LAST_CLOSED_SESSION_CLOSING_BALANCES,
  GET_EXPECTED_SESSION_CLOSING_BALANCES,
  OPEN_CASHIER_SESSION,
  CLOSE_CASHIER_SESSION,
  CREATE_CASHIER_SESSION_RECONCILIATION,
  CREATE_RECONCILIATION,
} from '../../graphql/operations.graphql';

const GET_SESSION_RECONCILIATION_DETAILS = gql`
  query GetSessionReconciliationDetails($sessionId: ID!, $kind: String) {
    sessionReconciliationDetails(sessionId: $sessionId, kind: $kind) {
      accountId
      accountCode
      accountName
      declaredAmountCents
      expectedBalanceCents
      varianceCents
    }
  }
`;

export interface CashierSession {
  id: string;
  channelId: number;
  cashierUserId: number;
  openedAt: string;
  closedAt?: string | null;
  closingDeclared: string;
  status: 'open' | 'closed';
}

export interface PaymentMethodReconciliationConfig {
  paymentMethodId: string;
  paymentMethodCode: string;
  /** Present when backend schema and codegen include it; otherwise use paymentMethodCode for display. */
  paymentMethodName?: string;
  reconciliationType: string;
  ledgerAccountCode: string;
  isCashierControlled: boolean;
  requiresReconciliation: boolean;
}

export interface OpeningBalanceInput {
  accountCode: string;
  amountCents: number;
}

export interface ReconciliationListOptions {
  startDate?: string;
  endDate?: string;
  scope?: string;
  hasVariance?: boolean;
  take?: number;
  skip?: number;
}

export interface DeclaredAmountInput {
  accountCode: string;
  amountCents: string;
}

export interface CreateReconciliationInput {
  channelId: number;
  scope: string;
  scopeRefId: string;
  expectedBalance?: string;
  actualBalance: string;
  notes?: string;
  declaredAmounts: DeclaredAmountInput[];
}

export interface CashierSessionLedgerTotals {
  cashTotal: string;
  mpesaTotal: string;
  totalCollected: string;
}

export interface CashierSessionSummary {
  sessionId: string;
  cashierUserId: number;
  openedAt: string;
  closedAt?: string | null;
  status: string;
  openingFloat: string;
  closingDeclared: string;
  ledgerTotals: CashierSessionLedgerTotals;
  variance: string;
}

export interface Reconciliation {
  id: string;
  channelId: number;
  scope: string;
  scopeRefId: string;
  rangeStart: string;
  rangeEnd: string;
  status: string;
  expectedBalance?: string | null;
  actualBalance?: string | null;
  varianceAmount: string;
  notes?: string | null;
  createdBy: number;
}

export interface ReconciliationAccountDetail {
  accountId: string;
  accountCode: string;
  accountName: string;
  declaredAmountCents: string | null;
  expectedBalanceCents: string | null;
  varianceCents: string | null;
}

export interface LastClosingBalance {
  accountCode: string;
  accountName: string;
  balanceCents: string;
}

export interface ShiftModalPrefillData {
  config: PaymentMethodReconciliationConfig[];
  balances: LastClosingBalance[];
}

export interface ExpectedClosingBalance {
  accountCode: string;
  accountName: string;
  expectedBalanceCents: string;
}

export interface CashierSessionListOptions {
  status?: string;
  startDate?: string;
  endDate?: string;
  take?: number;
  skip?: number;
}

@Injectable({
  providedIn: 'root',
})
export class CashierSessionService {
  private readonly apolloService = inject(ApolloService);
  private readonly companyService = inject(CompanyService);

  readonly currentSession = signal<CashierSession | null>(null);
  readonly sessions = signal<CashierSession[]>([]);
  readonly totalSessions = signal(0);
  readonly sessionSummary = signal<CashierSessionSummary | null>(null);
  readonly isLoading = signal(false);
  readonly error = signal<string | null>(null);

  /**
   * When the shift was last closed (ISO date string). Set when closeSession succeeds, cleared when openSession succeeds.
   * Used to show "closed for Xh" in the UI. Not persisted across refresh.
   */
  readonly lastClosedAt = signal<string | null>(null);

  /** Computed: is there an active session? */
  readonly hasActiveSession = computed(() => this.currentSession() !== null);

  /**
   * Reference date for "time open" or "time closed": openedAt when open, lastClosedAt when closed.
   * Used with current time to render duration in the shift badge.
   */
  readonly shiftStatusSince = computed(() => {
    const session = this.currentSession();
    if (session?.openedAt) return { at: session.openedAt, isOpen: true };
    const closed = this.lastClosedAt();
    if (closed) return { at: closed, isOpen: false };
    return null;
  });

  /**
   * Format a shift open/close time for display. Same day: "at HH:mm"; other day: "on D MMM YYYY HH:mm".
   * Used by dashboard badge and sell banner so label (Open/Closed) is only shown once in the UI.
   */
  formatShiftTimeAt(isoDate: string): string | null {
    const m = moment(isoDate);
    if (!m.isValid()) return null;
    if (m.isSame(moment(), 'day')) return `at ${m.format('HH:mm')}`;
    return `on ${m.format('D MMM YYYY HH:mm')}`;
  }

  /** How long the shift has been open (openedAt → now), e.g. "2 hours" / "a day". */
  formatShiftDuration(openedAt: string): string | null {
    const m = moment(openedAt);
    if (!m.isValid()) return null;
    return m.fromNow(true);
  }

  /** Computed: variance amount parsed as number (in cents) */
  readonly varianceAmount = computed(() => {
    const summary = this.sessionSummary();
    return summary ? parseInt(summary.variance, 10) : 0;
  });

  /** Computed: has variance (non-zero) */
  readonly hasVariance = computed(() => Math.abs(this.varianceAmount()) > 0);

  constructor() {
    // Load current cashier session (open/close status) whenever the active channel changes,
    // so the status is available globally and not tied to navigating to the dashboard.
    effect(() => {
      const id = this.companyService.activeCompanyId();
      if (id === null) {
        this.currentSession.set(null);
        this.lastClosedAt.set(null);
        return;
      }
      const channelId = parseInt(id, 10);
      if (Number.isNaN(channelId)) return;
      const sub = this.getCurrentSession(channelId).subscribe();
      return () => sub.unsubscribe();
    });
  }

  /** Session id must be a valid UUID; never store placeholder/invalid ids (e.g. -1). */
  private static isValidSessionId(id: unknown): boolean {
    if (id == null) return false;
    const s = typeof id === 'string' ? id.trim() : String(id);
    if (s === '' || s === '-1') return false;
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s);
  }

  /**
   * Get current open session for a channel.
   * Only stores a session when its id is a valid UUID; otherwise treats as no session.
   */
  getCurrentSession(channelId: number) {
    this.isLoading.set(true);
    this.error.set(null);

    const client = this.apolloService.getClient();
    const queryPromise = client.query<{ currentCashierSession: CashierSession | null }>({
      query: GET_CURRENT_CASHIER_SESSION as any,
      variables: { channelId },
      fetchPolicy: 'network-only',
    });

    return from(queryPromise).pipe(
      map((result) => {
        const raw = result.data?.currentCashierSession ?? null;
        const session = raw && CashierSessionService.isValidSessionId(raw.id) ? raw : null;
        this.currentSession.set(session);
        this.isLoading.set(false);
        return session;
      }),
      tap((session) => {
        if (!session) this.loadLastClosedAt(channelId).subscribe();
      }),
      catchError((err) => {
        this.error.set(err.message || 'Failed to get current session');
        this.isLoading.set(false);
        this.currentSession.set(null);
        return of(null);
      }),
    );
  }

  /**
   * Load the closedAt of the most recent closed session into lastClosedAt so the UI can show "closed for X".
   * Called when getCurrentSession returns null (e.g. on load or after refresh).
   */
  loadLastClosedAt(channelId: number) {
    const client = this.apolloService.getClient();
    return from(
      client.query<{ cashierSessions: { items: CashierSession[] } }>({
        query: GET_CASHIER_SESSIONS as any,
        variables: { channelId, options: { status: 'closed', take: 1 } },
        fetchPolicy: 'network-only',
      }),
    ).pipe(
      map((result) => {
        const items = result.data?.cashierSessions?.items ?? [];
        const last = items[0];
        if (last?.closedAt)
          this.lastClosedAt.set(
            typeof last.closedAt === 'string'
              ? last.closedAt
              : (last.closedAt as Date).toISOString(),
          );
        return last?.closedAt ?? null;
      }),
      catchError(() => of(null)),
    );
  }

  /**
   * Get session summary with ledger totals
   */
  getSessionSummary(sessionId: string) {
    this.isLoading.set(true);
    this.error.set(null);

    const client = this.apolloService.getClient();
    const queryPromise = client.query<{ cashierSession: CashierSessionSummary }>({
      query: GET_CASHIER_SESSION as any,
      variables: { sessionId },
      fetchPolicy: 'network-only',
    });

    return from(queryPromise).pipe(
      map((result) => {
        const summary = result.data?.cashierSession ?? null;
        this.sessionSummary.set(summary);
        this.isLoading.set(false);
        return summary;
      }),
      catchError((err) => {
        this.error.set(err.message || 'Failed to get session summary');
        this.isLoading.set(false);
        return of(null);
      }),
    );
  }

  /**
   * Get sessions list with pagination
   */
  getSessions(channelId: number, options?: CashierSessionListOptions) {
    this.isLoading.set(true);
    this.error.set(null);

    const client = this.apolloService.getClient();
    const queryPromise = client.query<{
      cashierSessions: { items: CashierSession[]; totalItems: number };
    }>({
      query: GET_CASHIER_SESSIONS as any,
      variables: { channelId, options },
      fetchPolicy: 'network-only',
    });

    return from(queryPromise).pipe(
      map((result) => {
        if (result.data) {
          this.sessions.set(result.data.cashierSessions.items);
          this.totalSessions.set(result.data.cashierSessions.totalItems);
          this.isLoading.set(false);
          return result.data.cashierSessions;
        }
        this.isLoading.set(false);
        return { items: [], totalItems: 0 };
      }),
      catchError((err) => {
        this.error.set(err.message || 'Failed to load sessions');
        this.isLoading.set(false);
        return of({ items: [], totalItems: 0 });
      }),
    );
  }

  /**
   * Get channel reconciliation config (cashier-controlled accounts for opening balances).
   */
  getChannelReconciliationConfig(channelId: number) {
    const client = this.apolloService.getClient();
    return from(
      client.query<{ channelReconciliationConfig: PaymentMethodReconciliationConfig[] }>({
        query: GET_CHANNEL_RECONCILIATION_CONFIG as any,
        variables: { channelId },
        fetchPolicy: 'network-only',
      }),
    ).pipe(
      map((result) => result.data?.channelReconciliationConfig ?? []),
      catchError(() => of([])),
    );
  }

  /**
   * Get shift modal prefill data: config + ledger balances for clearing accounts.
   * Single API call for both opening and closing modals.
   */
  getShiftModalPrefillData(channelId: number) {
    const client = this.apolloService.getClient();
    return from(
      client.query<{ shiftModalPrefillData: ShiftModalPrefillData }>({
        query: GET_SHIFT_MODAL_PREFILL_DATA as any,
        variables: { channelId },
        fetchPolicy: 'network-only',
      }),
    ).pipe(
      map((result) => result.data?.shiftModalPrefillData ?? { config: [], balances: [] }),
      catchError(() => of({ config: [], balances: [] })),
    );
  }

  /**
   * Open a new cashier session with per-account opening balances.
   */
  openSession(channelId: number, openingBalances: OpeningBalanceInput[]) {
    this.isLoading.set(true);
    this.error.set(null);

    const client = this.apolloService.getClient();
    const mutationPromise = client.mutate<{ openCashierSession: CashierSession }>({
      mutation: OPEN_CASHIER_SESSION as any,
      variables: {
        input: {
          channelId,
          openingBalances: openingBalances.map((b) => ({
            accountCode: b.accountCode,
            amountCents: b.amountCents,
          })),
        },
      },
    });

    return from(mutationPromise).pipe(
      map((result) => {
        const raw = result.data?.openCashierSession ?? null;
        const session = raw && CashierSessionService.isValidSessionId(raw.id) ? raw : null;
        this.currentSession.set(session);
        if (session) this.lastClosedAt.set(null);
        this.isLoading.set(false);
        return session;
      }),
      catchError((err) => {
        this.error.set(err.message || 'Failed to open session');
        this.isLoading.set(false);
        return of(null);
      }),
    );
  }

  /**
   * Get ledger balance (cents) per leaf account as of a date. For manual reconciliation UI (current balance + variance).
   */
  getAccountBalancesAsOf(channelId: number, asOfDate: string) {
    const client = this.apolloService.getClient();
    return from(
      client.query<{
        accountBalancesAsOf: Array<{
          accountId: string;
          accountCode: string;
          accountName: string;
          balanceCents: string;
        }>;
      }>({
        query: GET_ACCOUNT_BALANCES_AS_OF as any,
        variables: { channelId, asOfDate },
        fetchPolicy: 'network-only',
      }),
    ).pipe(
      map((result) => result.data?.accountBalancesAsOf ?? []),
      catchError((err) => {
        console.warn('[CashierSession] getAccountBalancesAsOf failed', err);
        return of([]);
      }),
    );
  }

  /**
   * List reconciliations for a channel (for Reconciliation History UI).
   */
  getReconciliations(channelId: number, options?: ReconciliationListOptions) {
    const client = this.apolloService.getClient();
    return from(
      client.query<{ reconciliations: { items: Reconciliation[]; totalItems: number } }>({
        query: GET_RECONCILIATIONS as any,
        variables: { channelId, options: options ?? {} },
        fetchPolicy: 'network-only',
      }),
    ).pipe(
      map((result) => result.data?.reconciliations ?? { items: [], totalItems: 0 }),
      catchError((err) => {
        console.warn('[CashierSession] getReconciliations failed', err);
        return of({ items: [], totalItems: 0 });
      }),
    );
  }

  /** Per-account details for a reconciliation (lazy-loaded when expanding a row). */
  getReconciliationDetails(reconciliationId: string) {
    const id = reconciliationId != null ? String(reconciliationId).trim() : '';
    if (!id || id === '-1') {
      return of([]);
    }
    const client = this.apolloService.getClient();
    return from(
      client.query<{
        reconciliationDetails: ReconciliationAccountDetail[];
      }>({
        query: GET_RECONCILIATION_DETAILS as any,
        variables: { reconciliationId: id },
        fetchPolicy: 'network-only',
      }),
    ).pipe(
      map((result) => {
        if (result.error) {
          console.warn('[CashierSession] getReconciliationDetails error', result.error);
          return [];
        }
        return result.data?.reconciliationDetails ?? [];
      }),
      catchError((err) => {
        console.warn('[CashierSession] getReconciliationDetails failed', err);
        return of([]);
      }),
    );
  }

  /**
   * Per-account reconciliation details for a session.
   * @param sessionId - Session ID (must be a valid UUID; invalid/placeholder ids are not sent to the API).
   * @param kind - 'opening' for variances at open (e.g. current shift), 'closing' for variances at close (default)
   */
  getSessionReconciliationDetails(sessionId: string, kind: 'opening' | 'closing' = 'closing') {
    if (!CashierSessionService.isValidSessionId(sessionId)) {
      return of([]);
    }
    const client = this.apolloService.getClient();
    return from(
      client.query<{
        sessionReconciliationDetails: ReconciliationAccountDetail[];
      }>({
        query: GET_SESSION_RECONCILIATION_DETAILS,
        variables: { sessionId, kind: kind === 'opening' ? 'opening' : 'closing' },
        fetchPolicy: 'network-only',
      }),
    ).pipe(
      map((result) => result.data?.sessionReconciliationDetails ?? []),
      catchError((err) => {
        console.warn('[CashierSession] getSessionReconciliationDetails failed', err);
        return of([]);
      }),
    );
  }

  /**
   * Close a cashier session with per-account closing amounts (same shape as opening).
   * Pass channelId so the backend can resolve the current session when sessionId is missing or stale.
   */
  closeSession(
    sessionId: string,
    closingBalances: Array<{ accountCode: string; amountCents: number }>,
    notes?: string,
    channelId?: number,
  ) {
    this.isLoading.set(true);
    this.error.set(null);

    const client = this.apolloService.getClient();
    const input: {
      sessionId: string;
      closingBalances: Array<{ accountCode: string; amountCents: number }>;
      notes?: string;
      channelId?: number;
    } = {
      sessionId,
      closingBalances,
      notes,
    };
    if (channelId != null && !Number.isNaN(channelId)) {
      input.channelId = channelId;
    }

    const mutationPromise = client.mutate({
      mutation: CLOSE_CASHIER_SESSION,
      variables: { input },
    });

    return from(mutationPromise).pipe(
      map((result) => {
        const summary = result.data?.closeCashierSession ?? null;
        if (summary) {
          this.sessionSummary.set(summary);
          this.currentSession.set(null); // Session is now closed
          const closedAt = (summary as { closedAt?: string | null }).closedAt;
          if (closedAt) this.lastClosedAt.set(closedAt);
        }
        this.isLoading.set(false);
        return summary;
      }),
      catchError((err) => {
        this.error.set(err.message || 'Failed to close session');
        this.isLoading.set(false);
        return of(null);
      }),
    );
  }

  /**
   * Create reconciliation for a closed session
   */
  createReconciliation(sessionId: string, notes?: string) {
    this.isLoading.set(true);
    this.error.set(null);

    const client = this.apolloService.getClient();
    const mutationPromise = client.mutate<{
      createCashierSessionReconciliation: Reconciliation;
    }>({
      mutation: CREATE_CASHIER_SESSION_RECONCILIATION as any,
      variables: { sessionId, notes },
    });

    return from(mutationPromise).pipe(
      map((result) => {
        this.isLoading.set(false);
        return result.data?.createCashierSessionReconciliation ?? null;
      }),
      catchError((err) => {
        this.error.set(err.message || 'Failed to create reconciliation');
        this.isLoading.set(false);
        return of(null);
      }),
    );
  }

  /**
   * Create a manual reconciliation (capture all accounts).
   * Use scope 'manual' and pass per-account declared amounts.
   */
  createManualReconciliation(input: CreateReconciliationInput) {
    this.isLoading.set(true);
    this.error.set(null);

    const client = this.apolloService.getClient();
    const mutationPromise = client.mutate<{ createReconciliation: Reconciliation }>({
      mutation: CREATE_RECONCILIATION as any,
      variables: { input },
    });

    return from(mutationPromise).pipe(
      map((result) => {
        this.isLoading.set(false);
        return result.data?.createReconciliation ?? null;
      }),
      catchError((err) => {
        this.error.set(err.message || 'Failed to create reconciliation');
        this.isLoading.set(false);
        return of(null);
      }),
    );
  }

  /**
   * Get per-account closing balances from the last closed session for this channel.
   * Used to pre-fill opening balances for the next session.
   */
  getLastClosingBalances(channelId: number) {
    const client = this.apolloService.getClient();
    return from(
      client.query<{ lastClosedSessionClosingBalances: LastClosingBalance[] }>({
        query: GET_LAST_CLOSED_SESSION_CLOSING_BALANCES as any,
        variables: { channelId },
        fetchPolicy: 'network-only',
      }),
    ).pipe(
      map((result) => result.data?.lastClosedSessionClosingBalances ?? []),
      catchError((err) => {
        console.warn('[CashierSession] getLastClosingBalances failed', err);
        return of([]);
      }),
    );
  }

  /**
   * Get expected closing balances for an open session (per cashier-controlled account).
   * Expected = opening declared + session ledger balance.
   */
  getExpectedClosingBalances(sessionId: string) {
    if (!CashierSessionService.isValidSessionId(sessionId)) {
      return of([]);
    }
    const client = this.apolloService.getClient();
    return from(
      client.query<{ expectedSessionClosingBalances: ExpectedClosingBalance[] }>({
        query: GET_EXPECTED_SESSION_CLOSING_BALANCES as any,
        variables: { sessionId },
        fetchPolicy: 'network-only',
      }),
    ).pipe(
      map((result) => result.data?.expectedSessionClosingBalances ?? []),
      catchError((err) => {
        console.warn('[CashierSession] getExpectedClosingBalances failed', err);
        return of([]);
      }),
    );
  }

  /**
   * Clear error state
   */
  clearError() {
    this.error.set(null);
  }

  /**
   * Reset all state
   */
  reset() {
    this.currentSession.set(null);
    this.sessions.set([]);
    this.totalSessions.set(0);
    this.sessionSummary.set(null);
    this.lastClosedAt.set(null);
    this.isLoading.set(false);
    this.error.set(null);
  }
}

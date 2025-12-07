import { Injectable, inject, signal, computed } from '@angular/core';
import { ApolloService } from '../apollo.service';
import { map, catchError, of, from, tap } from 'rxjs';
import {
  GET_CURRENT_CASHIER_SESSION,
  GET_CASHIER_SESSION,
  GET_CASHIER_SESSIONS,
  OPEN_CASHIER_SESSION,
  CLOSE_CASHIER_SESSION,
  CREATE_CASHIER_SESSION_RECONCILIATION,
} from '../../graphql/operations.graphql';

export interface CashierSession {
  id: string;
  channelId: number;
  cashierUserId: number;
  openedAt: string;
  closedAt?: string | null;
  openingFloat: string;
  closingDeclared: string;
  status: 'open' | 'closed';
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

  readonly currentSession = signal<CashierSession | null>(null);
  readonly sessions = signal<CashierSession[]>([]);
  readonly totalSessions = signal(0);
  readonly sessionSummary = signal<CashierSessionSummary | null>(null);
  readonly isLoading = signal(false);
  readonly error = signal<string | null>(null);

  /** Computed: is there an active session? */
  readonly hasActiveSession = computed(() => this.currentSession() !== null);

  /** Computed: variance amount parsed as number (in cents) */
  readonly varianceAmount = computed(() => {
    const summary = this.sessionSummary();
    return summary ? parseInt(summary.variance, 10) : 0;
  });

  /** Computed: has variance (non-zero) */
  readonly hasVariance = computed(() => Math.abs(this.varianceAmount()) > 0);

  /**
   * Get current open session for a channel
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
        const session = result.data?.currentCashierSession ?? null;
        this.currentSession.set(session);
        this.isLoading.set(false);
        return session;
      }),
      catchError((err) => {
        this.error.set(err.message || 'Failed to get current session');
        this.isLoading.set(false);
        return of(null);
      }),
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
   * Open a new cashier session
   */
  openSession(channelId: number, openingFloat: number) {
    this.isLoading.set(true);
    this.error.set(null);

    const client = this.apolloService.getClient();
    const mutationPromise = client.mutate<{ openCashierSession: CashierSession }>({
      mutation: OPEN_CASHIER_SESSION as any,
      variables: {
        input: {
          channelId,
          openingFloat: openingFloat.toString(),
        },
      },
    });

    return from(mutationPromise).pipe(
      map((result) => {
        const session = result.data?.openCashierSession ?? null;
        if (session) {
          this.currentSession.set(session);
        }
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
   * Close a cashier session
   */
  closeSession(sessionId: string, closingDeclared: number, notes?: string) {
    this.isLoading.set(true);
    this.error.set(null);

    const client = this.apolloService.getClient();
    const mutationPromise = client.mutate<{ closeCashierSession: CashierSessionSummary }>({
      mutation: CLOSE_CASHIER_SESSION as any,
      variables: {
        input: {
          sessionId,
          closingDeclared: closingDeclared.toString(),
          notes,
        },
      },
    });

    return from(mutationPromise).pipe(
      map((result) => {
        const summary = result.data?.closeCashierSession ?? null;
        if (summary) {
          this.sessionSummary.set(summary);
          this.currentSession.set(null); // Session is now closed
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
    this.isLoading.set(false);
    this.error.set(null);
  }
}








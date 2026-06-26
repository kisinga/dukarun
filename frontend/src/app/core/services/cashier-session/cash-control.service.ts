import { Injectable, inject, signal, computed } from '@angular/core';
import { ApolloService } from '../apollo.service';
import { map, catchError, of, from } from 'rxjs';
import {
  GET_SESSION_CASH_COUNTS,
  GET_PENDING_VARIANCE_REVIEWS,
  GET_SESSION_MPESA_VERIFICATIONS,
  RECORD_CASH_COUNT,
  EXPLAIN_VARIANCE,
  REVIEW_CASH_COUNT,
  VERIFY_MPESA_TRANSACTIONS,
} from '../../graphql/operations.graphql';

export type CashCountType = 'opening' | 'interim' | 'closing';

export interface CashDrawerCount {
  id: string;
  channelId?: number;
  sessionId: string;
  countType: string; // wire scalar is String; CashCountType is the enum for the recordCashCount input
  takenAt: string;
  declaredCash: string;
  expectedCash?: string | null; // Hidden from cashiers
  variance?: string | null; // Hidden from cashiers
  varianceReason?: string | null;
  reviewedByUserId?: number | null;
  reviewedAt?: string | null;
  reviewNotes?: string | null;
  countedByUserId: number;
}

export interface CashCountResult {
  count: CashDrawerCount;
  hasVariance: boolean;
  varianceHidden: boolean;
}

export interface MpesaVerification {
  id: string;
  channelId?: number;
  sessionId: string;
  verifiedAt: string;
  transactionCount: number;
  allConfirmed: boolean;
  flaggedTransactionIds?: string[] | null;
  notes?: string | null;
  verifiedByUserId?: number;
}

/**
 * Cash Control Service
 *
 * Manages blind cash counts and M-Pesa verification during cashier sessions.
 * Implements the cash control flow where cashiers declare amounts without
 * seeing expected values to prevent theft.
 */
@Injectable({
  providedIn: 'root',
})
export class CashControlService {
  private readonly apolloService = inject(ApolloService);

  // State signals
  readonly cashCounts = signal<CashDrawerCount[]>([]);
  readonly pendingReviews = signal<CashDrawerCount[]>([]);
  readonly mpesaVerifications = signal<MpesaVerification[]>([]);
  readonly lastCountResult = signal<CashCountResult | null>(null);
  readonly isLoading = signal(false);
  readonly error = signal<string | null>(null);

  // Computed: last count had variance (needs explanation)
  readonly lastCountHadVariance = computed(() => this.lastCountResult()?.hasVariance ?? false);

  // Computed: pending count needing explanation
  readonly pendingVarianceExplanation = computed(() => {
    const result = this.lastCountResult();
    if (result?.hasVariance && !result.count.varianceReason) {
      return result.count.id;
    }
    return null;
  });

  // Computed: number of pending reviews for managers
  readonly pendingReviewCount = computed(() => this.pendingReviews().length);

  /**
   * Get all cash counts for a session
   */
  getSessionCashCounts(sessionId: string) {
    this.isLoading.set(true);
    this.error.set(null);

    const client = this.apolloService.getClient();
    const queryPromise = client.query({
      query: GET_SESSION_CASH_COUNTS,
      variables: { sessionId },
      fetchPolicy: 'network-only',
    });

    return from(queryPromise).pipe(
      map((result) => {
        const counts = result.data?.sessionCashCounts ?? [];
        this.cashCounts.set(counts);
        this.isLoading.set(false);
        return counts;
      }),
      catchError((err) => {
        this.error.set(err.message || 'Failed to load cash counts');
        this.isLoading.set(false);
        return of([]);
      }),
    );
  }

  /**
   * Get pending variance reviews (manager only)
   */
  getPendingVarianceReviews(channelId: number) {
    this.isLoading.set(true);
    this.error.set(null);

    const client = this.apolloService.getClient();
    const queryPromise = client.query({
      query: GET_PENDING_VARIANCE_REVIEWS,
      variables: { channelId },
      fetchPolicy: 'network-only',
    });

    return from(queryPromise).pipe(
      map((result) => {
        const reviews = result.data?.pendingVarianceReviews ?? [];
        this.pendingReviews.set(reviews);
        this.isLoading.set(false);
        return reviews;
      }),
      catchError((err) => {
        this.error.set(err.message || 'Failed to load pending reviews');
        this.isLoading.set(false);
        return of([]);
      }),
    );
  }

  /**
   * Get M-Pesa verifications for a session
   */
  getSessionMpesaVerifications(sessionId: string) {
    this.isLoading.set(true);
    this.error.set(null);

    const client = this.apolloService.getClient();
    const queryPromise = client.query({
      query: GET_SESSION_MPESA_VERIFICATIONS,
      variables: { sessionId },
      fetchPolicy: 'network-only',
    });

    return from(queryPromise).pipe(
      map((result) => {
        const verifications = result.data?.sessionMpesaVerifications ?? [];
        this.mpesaVerifications.set(verifications);
        this.isLoading.set(false);
        return verifications;
      }),
      catchError((err) => {
        this.error.set(err.message || 'Failed to load M-Pesa verifications');
        this.isLoading.set(false);
        return of([]);
      }),
    );
  }

  /**
   * Record a blind cash count
   * Cashier enters their count WITHOUT seeing expected amount
   */
  recordCashCount(sessionId: string, declaredCash: number, countType: CashCountType) {
    this.isLoading.set(true);
    this.error.set(null);

    const client = this.apolloService.getClient();
    const mutationPromise = client.mutate({
      mutation: RECORD_CASH_COUNT,
      variables: {
        input: {
          sessionId,
          declaredCash: declaredCash.toString(),
          countType,
        },
      },
    });

    return from(mutationPromise).pipe(
      map((result) => {
        const countResult = result.data?.recordCashCount ?? null;
        if (countResult) {
          this.lastCountResult.set(countResult);
          // Add to counts list
          this.cashCounts.update((counts) => [...counts, countResult.count]);
        }
        this.isLoading.set(false);
        return countResult;
      }),
      catchError((err) => {
        this.error.set(err.message || 'Failed to record cash count');
        this.isLoading.set(false);
        return of(null);
      }),
    );
  }

  /**
   * Explain a variance (after blind count shows there's a difference)
   */
  explainVariance(countId: string, reason: string) {
    this.isLoading.set(true);
    this.error.set(null);

    const client = this.apolloService.getClient();
    const mutationPromise = client.mutate({
      mutation: EXPLAIN_VARIANCE,
      variables: { countId, reason },
    });

    return from(mutationPromise).pipe(
      map((result) => {
        const updatedCount = result.data?.explainVariance ?? null;
        if (updatedCount) {
          // Update in counts list
          this.cashCounts.update((counts) =>
            counts.map((c) => (c.id === updatedCount.id ? { ...c, ...updatedCount } : c)),
          );
          // Update last result if it's the same count
          const lastResult = this.lastCountResult();
          if (lastResult && lastResult.count.id === updatedCount.id) {
            this.lastCountResult.set({
              ...lastResult,
              count: { ...lastResult.count, varianceReason: reason },
            });
          }
        }
        this.isLoading.set(false);
        return updatedCount;
      }),
      catchError((err) => {
        this.error.set(err.message || 'Failed to explain variance');
        this.isLoading.set(false);
        return of(null);
      }),
    );
  }

  /**
   * Review a cash count (manager only)
   */
  reviewCashCount(countId: string, notes?: string) {
    this.isLoading.set(true);
    this.error.set(null);

    const client = this.apolloService.getClient();
    const mutationPromise = client.mutate({
      mutation: REVIEW_CASH_COUNT,
      variables: { countId, notes },
    });

    return from(mutationPromise).pipe(
      map((result) => {
        const reviewedCount = result.data?.reviewCashCount ?? null;
        if (reviewedCount) {
          // Remove from pending reviews
          this.pendingReviews.update((reviews) => reviews.filter((r) => r.id !== reviewedCount.id));
        }
        this.isLoading.set(false);
        return reviewedCount;
      }),
      catchError((err) => {
        this.error.set(err.message || 'Failed to review cash count');
        this.isLoading.set(false);
        return of(null);
      }),
    );
  }

  /**
   * Verify M-Pesa transactions for a session
   */
  verifyMpesaTransactions(
    sessionId: string,
    allConfirmed: boolean,
    flaggedTransactionIds?: string[],
    notes?: string,
  ) {
    this.isLoading.set(true);
    this.error.set(null);

    const client = this.apolloService.getClient();
    const mutationPromise = client.mutate({
      mutation: VERIFY_MPESA_TRANSACTIONS,
      variables: {
        input: {
          sessionId,
          allConfirmed,
          flaggedTransactionIds,
          notes,
        },
      },
    });

    return from(mutationPromise).pipe(
      map((result) => {
        const verification = result.data?.verifyMpesaTransactions ?? null;
        if (verification) {
          this.mpesaVerifications.update((verifications) => [...verifications, verification]);
        }
        this.isLoading.set(false);
        return verification;
      }),
      catchError((err) => {
        this.error.set(err.message || 'Failed to verify M-Pesa transactions');
        this.isLoading.set(false);
        return of(null);
      }),
    );
  }

  /**
   * Clear last count result
   */
  clearLastCountResult() {
    this.lastCountResult.set(null);
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
    this.cashCounts.set([]);
    this.pendingReviews.set([]);
    this.mpesaVerifications.set([]);
    this.lastCountResult.set(null);
    this.isLoading.set(false);
    this.error.set(null);
  }
}

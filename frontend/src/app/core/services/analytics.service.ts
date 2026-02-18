import { inject, Injectable, signal } from '@angular/core';
import type {
  GetAnalyticsStatsQuery,
  GetAnalyticsStatsQueryVariables,
} from '../graphql/generated/graphql';
import { GET_ANALYTICS_STATS } from '../graphql/operations.graphql';
import { ApolloService } from './apollo.service';
import type { AnalyticsPeriod } from '../../dashboard/components/shared/charts';

export interface TimeSeriesPoint {
  date: string;
  value: number;
}

export interface ProductPerformance {
  productVariantId: string;
  productId: string;
  productName: string;
  variantName: string | null;
  totalQuantity: number;
  totalRevenue: number;
  totalCost: number | null;
  totalMargin: number | null;
  marginPercent: number | null;
  quantityChangePercent: number | null;
}

export type AnalyticsStats = GetAnalyticsStatsQuery['analyticsStats'];

export interface AnalyticsTimeRange {
  startDate: string;
  endDate: string;
  previousStartDate?: string;
  previousEndDate?: string;
}

/** Compute ISO date range for a given analytics period ending today */
export function periodToDateRange(period: AnalyticsPeriod): AnalyticsTimeRange {
  const end = new Date();
  const start = new Date(end);

  switch (period) {
    case '7d':
      start.setDate(start.getDate() - 7);
      break;
    case '30d':
      start.setDate(start.getDate() - 30);
      break;
    case '90d':
      start.setDate(start.getDate() - 90);
      break;
    case '1y':
      start.setFullYear(start.getFullYear() - 1);
      break;
  }

  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  const days = Math.round((end.getTime() - start.getTime()) / 86400000);

  const prevEnd = new Date(start);
  prevEnd.setDate(prevEnd.getDate() - 1);
  const prevStart = new Date(prevEnd);
  prevStart.setDate(prevStart.getDate() - days);

  return {
    startDate: fmt(start),
    endDate: fmt(end),
    previousStartDate: fmt(prevStart),
    previousEndDate: fmt(prevEnd),
  };
}

@Injectable({ providedIn: 'root' })
export class AnalyticsService {
  private readonly apolloService = inject(ApolloService);

  private readonly statsSignal = signal<AnalyticsStats | null>(null);
  private readonly isLoadingSignal = signal(false);
  private readonly errorSignal = signal<string | null>(null);

  readonly stats = this.statsSignal.asReadonly();
  readonly isLoading = this.isLoadingSignal.asReadonly();
  readonly error = this.errorSignal.asReadonly();

  async fetch(period: AnalyticsPeriod, limit = 10): Promise<void> {
    this.isLoadingSignal.set(true);
    this.errorSignal.set(null);

    try {
      const client = this.apolloService.getClient();
      const result = await client.query<GetAnalyticsStatsQuery, GetAnalyticsStatsQueryVariables>({
        query: GET_ANALYTICS_STATS,
        variables: { timeRange: periodToDateRange(period), limit },
        fetchPolicy: 'network-only',
      });
      this.statsSignal.set(result.data?.analyticsStats ?? null);
    } catch (err: any) {
      console.error('Failed to fetch analytics:', err);
      this.errorSignal.set(err?.message ?? 'Failed to load analytics');
    } finally {
      this.isLoadingSignal.set(false);
    }
  }
}

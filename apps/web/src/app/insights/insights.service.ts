import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../core/supabase.service';
import { CatalogIdentityLookupService } from '../core/identity-lookup.services';
import { productIdentity, productIdentityLabel } from '../core/product-identity';
import {
  EMPTY_PRODUCT_PERFORMANCE,
  type ProductPerformanceMetricResponse,
  type ProductPerformanceMetricRow,
  type ProductPerformanceResponse,
  type ProductPerformanceRow,
} from '../core/product-performance.models';
import type {
  CreditAdvisoryReview,
  CreditDecisionCard,
  DateRangePreset,
  InsightSignal,
  PartyCreditProfile,
  ProductDemandSummary,
  ProductDemandMetric,
  ProductDecisionFilter,
  ProductDecisionCounts,
  ProductIntelligenceSummary,
  ProductProfile,
} from './insights.models';

@Injectable({ providedIn: 'root' })
export class InsightsService {
  private readonly supabase = inject(SupabaseService);
  private readonly catalogIdentities = inject(CatalogIdentityLookupService);

  private get db() {
    return this.supabase.client;
  }

  async attention(
    domain: 'all' | 'credit' | 'products',
    locationId: string | null,
    cursor = 0,
    limit = 30
  ): Promise<{ items: InsightSignal[]; nextCursor: number | null; generatedAt: string }> {
    const { data, error } = await this.db.rpc('insight_attention_feed', {
      p_domain: domain,
      p_limit: limit,
      p_cursor: cursor,
      ...(locationId ? { p_location_id: locationId } : {}),
    });
    if (error) throw error;
    const payload = data as unknown as {
      items?: Array<Partial<InsightSignal> & Pick<InsightSignal, 'domain' | 'entity_id'>>;
      nextCursor?: number | null;
      generatedAt?: string;
    } | null;
    const rawItems = payload?.items ?? [];
    const productIds = rawItems
      .filter(item => item.domain === 'products')
      .map(item => item.entity_id);
    const identities = await this.catalogIdentities.resolve(productIds, { coverage: 'active' });
    const items = rawItems.map(raw => {
      const item = raw as InsightSignal;
      if (raw.domain !== 'products') return item;
      const identity = productIdentity(identities.items.get(raw.entity_id));
      return {
        ...item,
        title: productIdentityLabel(identity),
        href: `/insights/inventory/${raw.entity_id}`,
        product_id: identity.product_id || null,
        manufacturer_name: identity.manufacturer_name,
        identity_resolution: identity.identity_resolution,
      };
    });
    return {
      items,
      nextCursor: payload?.nextCursor ?? null,
      generatedAt: payload?.generatedAt ?? new Date().toISOString(),
    };
  }

  async creditProfiles(filters: {
    side: 'customer' | 'supplier';
    band?: string | null;
    confidence?: string | null;
    overdueOnly?: boolean;
    recommendation?: string | null;
    search?: string | null;
    limit?: number;
    cursor?: string | null;
  }): Promise<{ items: PartyCreditProfile[]; nextCursor: string | null }> {
    const { data, error } = await this.db.rpc('list_party_credit_profiles', {
      p_side: filters.side,
      p_overdue_only: filters.overdueOnly ?? false,
      p_limit: filters.limit ?? 50,
      ...(filters.band ? { p_band: filters.band } : {}),
      ...(filters.confidence ? { p_confidence: filters.confidence } : {}),
      ...(filters.recommendation ? { p_recommendation: filters.recommendation } : {}),
      ...(filters.search ? { p_search: filters.search } : {}),
      ...(filters.cursor ? { p_cursor: filters.cursor } : {}),
    });
    if (error) throw error;
    const payload = data as unknown as {
      items?: PartyCreditProfile[];
      nextCursor?: string | null;
    } | null;
    return { items: payload?.items ?? [], nextCursor: payload?.nextCursor ?? null };
  }

  async creditProfile(
    partyId: string,
    side: 'customer' | 'supplier',
    before: string | null = null
  ): Promise<PartyCreditProfile | null> {
    const { data, error } = await this.db.rpc('party_credit_profile', {
      p_party_id: partyId,
      p_side: side,
      p_document_limit: 25,
      ...(before ? { p_before: before } : {}),
    });
    if (error) throw error;
    return (data as unknown as PartyCreditProfile | null) ?? null;
  }

  async decisionSummary(customerId: string): Promise<CreditDecisionCard> {
    const { data, error } = await this.db.rpc('credit_decision_summary', {
      p_customer_id: customerId,
    });
    if (error) throw error;
    return data as unknown as CreditDecisionCard;
  }

  async recordCreditAdvisory(orderId: string, acknowledgementReason?: string): Promise<void> {
    const { error } = await this.db.rpc('record_credit_advisory_snapshot', {
      p_order_id: orderId,
      ...(acknowledgementReason ? { p_acknowledgement_reason: acknowledgementReason } : {}),
    });
    if (error) throw error;
  }

  async advisoryReview(orderId: string, customerId: string): Promise<CreditAdvisoryReview> {
    const [snapshotResult, current] = await Promise.all([
      this.db
        .from('sale_credit_advisory_snapshots')
        .select(
          'customer_id, score, band, confidence, reason_codes, recommendation_code, score_refreshed_at'
        )
        .eq('order_id', orderId)
        .maybeSingle(),
      this.decisionSummary(customerId),
    ]);
    if (snapshotResult.error) throw snapshotResult.error;
    const snapshot = snapshotResult.data;
    return {
      requested: snapshot
        ? {
            customerId: snapshot.customer_id,
            score: snapshot.score,
            band: snapshot.band as CreditDecisionCard['band'],
            confidence: snapshot.confidence as CreditDecisionCard['confidence'],
            reasonCodes: snapshot.reason_codes,
            recommendationCode: snapshot.recommendation_code,
            scoreTimestamp: snapshot.score_refreshed_at,
          }
        : null,
      current,
    };
  }

  async setCustomerScoreNotifications(customerId: string, enabled: boolean): Promise<void> {
    const { error } = await this.db.rpc('update_customer_credit_score_notifications', {
      p_customer_id: customerId,
      p_enabled: enabled,
    });
    if (error) throw error;
  }

  async updateCreditSettings(
    opportunityRateBps: number,
    notificationsEnabled: boolean
  ): Promise<void> {
    const { error } = await this.db.rpc('update_credit_insight_settings', {
      p_opportunity_rate_bps: opportunityRateBps,
      p_notifications_enabled: notificationsEnabled,
    });
    if (error) throw error;
  }

  async updateInventorySettings(settings: {
    lowStockThreshold: number;
    batchExpiryEnabled: boolean;
    defaultLeadDays: number;
    defaultSafetyDays: number;
  }): Promise<void> {
    const { error } = await this.db.rpc('update_inventory_settings', {
      p_low_stock_threshold: settings.lowStockThreshold,
      p_batch_expiry_enabled: settings.batchExpiryEnabled,
      p_default_lead_days: settings.defaultLeadDays,
      p_default_safety_days: settings.defaultSafetyDays,
    });
    if (error) throw error;
  }

  async updateVariantReorderSettings(
    variantId: string,
    leadDays: number | null,
    safetyDays: number | null
  ): Promise<void> {
    const { error } = await this.db.rpc('update_variant_reorder_settings', {
      p_variant_id: variantId,
      // Null means inherit the company default; generated RPC argument types do not retain
      // SQL argument nullability.
      p_lead_days: leadDays as number,
      p_safety_days: safetyDays as number,
    });
    if (error) throw error;
  }

  async products(filters: {
    windowDays: DateRangePreset;
    since?: string;
    until?: string;
    locationId: string;
    supplierId?: string | null;
    manufacturerId?: string | null;
    search?: string | null;
    decision?: ProductDecisionFilter | null;
    variantId?: string | null;
    limit?: number;
    offset?: number;
  }): Promise<{
    items: ProductDemandSummary[];
    nextOffset: number | null;
    financialsIncluded: boolean;
    summary: ProductIntelligenceSummary;
    decisionCounts: ProductDecisionCounts;
  }> {
    const { data, error } = await this.db.rpc('product_intelligence', {
      p_window_days: filters.windowDays,
      ...(filters.since ? { p_since: filters.since } : {}),
      ...(filters.until ? { p_until: filters.until } : {}),
      p_location_id: filters.locationId,
      p_limit: filters.limit ?? 50,
      p_offset: filters.offset ?? 0,
      ...(filters.supplierId ? { p_supplier_id: filters.supplierId } : {}),
      ...(filters.manufacturerId ? { p_manufacturer_id: filters.manufacturerId } : {}),
      ...(filters.search ? { p_search: filters.search } : {}),
      ...(filters.variantId ? { p_variant_id: filters.variantId } : {}),
      ...(filters.decision ? { p_decision: filters.decision } : {}),
    });
    if (error) throw error;
    const payload = data as unknown as {
      items?: ProductDemandMetric[];
      nextOffset?: number | null;
      financialsIncluded?: boolean;
      summary?: Partial<ProductIntelligenceSummary>;
      decisionCounts?: ProductDecisionCounts;
    } | null;
    const rows = payload?.items ?? [];
    const identities = await this.catalogIdentities.resolve(
      rows.map(row => row.variant_id),
      { coverage: 'active' }
    );
    return {
      items: rows.map(row => ({
        ...row,
        ...productIdentity(identities.items.get(row.variant_id)),
      })),
      nextOffset: payload?.nextOffset ?? null,
      financialsIncluded: Boolean(payload?.financialsIncluded),
      decisionCounts: payload?.decisionCounts ?? { all: 0, needsAttention: 0, stockouts: 0 },
      summary: {
        trackedVariants: Number(payload?.summary?.trackedVariants ?? 0),
        needsAttention: Number(payload?.summary?.needsAttention ?? 0),
        stockouts: Number(payload?.summary?.stockouts ?? 0),
        unitsSold: Number(payload?.summary?.unitsSold ?? 0),
        stockOnHand: Number(payload?.summary?.stockOnHand ?? 0),
        stockValue:
          payload?.summary?.stockValue === null || payload?.summary?.stockValue === undefined
            ? null
            : Number(payload.summary.stockValue),
        netRevenue:
          payload?.summary?.netRevenue === null || payload?.summary?.netRevenue === undefined
            ? null
            : Number(payload.summary.netRevenue),
        margin:
          payload?.summary?.margin === null || payload?.summary?.margin === undefined
            ? null
            : Number(payload.summary.margin),
      },
    };
  }

  async productPerformance(
    windowDays: DateRangePreset,
    locationId: string | null,
    limit = 10
  ): Promise<ProductPerformanceResponse> {
    const { data, error } = await this.db.rpc('product_performance', {
      p_window_days: windowDays,
      p_limit: limit,
      ...(locationId ? { p_location_id: locationId } : {}),
    });
    if (error) throw error;
    const payload = data as unknown as Partial<ProductPerformanceMetricResponse> | null;
    const leaders = payload?.leaders ?? EMPTY_PRODUCT_PERFORMANCE.leaders;
    const identities = await this.catalogIdentities.resolve(
      Object.values(leaders).flatMap(rows => rows.map(row => row.variant_id)),
      { coverage: 'active' }
    );
    const normalize = (row: ProductPerformanceMetricRow): ProductPerformanceRow => ({
      ...row,
      ...productIdentity(identities.items.get(row.variant_id)),
      confidence: row.confidence ?? row.demandConfidence ?? 'low',
      current_quantity: Number(row.current_quantity ?? 0),
      robust_quantity: Number(row.robust_quantity ?? 0),
      previous_robust_quantity: Number(row.previous_robust_quantity ?? 0),
      revenue: row.revenue === null || row.revenue === undefined ? null : Number(row.revenue),
      margin: row.margin === null || row.margin === undefined ? null : Number(row.margin),
      order_count: Number(row.order_count ?? 0),
      active_days: Number(row.active_days ?? 0),
      trend_score: Number(row.trend_score ?? 0),
      outlier_share: Number(row.outlier_share ?? 0),
      stock: Number(row.stock ?? 0),
      planning_daily_demand: Number(row.planning_daily_demand ?? 0),
      days_of_cover:
        row.days_of_cover === null || row.days_of_cover === undefined
          ? null
          : Number(row.days_of_cover),
    });
    return {
      ...EMPTY_PRODUCT_PERFORMANCE,
      ...payload,
      windowDays: Number(payload?.windowDays ?? windowDays),
      generatedAt: payload?.generatedAt ?? '',
      leaders: {
        trending: (leaders.trending ?? []).map(normalize),
        volume: (leaders.volume ?? []).map(normalize),
        margin: (leaders.margin ?? []).map(normalize),
        consistent: (leaders.consistent ?? []).map(normalize),
      },
      financialsIncluded: Boolean(payload?.financialsIncluded),
    };
  }

  async productProfile(
    variantId: string,
    locationId: string,
    since: string | null = null,
    until: string | null = null
  ): Promise<ProductProfile | null> {
    const { data, error } = await this.db.rpc('product_profile', {
      p_variant_id: variantId,
      p_location_id: locationId,
      ...(since ? { p_since: since } : {}),
      ...(until ? { p_until: until } : {}),
    });
    if (error) throw error;
    return (data as unknown as ProductProfile | null) ?? null;
  }
}

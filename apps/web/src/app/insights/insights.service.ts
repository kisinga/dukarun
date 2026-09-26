import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../core/supabase.service';
import type {
  CreditAdvisoryReview,
  CreditDecisionCard,
  DateRangePreset,
  InsightSignal,
  PartyCreditProfile,
  ProductDemandSummary,
  ProductIntelligenceSummary,
  ProductProfile,
} from './insights.models';

@Injectable({ providedIn: 'root' })
export class InsightsService {
  private readonly supabase = inject(SupabaseService);

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
      items?: InsightSignal[];
      nextCursor?: number | null;
      generatedAt?: string;
    } | null;
    return {
      items: (payload?.items ?? []).map(item => ({
        ...item,
        href: item.href.replace('/insights/products/', '/insights/inventory/'),
      })),
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
    limit?: number;
    offset?: number;
  }): Promise<{
    items: ProductDemandSummary[];
    nextOffset: number | null;
    financialsIncluded: boolean;
    summary: ProductIntelligenceSummary;
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
    });
    if (error) throw error;
    const payload = data as unknown as {
      items?: ProductDemandSummary[];
      nextOffset?: number | null;
      financialsIncluded?: boolean;
      summary?: Partial<ProductIntelligenceSummary>;
    } | null;
    return {
      items: payload?.items ?? [],
      nextOffset: payload?.nextOffset ?? null,
      financialsIncluded: Boolean(payload?.financialsIncluded),
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

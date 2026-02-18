import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';

export interface ProductPerformanceRow {
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

export interface TimeSeriesRow {
  date: string;
  value: number;
}

export interface AnalyticsQueryParams {
  channelId: number;
  startDate: string; // YYYY-MM-DD
  endDate: string;
  previousStartDate?: string;
  previousEndDate?: string;
  limit?: number;
}

@Injectable()
export class AnalyticsQueryService {
  private readonly logger = new Logger(AnalyticsQueryService.name);

  constructor(private readonly dataSource: DataSource) {}

  async getTopSelling(params: AnalyticsQueryParams): Promise<ProductPerformanceRow[]> {
    const { channelId, startDate, endDate, limit = 10 } = params;
    const rows = await this.dataSource.query(
      `SELECT
        s.product_variant_id  AS "productVariantId",
        s.product_id          AS "productId",
        COALESCE(p.name, '')  AS "productName",
        COALESCE(pvt.name, '') AS "variantName",
        SUM(s.total_quantity) AS "totalQuantity",
        SUM(s.total_revenue)  AS "totalRevenue",
        SUM(s.total_cost)     AS "totalCost",
        SUM(s.total_margin)   AS "totalMargin"
      FROM mv_daily_product_sales s
      JOIN product_variant pv ON pv.id = s.product_variant_id
      LEFT JOIN product_variant_translation pvt ON pvt."baseId" = pv.id AND pvt."languageCode" = 'en'
      JOIN product_translation p ON p."baseId" = s.product_id AND p."languageCode" = 'en'
      WHERE s.channel_id = $1
        AND s.sale_date BETWEEN $2 AND $3
      GROUP BY s.product_variant_id, s.product_id, p.name, pvt.name
      ORDER BY "totalQuantity" DESC
      LIMIT $4`,
      [channelId, startDate, endDate, limit]
    );
    return rows.map(this.computeMarginPercent);
  }

  async getHighestRevenue(params: AnalyticsQueryParams): Promise<ProductPerformanceRow[]> {
    const { channelId, startDate, endDate, limit = 10 } = params;
    const rows = await this.dataSource.query(
      `SELECT
        s.product_variant_id  AS "productVariantId",
        s.product_id          AS "productId",
        COALESCE(p.name, '')  AS "productName",
        COALESCE(pvt.name, '') AS "variantName",
        SUM(s.total_quantity) AS "totalQuantity",
        SUM(s.total_revenue)  AS "totalRevenue",
        SUM(s.total_cost)     AS "totalCost",
        SUM(s.total_margin)   AS "totalMargin"
      FROM mv_daily_product_sales s
      JOIN product_variant pv ON pv.id = s.product_variant_id
      LEFT JOIN product_variant_translation pvt ON pvt."baseId" = pv.id AND pvt."languageCode" = 'en'
      JOIN product_translation p ON p."baseId" = s.product_id AND p."languageCode" = 'en'
      WHERE s.channel_id = $1
        AND s.sale_date BETWEEN $2 AND $3
      GROUP BY s.product_variant_id, s.product_id, p.name, pvt.name
      ORDER BY "totalRevenue" DESC
      LIMIT $4`,
      [channelId, startDate, endDate, limit]
    );
    return rows.map(this.computeMarginPercent);
  }

  async getHighestMargin(params: AnalyticsQueryParams): Promise<ProductPerformanceRow[]> {
    const { channelId, startDate, endDate, limit = 10 } = params;
    const rows = await this.dataSource.query(
      `SELECT
        s.product_variant_id  AS "productVariantId",
        s.product_id          AS "productId",
        COALESCE(p.name, '')  AS "productName",
        COALESCE(pvt.name, '') AS "variantName",
        SUM(s.total_quantity) AS "totalQuantity",
        SUM(s.total_revenue)  AS "totalRevenue",
        SUM(s.total_cost)     AS "totalCost",
        SUM(s.total_margin)   AS "totalMargin"
      FROM mv_daily_product_sales s
      JOIN product_variant pv ON pv.id = s.product_variant_id
      LEFT JOIN product_variant_translation pvt ON pvt."baseId" = pv.id AND pvt."languageCode" = 'en'
      JOIN product_translation p ON p."baseId" = s.product_id AND p."languageCode" = 'en'
      WHERE s.channel_id = $1
        AND s.sale_date BETWEEN $2 AND $3
        AND s.total_revenue > 0
      GROUP BY s.product_variant_id, s.product_id, p.name, pvt.name
      HAVING SUM(s.total_revenue) > 0
      ORDER BY (SUM(s.total_margin)::float / NULLIF(SUM(s.total_revenue), 0)) DESC
      LIMIT $4`,
      [channelId, startDate, endDate, limit]
    );
    return rows.map(this.computeMarginPercent);
  }

  async getTrending(params: AnalyticsQueryParams): Promise<ProductPerformanceRow[]> {
    const {
      channelId,
      startDate,
      endDate,
      previousStartDate,
      previousEndDate,
      limit = 10,
    } = params;

    // Default previous period = same length window immediately before startDate
    const start = new Date(startDate);
    const end = new Date(endDate);
    const daysDiff = Math.round((end.getTime() - start.getTime()) / 86400000);
    const prevEnd = new Date(start);
    prevEnd.setDate(prevEnd.getDate() - 1);
    const prevStart = new Date(prevEnd);
    prevStart.setDate(prevStart.getDate() - daysDiff);

    const pStart = previousStartDate ?? prevStart.toISOString().slice(0, 10);
    const pEnd = previousEndDate ?? prevEnd.toISOString().slice(0, 10);

    const rows = await this.dataSource.query(
      `WITH current_period AS (
        SELECT product_variant_id, product_id, SUM(total_quantity) AS qty
        FROM mv_daily_product_sales
        WHERE channel_id = $1 AND sale_date BETWEEN $2 AND $3
        GROUP BY product_variant_id, product_id
      ),
      previous_period AS (
        SELECT product_variant_id, SUM(total_quantity) AS qty
        FROM mv_daily_product_sales
        WHERE channel_id = $1 AND sale_date BETWEEN $4 AND $5
        GROUP BY product_variant_id
      )
      SELECT
        c.product_variant_id  AS "productVariantId",
        c.product_id          AS "productId",
        COALESCE(p.name, '')  AS "productName",
        COALESCE(pvt.name, '') AS "variantName",
        c.qty                 AS "totalQuantity",
        0                     AS "totalRevenue",
        NULL                  AS "totalCost",
        NULL                  AS "totalMargin",
        CASE WHEN COALESCE(prev.qty, 0) = 0 THEN NULL
             ELSE ROUND(((c.qty - prev.qty)::float / prev.qty * 100)::numeric, 2)
        END                   AS "quantityChangePercent"
      FROM current_period c
      JOIN product_variant pv ON pv.id = c.product_variant_id
      LEFT JOIN product_variant_translation pvt ON pvt."baseId" = pv.id AND pvt."languageCode" = 'en'
      JOIN product_translation p ON p."baseId" = c.product_id AND p."languageCode" = 'en'
      LEFT JOIN previous_period prev ON prev.product_variant_id = c.product_variant_id
      WHERE COALESCE(prev.qty, 0) > 0
      ORDER BY "quantityChangePercent" DESC
      LIMIT $6`,
      [channelId, startDate, endDate, pStart, pEnd, limit]
    );
    return rows.map((r: any) => ({ ...r, marginPercent: null }));
  }

  async getSalesTrend(params: AnalyticsQueryParams): Promise<TimeSeriesRow[]> {
    const { channelId, startDate, endDate } = params;
    return this.dataSource.query(
      `SELECT order_date::text AS date, COALESCE(SUM(total_revenue), 0) AS value
      FROM mv_daily_order_stats
      WHERE channel_id = $1 AND order_date BETWEEN $2 AND $3
      GROUP BY order_date ORDER BY order_date`,
      [channelId, startDate, endDate]
    );
  }

  async getOrderVolumeTrend(params: AnalyticsQueryParams): Promise<TimeSeriesRow[]> {
    const { channelId, startDate, endDate } = params;
    return this.dataSource.query(
      `SELECT order_date::text AS date, COALESCE(SUM(order_count), 0) AS value
      FROM mv_daily_order_stats
      WHERE channel_id = $1 AND order_date BETWEEN $2 AND $3
      GROUP BY order_date ORDER BY order_date`,
      [channelId, startDate, endDate]
    );
  }

  async getCustomerGrowthTrend(params: AnalyticsQueryParams): Promise<TimeSeriesRow[]> {
    const { channelId, startDate, endDate } = params;
    return this.dataSource.query(
      `SELECT signup_date::text AS date, COALESCE(SUM(new_signups), 0) AS value
      FROM mv_daily_customer_stats
      WHERE channel_id = $1 AND signup_date BETWEEN $2 AND $3
      GROUP BY signup_date ORDER BY signup_date`,
      [channelId, startDate, endDate]
    );
  }

  async getAverageProfitMargin(params: AnalyticsQueryParams): Promise<number> {
    const { channelId, startDate, endDate } = params;
    const rows = await this.dataSource.query(
      `SELECT
        CASE WHEN SUM(total_revenue) = 0 THEN 0
             ELSE ROUND((SUM(total_margin)::float / SUM(total_revenue) * 100)::numeric, 2)
        END AS margin
      FROM mv_daily_product_sales
      WHERE channel_id = $1 AND sale_date BETWEEN $2 AND $3`,
      [channelId, startDate, endDate]
    );
    return Number(rows[0]?.margin ?? 0);
  }

  async getTotalRevenue(params: AnalyticsQueryParams): Promise<number> {
    const { channelId, startDate, endDate } = params;
    const rows = await this.dataSource.query(
      `SELECT COALESCE(SUM(total_revenue), 0) AS revenue
      FROM mv_daily_order_stats
      WHERE channel_id = $1 AND order_date BETWEEN $2 AND $3`,
      [channelId, startDate, endDate]
    );
    return Number(rows[0]?.revenue ?? 0);
  }

  async getTotalOrders(params: AnalyticsQueryParams): Promise<number> {
    const { channelId, startDate, endDate } = params;
    const rows = await this.dataSource.query(
      `SELECT COALESCE(SUM(order_count), 0) AS orders
      FROM mv_daily_order_stats
      WHERE channel_id = $1 AND order_date BETWEEN $2 AND $3`,
      [channelId, startDate, endDate]
    );
    return Number(rows[0]?.orders ?? 0);
  }

  async refreshAll(): Promise<void> {
    const views = ['mv_daily_product_sales', 'mv_daily_order_stats', 'mv_daily_customer_stats'];
    for (const view of views) {
      try {
        await this.dataSource.query(`REFRESH MATERIALIZED VIEW CONCURRENTLY ${view}`);
        this.logger.debug(`Refreshed ${view} (concurrently)`);
      } catch {
        // CONCURRENTLY requires a unique index and no active transactions — fall back
        await this.dataSource.query(`REFRESH MATERIALIZED VIEW ${view}`);
        this.logger.debug(`Refreshed ${view} (standard fallback)`);
      }
    }
  }

  private computeMarginPercent(row: any): ProductPerformanceRow {
    const revenue = Number(row.totalRevenue ?? 0);
    const margin = Number(row.totalMargin ?? 0);
    return {
      ...row,
      totalQuantity: Number(row.totalQuantity),
      totalRevenue: revenue,
      totalCost: row.totalCost != null ? Number(row.totalCost) : null,
      totalMargin: row.totalMargin != null ? margin : null,
      marginPercent: revenue > 0 ? Math.round((margin / revenue) * 10000) / 100 : null,
      quantityChangePercent:
        row.quantityChangePercent != null ? Number(row.quantityChangePercent) : null,
    };
  }
}

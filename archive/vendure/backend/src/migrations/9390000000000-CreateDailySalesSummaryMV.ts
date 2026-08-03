import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Creates mv_daily_sales_summary: per-channel, per-day COGS-derived aggregates
 * (total_revenue, total_cogs, total_margin) for dashboard KPIs.
 * Aggregates from mv_daily_product_sales (same COGS logic: sale_cogs when available, else wholesale).
 * order_count for a period is obtained from mv_daily_order_stats in the resolver.
 */
export class CreateDailySalesSummaryMV9390000000000 implements MigrationInterface {
  name = 'CreateDailySalesSummaryMV9390000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE MATERIALIZED VIEW mv_daily_sales_summary AS
      SELECT
        channel_id,
        sale_date,
        SUM(total_revenue)::bigint AS total_revenue,
        SUM(total_cost)::bigint AS total_cogs,
        SUM(total_margin)::bigint AS total_margin
      FROM mv_daily_product_sales
      GROUP BY channel_id, sale_date
      WITH DATA
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_dss_uniq
        ON mv_daily_sales_summary (channel_id, sale_date);
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_mv_dss_channel_date
        ON mv_daily_sales_summary (channel_id, sale_date);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP MATERIALIZED VIEW IF EXISTS mv_daily_sales_summary CASCADE`);
  }
}

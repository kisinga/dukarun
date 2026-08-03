import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Recreates mv_daily_product_sales to use sale_cogs for total_cost when available (FIFO COGS),
 * falling back to wholesale price for orders not yet in sale_cogs.
 */
export class UpdateAnalyticsMVWithSaleCogs9330000000000 implements MigrationInterface {
  name = 'UpdateAnalyticsMVWithSaleCogs9330000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP MATERIALIZED VIEW IF EXISTS mv_daily_product_sales CASCADE`);

    await queryRunner.query(`
      CREATE MATERIALIZED VIEW mv_daily_product_sales AS
      SELECT
        ola.channel_id,
        ola.sale_date,
        ola.product_variant_id,
        ola.product_id,
        ola.order_count,
        ola.total_quantity,
        ola.total_revenue,
        (COALESCE(sc.total_cogs_cents, ola.wholesale_cost_cents))::bigint AS total_cost,
        (ola.total_revenue - COALESCE(sc.total_cogs_cents, ola.wholesale_cost_cents))::bigint AS total_margin
      FROM (
        SELECT
          occ."channelId"                   AS channel_id,
          DATE(o."orderPlacedAt")           AS sale_date,
          ol."productVariantId"             AS product_variant_id,
          pv."productId"                    AS product_id,
          COUNT(DISTINCT o.id)              AS order_count,
          SUM(ol.quantity)                  AS total_quantity,
          SUM(ol."listPrice" * ol.quantity) AS total_revenue,
          SUM(ol.quantity * COALESCE(pv."customFieldsWholesaleprice", 0)) AS wholesale_cost_cents
        FROM "order" o
        JOIN order_channels_channel occ ON occ."orderId" = o.id
        JOIN order_line ol ON ol."orderId" = o.id
        JOIN product_variant pv ON pv.id = ol."productVariantId"
        WHERE o.state IN ('PaymentSettled','Fulfilled','Shipped','Delivered')
          AND o."orderPlacedAt" IS NOT NULL
        GROUP BY 1, 2, 3, 4
      ) ola
      LEFT JOIN (
        SELECT
          "channelId"     AS channel_id,
          "saleDate"      AS sale_date,
          "productVariantId" AS product_variant_id,
          SUM("cogsCents")    AS total_cogs_cents
        FROM sale_cogs
        GROUP BY 1, 2, 3
      ) sc ON sc.channel_id = ola.channel_id
          AND sc.sale_date = ola.sale_date
          AND sc.product_variant_id = ola.product_variant_id
      WITH DATA
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_dps_uniq
        ON mv_daily_product_sales (channel_id, sale_date, product_variant_id);
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_mv_dps_channel_date
        ON mv_daily_product_sales (channel_id, sale_date);
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_mv_dps_channel_product
        ON mv_daily_product_sales (channel_id, product_id);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP MATERIALIZED VIEW IF EXISTS mv_daily_product_sales CASCADE`);

    await queryRunner.query(`
      CREATE MATERIALIZED VIEW mv_daily_product_sales AS
      SELECT
        occ."channelId"                   AS channel_id,
        DATE(o."orderPlacedAt")           AS sale_date,
        ol."productVariantId"             AS product_variant_id,
        pv."productId"                    AS product_id,
        COUNT(DISTINCT o.id)              AS order_count,
        SUM(ol.quantity)                  AS total_quantity,
        SUM(ol."listPrice" * ol.quantity) AS total_revenue,
        SUM(ol.quantity * COALESCE(pv."customFieldsWholesaleprice", 0)) AS total_cost,
        SUM(ol."listPrice" * ol.quantity - ol.quantity * COALESCE(pv."customFieldsWholesaleprice", 0)) AS total_margin
      FROM "order" o
      JOIN order_channels_channel occ ON occ."orderId" = o.id
      JOIN order_line ol ON ol."orderId" = o.id
      JOIN product_variant pv ON pv.id = ol."productVariantId"
      WHERE o.state IN ('PaymentSettled','Fulfilled','Shipped','Delivered')
        AND o."orderPlacedAt" IS NOT NULL
      GROUP BY 1, 2, 3, 4
      WITH DATA;
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_dps_uniq
        ON mv_daily_product_sales (channel_id, sale_date, product_variant_id);
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_mv_dps_channel_date
        ON mv_daily_product_sales (channel_id, sale_date);
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_mv_dps_channel_product
        ON mv_daily_product_sales (channel_id, product_id);
    `);
  }
}

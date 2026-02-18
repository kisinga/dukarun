import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Creates materialized views for analytics at daily grain.
 *
 * Vendure orders are linked to channels via the join table `order_channels_channel`
 * (there is no direct channelId column on the order table).
 *
 * Three views, all channel-scoped:
 * - mv_daily_product_sales: per product-variant per day
 * - mv_daily_order_stats: per channel per day
 * - mv_daily_customer_stats: signups per channel per day
 *
 * Each has a UNIQUE index to support REFRESH CONCURRENTLY.
 */
export class CreateAnalyticsMaterializedViews9300000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Daily product sales
    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_matviews WHERE matviewname = 'mv_daily_product_sales'
        ) THEN
          CREATE MATERIALIZED VIEW mv_daily_product_sales AS
          SELECT
            occ."channelId"                   AS channel_id,
            DATE(o."orderPlacedAt")           AS sale_date,
            ol."productVariantId"             AS product_variant_id,
            pv."productId"                    AS product_id,
            COUNT(DISTINCT o.id)              AS order_count,
            SUM(ol.quantity)                  AS total_quantity,
            SUM(ol."linePriceWithTax")        AS total_revenue,
            SUM(ol.quantity * COALESCE(pv."customFieldsWholesaleprice", 0)) AS total_cost,
            SUM(ol."linePriceWithTax" - ol.quantity * COALESCE(pv."customFieldsWholesaleprice", 0)) AS total_margin
          FROM "order" o
          JOIN order_channels_channel occ ON occ."orderId" = o.id
          JOIN order_line ol ON ol."orderId" = o.id
          JOIN product_variant pv ON pv.id = ol."productVariantId"
          WHERE o.state IN ('PaymentSettled','Fulfilled','Shipped','Delivered')
            AND o."orderPlacedAt" IS NOT NULL
          GROUP BY 1, 2, 3, 4
          WITH DATA;
        END IF;
      END $$;
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

    // 2. Daily order stats
    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_matviews WHERE matviewname = 'mv_daily_order_stats'
        ) THEN
          CREATE MATERIALIZED VIEW mv_daily_order_stats AS
          SELECT
            occ."channelId"                 AS channel_id,
            DATE(o."orderPlacedAt")         AS order_date,
            COUNT(*)                        AS order_count,
            SUM(o."totalWithTax")           AS total_revenue,
            AVG(o."totalWithTax")           AS avg_order_value,
            COUNT(DISTINCT o."customerId")  AS unique_customers
          FROM "order" o
          JOIN order_channels_channel occ ON occ."orderId" = o.id
          WHERE o.state IN ('PaymentSettled','Fulfilled','Shipped','Delivered')
            AND o."orderPlacedAt" IS NOT NULL
          GROUP BY 1, 2
          WITH DATA;
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_dos_uniq
        ON mv_daily_order_stats (channel_id, order_date);
    `);

    // 3. Daily customer stats
    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_matviews WHERE matviewname = 'mv_daily_customer_stats'
        ) THEN
          CREATE MATERIALIZED VIEW mv_daily_customer_stats AS
          SELECT
            cc."channelId"           AS channel_id,
            DATE(c."createdAt")      AS signup_date,
            COUNT(*)                 AS new_signups,
            COUNT(*) FILTER (WHERE c."customFieldsIssupplier" = true)      AS new_suppliers,
            COUNT(*) FILTER (WHERE c."customFieldsIssupplier" IS NOT TRUE)  AS new_customers
          FROM customer c
          JOIN customer_channels_channel cc ON cc."customerId" = c.id
          GROUP BY 1, 2
          WITH DATA;
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_dcs_uniq
        ON mv_daily_customer_stats (channel_id, signup_date);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP MATERIALIZED VIEW IF EXISTS mv_daily_customer_stats CASCADE`);
    await queryRunner.query(`DROP MATERIALIZED VIEW IF EXISTS mv_daily_order_stats CASCADE`);
    await queryRunner.query(`DROP MATERIALIZED VIEW IF EXISTS mv_daily_product_sales CASCADE`);
  }
}

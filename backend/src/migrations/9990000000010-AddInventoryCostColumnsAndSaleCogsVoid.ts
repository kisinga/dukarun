import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Phase 1 inventory cost capture:
 *
 * 1. inventory_movement: add unitCostCents / totalCostCents (bigint, nullable; null = unknown)
 *    and backfill from the referenced batch's unitCost. Null-batchId rows stay null.
 * 2. sale_cogs: add voidedAt (timestamp, nullable). Reversals now void rows instead of
 *    deleting them; analytics must exclude voided rows.
 * 3. inventory_stock_adjustment_line: add unitCostCents / totalCostCents / allocations
 *    (per-batch cost breakdown captured at adjustment time).
 * 4. Recreate mv_daily_product_sales so its sale_cogs aggregate excludes voided rows
 *    (drop CASCADE also drops the dependent mv_daily_sales_summary, recreated after).
 *
 * Idempotent: guards on column existence; MV recreation is drop + create. Safe on a fresh DB.
 */
export class AddInventoryCostColumnsAndSaleCogsVoid9990000000010 implements MigrationInterface {
  name = 'AddInventoryCostColumnsAndSaleCogsVoid9990000000010';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Movement cost columns
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.tables
          WHERE table_schema = current_schema() AND table_name = 'inventory_movement'
        ) THEN
          IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = current_schema() AND table_name = 'inventory_movement' AND column_name = 'unitCostCents'
          ) THEN
            ALTER TABLE "inventory_movement" ADD COLUMN "unitCostCents" bigint NULL;
          END IF;
          IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = current_schema() AND table_name = 'inventory_movement' AND column_name = 'totalCostCents'
          ) THEN
            ALTER TABLE "inventory_movement" ADD COLUMN "totalCostCents" bigint NULL;
          END IF;
        END IF;
      END $$;
    `);

    // Backfill from the batch's unitCost (round(|quantity| * unitCost), signed like quantity).
    // Null-batchId rows stay null — cost unknown, never fabricated.
    await queryRunner.query(`
      UPDATE inventory_movement m
      SET "unitCostCents" = b."unitCost",
          "totalCostCents" = round(abs(m.quantity) * b."unitCost")::bigint * sign(m.quantity)::bigint
      FROM inventory_batch b
      WHERE m."batchId" = b.id AND m."unitCostCents" IS NULL
    `);

    // 2. sale_cogs.voidedAt
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.tables
          WHERE table_schema = current_schema() AND table_name = 'sale_cogs'
        ) AND NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = current_schema() AND table_name = 'sale_cogs' AND column_name = 'voidedAt'
        ) THEN
          ALTER TABLE "sale_cogs" ADD COLUMN "voidedAt" timestamp NULL;
        END IF;
      END $$;
    `);

    // 3. Adjustment line cost capture
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.tables
          WHERE table_schema = current_schema() AND table_name = 'inventory_stock_adjustment_line'
        ) THEN
          IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = current_schema() AND table_name = 'inventory_stock_adjustment_line' AND column_name = 'unitCostCents'
          ) THEN
            ALTER TABLE "inventory_stock_adjustment_line" ADD COLUMN "unitCostCents" bigint NULL;
          END IF;
          IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = current_schema() AND table_name = 'inventory_stock_adjustment_line' AND column_name = 'totalCostCents'
          ) THEN
            ALTER TABLE "inventory_stock_adjustment_line" ADD COLUMN "totalCostCents" bigint NULL;
          END IF;
          IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = current_schema() AND table_name = 'inventory_stock_adjustment_line' AND column_name = 'allocations'
          ) THEN
            ALTER TABLE "inventory_stock_adjustment_line" ADD COLUMN "allocations" jsonb NULL;
          END IF;
        END IF;
      END $$;
    `);

    // 4. Recreate analytics MVs excluding voided sale_cogs rows
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
        WHERE "voidedAt" IS NULL
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

    // Dependent MV dropped by the CASCADE above — recreate (definition unchanged from 9390000000000)
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
    // Restore MV definitions from 9330000000000 / 9390000000000 (no voidedAt filter)
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

    await queryRunner.query(
      `ALTER TABLE "inventory_stock_adjustment_line" DROP COLUMN IF EXISTS "allocations"`
    );
    await queryRunner.query(
      `ALTER TABLE "inventory_stock_adjustment_line" DROP COLUMN IF EXISTS "totalCostCents"`
    );
    await queryRunner.query(
      `ALTER TABLE "inventory_stock_adjustment_line" DROP COLUMN IF EXISTS "unitCostCents"`
    );
    await queryRunner.query(`ALTER TABLE "sale_cogs" DROP COLUMN IF EXISTS "voidedAt"`);
    await queryRunner.query(
      `ALTER TABLE "inventory_movement" DROP COLUMN IF EXISTS "totalCostCents"`
    );
    await queryRunner.query(
      `ALTER TABLE "inventory_movement" DROP COLUMN IF EXISTS "unitCostCents"`
    );
  }
}

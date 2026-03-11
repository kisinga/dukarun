import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Add batchId to inventory_stock_adjustment_line for audit when user selects a batch for adjustment.
 *
 * Idempotent per MIGRATION_PATTERNS.md and MIGRATION_GUIDELINES.md:
 * - Uses DO $$ with information_schema checks; no DROP/ADD that could run on re-run.
 * - Table existence check before ALTER.
 * Renamed from 9390000000002 to force rerun on this server and upstream.
 */
export class AddBatchIdToStockAdjustmentLine9400000000001 implements MigrationInterface {
  name = 'AddBatchIdToStockAdjustmentLine9400000000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.tables
          WHERE table_schema = current_schema()
            AND table_name = 'inventory_stock_adjustment_line'
        ) AND NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = current_schema()
            AND table_name = 'inventory_stock_adjustment_line'
            AND column_name = 'batchId'
        ) THEN
          ALTER TABLE "inventory_stock_adjustment_line"
          ADD COLUMN "batchId" character varying(255) NULL;
        END IF;
      END $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = current_schema()
            AND table_name = 'inventory_stock_adjustment_line'
            AND column_name = 'batchId'
        ) THEN
          ALTER TABLE "inventory_stock_adjustment_line"
          DROP COLUMN IF EXISTS "batchId";
        END IF;
      END $$;
    `);
  }
}

import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Add batch expiry tracking flag, configurable low-stock threshold,
 * and batch consumption priority column.
 */
export class AddBatchExpiryAndLowStockFields1000000000022 implements MigrationInterface {
  name = 'AddBatchExpiryAndLowStockFields1000000000022';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        -- Channel batch-expiry tracking flag
        IF EXISTS (
          SELECT 1 FROM information_schema.tables
          WHERE table_name = 'channel'
        ) THEN
          ALTER TABLE "channel"
          ADD COLUMN IF NOT EXISTS "customFieldsBatchexpiryenabled" boolean NOT NULL DEFAULT false;
        END IF;

        -- Channel configurable low-stock threshold
        IF EXISTS (
          SELECT 1 FROM information_schema.tables
          WHERE table_name = 'channel'
        ) THEN
          ALTER TABLE "channel"
          ADD COLUMN IF NOT EXISTS "customFieldsLowstockthreshold" integer NOT NULL DEFAULT '10';
        END IF;

        -- Inventory batch consumption priority flag
        IF EXISTS (
          SELECT 1 FROM information_schema.tables
          WHERE table_name = 'inventory_batch'
        ) THEN
          ALTER TABLE "inventory_batch"
          ADD COLUMN IF NOT EXISTS "consumePriority" boolean NOT NULL DEFAULT false;
        END IF;

        -- Index for priority-based consumption queries
        IF EXISTS (
          SELECT 1 FROM information_schema.tables
          WHERE table_name = 'inventory_batch'
        ) AND NOT EXISTS (
          SELECT 1 FROM pg_indexes
          WHERE tablename = 'inventory_batch' AND indexname = 'IDX_inventory_batch_priority'
        ) THEN
          CREATE INDEX "IDX_inventory_batch_priority"
          ON "inventory_batch" ("channelId", "stockLocationId", "productVariantId", "consumePriority");
        END IF;
      END $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.tables
          WHERE table_name = 'channel'
        ) THEN
          ALTER TABLE "channel"
          DROP COLUMN IF EXISTS "customFieldsBatchexpiryenabled";

          ALTER TABLE "channel"
          DROP COLUMN IF EXISTS "customFieldsLowstockthreshold";
        END IF;

        IF EXISTS (
          SELECT 1 FROM information_schema.tables
          WHERE table_name = 'inventory_batch'
        ) THEN
          ALTER TABLE "inventory_batch"
          DROP COLUMN IF EXISTS "consumePriority";
        END IF;
      END $$;
    `);
  }
}

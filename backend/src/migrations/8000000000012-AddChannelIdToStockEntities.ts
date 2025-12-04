import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Add Channel ID to Stock Entities
 *
 * Adds channelId column to:
 * - stock_purchase: Channel-scope purchases
 * - inventory_stock_adjustment: Channel-scope stock adjustments
 * - purchase_payment: Channel-scope purchase payments
 *
 * Migration is idempotent and assumes fresh system (NOT NULL from start).
 * For production with existing data, manual steps via SSH:
 * 1. Add fields as NULLABLE
 * 2. Backfill channelId from ledger journal entries (sourceType='Purchase' or 'StockAdjustment')
 * 3. Alter columns to NOT NULL
 */
export class AddChannelIdToStockEntities8000000000012 implements MigrationInterface {
  name = 'AddChannelIdToStockEntities8000000000012';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add channelId to stock_purchase
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.tables 
          WHERE table_name = 'stock_purchase'
        ) AND NOT EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'stock_purchase' AND column_name = 'channelId'
        ) THEN
          ALTER TABLE "stock_purchase" 
          ADD COLUMN "channelId" integer NOT NULL;

          -- Add foreign key constraint to channel table
          IF EXISTS (
            SELECT 1 FROM information_schema.tables 
            WHERE table_name = 'channel'
          ) AND NOT EXISTS (
            SELECT 1 FROM pg_constraint 
            WHERE conname = 'FK_stock_purchase_channel'
          ) THEN
            ALTER TABLE "stock_purchase" 
            ADD CONSTRAINT "FK_stock_purchase_channel" 
            FOREIGN KEY ("channelId") REFERENCES "channel"("id") 
            ON DELETE NO ACTION ON UPDATE NO ACTION;
          END IF;

          -- Add index for channelId
          CREATE INDEX IF NOT EXISTS "IDX_stock_purchase_channel" 
          ON "stock_purchase" ("channelId");
        END IF;
      END $$;
    `);

    // Add channelId to inventory_stock_adjustment
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.tables 
          WHERE table_name = 'inventory_stock_adjustment'
        ) AND NOT EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'inventory_stock_adjustment' AND column_name = 'channelId'
        ) THEN
          ALTER TABLE "inventory_stock_adjustment" 
          ADD COLUMN "channelId" integer NOT NULL;

          -- Add foreign key constraint to channel table
          IF EXISTS (
            SELECT 1 FROM information_schema.tables 
            WHERE table_name = 'channel'
          ) AND NOT EXISTS (
            SELECT 1 FROM pg_constraint 
            WHERE conname = 'FK_inventory_stock_adjustment_channel'
          ) THEN
            ALTER TABLE "inventory_stock_adjustment" 
            ADD CONSTRAINT "FK_inventory_stock_adjustment_channel" 
            FOREIGN KEY ("channelId") REFERENCES "channel"("id") 
            ON DELETE NO ACTION ON UPDATE NO ACTION;
          END IF;

          -- Add index for channelId
          CREATE INDEX IF NOT EXISTS "IDX_inventory_stock_adjustment_channel" 
          ON "inventory_stock_adjustment" ("channelId");
        END IF;
      END $$;
    `);

    // Add channelId to purchase_payment
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.tables 
          WHERE table_name = 'purchase_payment'
        ) AND NOT EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'purchase_payment' AND column_name = 'channelId'
        ) THEN
          ALTER TABLE "purchase_payment" 
          ADD COLUMN "channelId" integer NOT NULL;

          -- Add foreign key constraint to channel table
          IF EXISTS (
            SELECT 1 FROM information_schema.tables 
            WHERE table_name = 'channel'
          ) AND NOT EXISTS (
            SELECT 1 FROM pg_constraint 
            WHERE conname = 'FK_purchase_payment_channel'
          ) THEN
            ALTER TABLE "purchase_payment" 
            ADD CONSTRAINT "FK_purchase_payment_channel" 
            FOREIGN KEY ("channelId") REFERENCES "channel"("id") 
            ON DELETE NO ACTION ON UPDATE NO ACTION;
          END IF;

          -- Add index for channelId
          CREATE INDEX IF NOT EXISTS "IDX_purchase_payment_channel" 
          ON "purchase_payment" ("channelId");
        END IF;
      END $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Remove channelId from purchase_payment
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.tables 
          WHERE table_name = 'purchase_payment'
        ) THEN
          DROP INDEX IF EXISTS "IDX_purchase_payment_channel";
          ALTER TABLE "purchase_payment" 
          DROP CONSTRAINT IF EXISTS "FK_purchase_payment_channel";
          ALTER TABLE "purchase_payment" 
          DROP COLUMN IF EXISTS "channelId";
        END IF;
      END $$;
    `);

    // Remove channelId from inventory_stock_adjustment
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.tables 
          WHERE table_name = 'inventory_stock_adjustment'
        ) THEN
          DROP INDEX IF EXISTS "IDX_inventory_stock_adjustment_channel";
          ALTER TABLE "inventory_stock_adjustment" 
          DROP CONSTRAINT IF EXISTS "FK_inventory_stock_adjustment_channel";
          ALTER TABLE "inventory_stock_adjustment" 
          DROP COLUMN IF EXISTS "channelId";
        END IF;
      END $$;
    `);

    // Remove channelId from stock_purchase
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.tables 
          WHERE table_name = 'stock_purchase'
        ) THEN
          DROP INDEX IF EXISTS "IDX_stock_purchase_channel";
          ALTER TABLE "stock_purchase" 
          DROP CONSTRAINT IF EXISTS "FK_stock_purchase_channel";
          ALTER TABLE "stock_purchase" 
          DROP COLUMN IF EXISTS "channelId";
        END IF;
      END $$;
    `);
  }
}

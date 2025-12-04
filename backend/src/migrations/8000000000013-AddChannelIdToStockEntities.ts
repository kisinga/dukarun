import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Add Channel ID to Stock Entities
 *
 * Adds channelId column to:
 * - stock_purchase: Channel-scope purchases
 * - inventory_stock_adjustment: Channel-scope stock adjustments
 * - purchase_payment: Channel-scope purchase payments
 *
 * IDEMPOTENT MIGRATION PATTERN:
 * - Checks if column exists first - if yes, skips everything (script ran first)
 * - If column doesn't exist, creates it as NOT NULL (fresh system)
 * - Does NOT create FK constraints or indexes - TypeORM handles these via @ManyToOne and @Index decorators
 * - This avoids conflicts with TypeORM's hash-based constraint naming
 *
 * For production with existing data:
 * 1. Run SQL script first: backend/scripts/backfill-channel-id-stock-entities.sql
 *    (Script creates FKs/indexes for data integrity during backfill)
 * 2. Then deploy this migration - it will see columns exist and skip
 * 3. TypeORM will see FKs/indexes exist and won't recreate them
 *
 * See MIGRATION_PATTERNS.md for the full pattern.
 */
export class AddChannelIdToStockEntities8000000000013 implements MigrationInterface {
  name = 'AddChannelIdToStockEntities8000000000013';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add channelId to stock_purchase
    // If column exists (script ran first), skip everything - fully idempotent
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
          -- Column doesn't exist - add it as NOT NULL (fresh system scenario)
          -- For production with existing data, run the SQL script first
          ALTER TABLE "stock_purchase" 
          ADD COLUMN "channelId" integer NOT NULL;

          -- Note: FK constraints are created by TypeORM via @ManyToOne decorators
          -- Index is created by TypeORM via @Index decorator if present
          -- No manual FK/index creation here to avoid conflicts with TypeORM's naming
        END IF;
      END $$;
    `);

    // Add channelId to inventory_stock_adjustment
    // If column exists (script ran first), skip everything - fully idempotent
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
          -- Column doesn't exist - add it as NOT NULL (fresh system scenario)
          -- For production with existing data, run the SQL script first
          ALTER TABLE "inventory_stock_adjustment" 
          ADD COLUMN "channelId" integer NOT NULL;

          -- Note: FK constraints are created by TypeORM via @ManyToOne decorators
          -- Index is created by TypeORM via @Index decorator if present
          -- No manual FK/index creation here to avoid conflicts with TypeORM's naming
        END IF;
      END $$;
    `);

    // Add channelId to purchase_payment
    // If column exists (script ran first), skip everything - fully idempotent
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
          -- Column doesn't exist - add it as NOT NULL (fresh system scenario)
          -- For production with existing data, run the SQL script first
          ALTER TABLE "purchase_payment" 
          ADD COLUMN "channelId" integer NOT NULL;

          -- Note: FK constraints are created by TypeORM via @ManyToOne decorators
          -- Index is created by TypeORM via @Index decorator if present
          -- No manual FK/index creation here to avoid conflicts with TypeORM's naming
        END IF;
      END $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Remove channelId from purchase_payment
    // Note: FKs and indexes are managed by TypeORM, will be dropped automatically
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.tables 
          WHERE table_name = 'purchase_payment'
        ) AND EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'purchase_payment' AND column_name = 'channelId'
        ) THEN
          -- Drop any FK constraint on channelId (TypeORM may have created it)
          DO $$
          DECLARE
            fk_name text;
          BEGIN
            SELECT conname INTO fk_name
            FROM pg_constraint c
            JOIN pg_class t ON c.conrelid = t.oid
            JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(c.conkey)
            WHERE t.relname = 'purchase_payment'
              AND a.attname = 'channelId'
              AND c.contype = 'f'
            LIMIT 1;
            IF fk_name IS NOT NULL THEN
              EXECUTE format('ALTER TABLE purchase_payment DROP CONSTRAINT %I', fk_name);
            END IF;
          END $$;
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
        ) AND EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'inventory_stock_adjustment' AND column_name = 'channelId'
        ) THEN
          -- Drop any FK constraint on channelId (TypeORM may have created it)
          DO $$
          DECLARE
            fk_name text;
          BEGIN
            SELECT conname INTO fk_name
            FROM pg_constraint c
            JOIN pg_class t ON c.conrelid = t.oid
            JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(c.conkey)
            WHERE t.relname = 'inventory_stock_adjustment'
              AND a.attname = 'channelId'
              AND c.contype = 'f'
            LIMIT 1;
            IF fk_name IS NOT NULL THEN
              EXECUTE format('ALTER TABLE inventory_stock_adjustment DROP CONSTRAINT %I', fk_name);
            END IF;
          END $$;
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
        ) AND EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'stock_purchase' AND column_name = 'channelId'
        ) THEN
          -- Drop any FK constraint on channelId (TypeORM may have created it)
          DO $$
          DECLARE
            fk_name text;
          BEGIN
            SELECT conname INTO fk_name
            FROM pg_constraint c
            JOIN pg_class t ON c.conrelid = t.oid
            JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(c.conkey)
            WHERE t.relname = 'stock_purchase'
              AND a.attname = 'channelId'
              AND c.contype = 'f'
            LIMIT 1;
            IF fk_name IS NOT NULL THEN
              EXECUTE format('ALTER TABLE stock_purchase DROP CONSTRAINT %I', fk_name);
            END IF;
          END $$;
          ALTER TABLE "stock_purchase" 
          DROP COLUMN IF EXISTS "channelId";
        END IF;
      END $$;
    `);
  }
}

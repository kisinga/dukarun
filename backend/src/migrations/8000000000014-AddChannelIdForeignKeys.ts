import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Add Foreign Key Constraints for Channel ID
 *
 * Adds FK constraints for channelId columns that TypeORM expects:
 * - stock_purchase.channelId -> channel.id
 * - inventory_stock_adjustment.channelId -> channel.id
 * - purchase_payment.channelId -> channel.id
 *
 * IDEMPOTENT: Works across all environments:
 * - Checks if ANY FK exists on channelId that references channel(id)
 * - If correct FK exists (regardless of name): skip
 * - If no FK exists: create one (TypeORM will handle naming via synchronize)
 * - If wrong FK exists: drop and let TypeORM recreate
 *
 * Note: We don't hardcode FK names since TypeORM generates hash-based names
 * that may differ between environments. TypeORM's synchronize will ensure
 * the correct FK name exists after this migration runs.
 */
export class AddChannelIdForeignKeys8000000000014 implements MigrationInterface {
  name = 'AddChannelIdForeignKeys8000000000014';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add FK for stock_purchase.channelId
    await queryRunner.query(`
      DO $$
      DECLARE
        correct_fk_exists boolean;
        wrong_fk_name text;
      BEGIN
        -- Check if a FK exists on channelId that references channel(id)
        SELECT EXISTS (
          SELECT 1
          FROM pg_constraint c
          JOIN pg_class t ON c.conrelid = t.oid
          JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(c.conkey)
          JOIN pg_class ref_t ON c.confrelid = ref_t.oid
          JOIN pg_attribute ref_a ON ref_a.attrelid = ref_t.oid AND ref_a.attnum = ANY(c.confkey)
          WHERE t.relname = 'stock_purchase'
            AND a.attname = 'channelId'
            AND ref_t.relname = 'channel'
            AND ref_a.attname = 'id'
            AND c.contype = 'f'
        ) INTO correct_fk_exists;

        IF NOT correct_fk_exists THEN
          -- Check if any FK exists on this column (might be wrong target)
          SELECT conname INTO wrong_fk_name
          FROM pg_constraint c
          JOIN pg_class t ON c.conrelid = t.oid
          JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(c.conkey)
          WHERE t.relname = 'stock_purchase'
            AND a.attname = 'channelId'
            AND c.contype = 'f'
          LIMIT 1;

          -- If a wrong FK exists, drop it
          IF wrong_fk_name IS NOT NULL THEN
            EXECUTE format('ALTER TABLE stock_purchase DROP CONSTRAINT %I', wrong_fk_name);
          END IF;

          -- Create the FK (let PostgreSQL/TypeORM handle naming)
          ALTER TABLE "stock_purchase" 
          ADD CONSTRAINT "FK_stock_purchase_channel" 
          FOREIGN KEY ("channelId") 
          REFERENCES "channel"("id") 
          ON DELETE NO ACTION 
          ON UPDATE NO ACTION;
        END IF;
      END $$;
    `);

    // Add FK for inventory_stock_adjustment.channelId
    await queryRunner.query(`
      DO $$
      DECLARE
        correct_fk_exists boolean;
        wrong_fk_name text;
      BEGIN
        -- Check if a FK exists on channelId that references channel(id)
        SELECT EXISTS (
          SELECT 1
          FROM pg_constraint c
          JOIN pg_class t ON c.conrelid = t.oid
          JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(c.conkey)
          JOIN pg_class ref_t ON c.confrelid = ref_t.oid
          JOIN pg_attribute ref_a ON ref_a.attrelid = ref_t.oid AND ref_a.attnum = ANY(c.confkey)
          WHERE t.relname = 'inventory_stock_adjustment'
            AND a.attname = 'channelId'
            AND ref_t.relname = 'channel'
            AND ref_a.attname = 'id'
            AND c.contype = 'f'
        ) INTO correct_fk_exists;

        IF NOT correct_fk_exists THEN
          -- Check if any FK exists on this column (might be wrong target)
          SELECT conname INTO wrong_fk_name
          FROM pg_constraint c
          JOIN pg_class t ON c.conrelid = t.oid
          JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(c.conkey)
          WHERE t.relname = 'inventory_stock_adjustment'
            AND a.attname = 'channelId'
            AND c.contype = 'f'
          LIMIT 1;

          -- If a wrong FK exists, drop it
          IF wrong_fk_name IS NOT NULL THEN
            EXECUTE format('ALTER TABLE inventory_stock_adjustment DROP CONSTRAINT %I', wrong_fk_name);
          END IF;

          -- Create the FK (let PostgreSQL/TypeORM handle naming)
          ALTER TABLE "inventory_stock_adjustment" 
          ADD CONSTRAINT "FK_inventory_stock_adjustment_channel" 
          FOREIGN KEY ("channelId") 
          REFERENCES "channel"("id") 
          ON DELETE NO ACTION 
          ON UPDATE NO ACTION;
        END IF;
      END $$;
    `);

    // Add FK for purchase_payment.channelId
    await queryRunner.query(`
      DO $$
      DECLARE
        correct_fk_exists boolean;
        wrong_fk_name text;
      BEGIN
        -- Check if a FK exists on channelId that references channel(id)
        SELECT EXISTS (
          SELECT 1
          FROM pg_constraint c
          JOIN pg_class t ON c.conrelid = t.oid
          JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(c.conkey)
          JOIN pg_class ref_t ON c.confrelid = ref_t.oid
          JOIN pg_attribute ref_a ON ref_a.attrelid = ref_t.oid AND ref_a.attnum = ANY(c.confkey)
          WHERE t.relname = 'purchase_payment'
            AND a.attname = 'channelId'
            AND ref_t.relname = 'channel'
            AND ref_a.attname = 'id'
            AND c.contype = 'f'
        ) INTO correct_fk_exists;

        IF NOT correct_fk_exists THEN
          -- Check if any FK exists on this column (might be wrong target)
          SELECT conname INTO wrong_fk_name
          FROM pg_constraint c
          JOIN pg_class t ON c.conrelid = t.oid
          JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(c.conkey)
          WHERE t.relname = 'purchase_payment'
            AND a.attname = 'channelId'
            AND c.contype = 'f'
          LIMIT 1;

          -- If a wrong FK exists, drop it
          IF wrong_fk_name IS NOT NULL THEN
            EXECUTE format('ALTER TABLE purchase_payment DROP CONSTRAINT %I', wrong_fk_name);
          END IF;

          -- Create the FK (let PostgreSQL/TypeORM handle naming)
          ALTER TABLE "purchase_payment" 
          ADD CONSTRAINT "FK_purchase_payment_channel" 
          FOREIGN KEY ("channelId") 
          REFERENCES "channel"("id") 
          ON DELETE NO ACTION 
          ON UPDATE NO ACTION;
        END IF;
      END $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop FK for purchase_payment.channelId
    await queryRunner.query(`
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
    `);

    // Drop FK for inventory_stock_adjustment.channelId
    await queryRunner.query(`
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
    `);

    // Drop FK for stock_purchase.channelId
    await queryRunner.query(`
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
    `);
  }
}

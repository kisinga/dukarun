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
 * - Checks if the correct TypeORM hash-based constraint name exists
 * - If correct constraint name exists: skip
 * - If wrong constraint name exists: drop and recreate with correct name
 * - If no FK exists: create with correct TypeORM hash-based name
 *
 * Note: TypeORM generates deterministic hash-based constraint names based on
 * entity metadata. We must use the exact names TypeORM expects to avoid schema mismatches.
 */
export class AddChannelIdForeignKeys8000000000014 implements MigrationInterface {
  name = 'AddChannelIdForeignKeys8000000000014';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add FK for stock_purchase.channelId
    await queryRunner.query(`
      DO $$
      DECLARE
        correct_name_exists boolean;
        wrong_fk_name text;
      BEGIN
        -- Check if the correct TypeORM hash-based constraint name exists
        SELECT EXISTS (
          SELECT 1 FROM pg_constraint 
          WHERE conname = 'FK_f2dcdcc9376c26e6db204e92d0c'
        ) INTO correct_name_exists;

        IF NOT correct_name_exists THEN
          -- Check if any FK exists on this column (wrong name)
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

          -- Create the FK with correct TypeORM hash-based name
          ALTER TABLE "stock_purchase" 
          ADD CONSTRAINT "FK_f2dcdcc9376c26e6db204e92d0c" 
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
        correct_name_exists boolean;
        wrong_fk_name text;
      BEGIN
        -- Check if the correct TypeORM hash-based constraint name exists
        SELECT EXISTS (
          SELECT 1 FROM pg_constraint 
          WHERE conname = 'FK_ba4bb7998fa24453a7103687305'
        ) INTO correct_name_exists;

        IF NOT correct_name_exists THEN
          -- Check if any FK exists on this column (wrong name)
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

          -- Create the FK with correct TypeORM hash-based name
          ALTER TABLE "inventory_stock_adjustment" 
          ADD CONSTRAINT "FK_ba4bb7998fa24453a7103687305" 
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
        correct_name_exists boolean;
        wrong_fk_name text;
      BEGIN
        -- Check if the correct TypeORM hash-based constraint name exists
        SELECT EXISTS (
          SELECT 1 FROM pg_constraint 
          WHERE conname = 'FK_79578e8f2067ae00e0d15980f10'
        ) INTO correct_name_exists;

        IF NOT correct_name_exists THEN
          -- Check if any FK exists on this column (wrong name)
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

          -- Create the FK with correct TypeORM hash-based name
          ALTER TABLE "purchase_payment" 
          ADD CONSTRAINT "FK_79578e8f2067ae00e0d15980f10" 
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

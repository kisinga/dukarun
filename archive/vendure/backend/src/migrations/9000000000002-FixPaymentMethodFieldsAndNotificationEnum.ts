import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Fix Payment Method Fields and Notification Enum
 *
 * This migration addresses schema mismatches in production:
 * 1. Updates payment_method custom fields to match current configuration:
 *    - customFieldsReconciliationtype: varchar(255) NOT NULL DEFAULT 'none'
 *    - customFieldsLedgeraccountcode: varchar(255) nullable
 *    - customFieldsIscashiercontrolled: NOT NULL
 *    - customFieldsRequiresreconciliation: NOT NULL
 * 2. Adds 'cash_variance' to notification_type_enum
 * 3. Creates required indexes for cash_drawer_count and mpesa_verification
 */
export class FixPaymentMethodFieldsAndNotificationEnum9000000000002 implements MigrationInterface {
  name = 'FixPaymentMethodFieldsAndNotificationEnum9000000000002';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ============================================
    // 1. Fix payment_method custom fields
    // ============================================
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.tables 
          WHERE table_name = 'payment_method'
        ) THEN
          -- Ensure boolean columns have default values before making them NOT NULL
          -- Set NULL values to defaults first
          UPDATE "payment_method"
          SET "customFieldsIscashiercontrolled" = false
          WHERE "customFieldsIscashiercontrolled" IS NULL;

          UPDATE "payment_method"
          SET "customFieldsRequiresreconciliation" = true
          WHERE "customFieldsRequiresreconciliation" IS NULL;

          -- Ensure default constraints exist
          ALTER TABLE "payment_method"
          ALTER COLUMN "customFieldsIscashiercontrolled" SET DEFAULT false;

          ALTER TABLE "payment_method"
          ALTER COLUMN "customFieldsRequiresreconciliation" SET DEFAULT true;

          -- Drop and recreate customFieldsReconciliationtype with correct type and constraints
          -- Preserve data by storing in temp column first
          -- Clean up any leftover temp column from previous failed migration
          ALTER TABLE "payment_method"
          DROP COLUMN IF EXISTS "_temp_reconciliationtype";

          IF EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = 'payment_method' 
            AND column_name = 'customFieldsReconciliationtype'
          ) THEN
            -- Store existing values temporarily
            ALTER TABLE "payment_method"
            ADD COLUMN "_temp_reconciliationtype" character varying(255);
            
            UPDATE "payment_method"
            SET "_temp_reconciliationtype" = COALESCE("customFieldsReconciliationtype", 'none');
          END IF;

          ALTER TABLE "payment_method"
          DROP COLUMN IF EXISTS "customFieldsReconciliationtype";

          ALTER TABLE "payment_method"
          ADD COLUMN "customFieldsReconciliationtype" character varying(255) NOT NULL DEFAULT 'none';

          -- Restore data from temp column if it exists
          IF EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = 'payment_method' 
            AND column_name = '_temp_reconciliationtype'
          ) THEN
            UPDATE "payment_method"
            SET "customFieldsReconciliationtype" = "_temp_reconciliationtype"
            WHERE "_temp_reconciliationtype" IS NOT NULL;
            
            ALTER TABLE "payment_method"
            DROP COLUMN "_temp_reconciliationtype";
          END IF;

          -- Drop and recreate customFieldsLedgeraccountcode with correct type (nullable)
          -- Preserve data
          -- Clean up any leftover temp column from previous failed migration
          ALTER TABLE "payment_method"
          DROP COLUMN IF EXISTS "_temp_ledgeraccountcode";

          IF EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = 'payment_method' 
            AND column_name = 'customFieldsLedgeraccountcode'
          ) THEN
            -- Store existing values temporarily
            ALTER TABLE "payment_method"
            ADD COLUMN "_temp_ledgeraccountcode" character varying(255);
            
            UPDATE "payment_method"
            SET "_temp_ledgeraccountcode" = "customFieldsLedgeraccountcode";
          END IF;

          ALTER TABLE "payment_method"
          DROP COLUMN IF EXISTS "customFieldsLedgeraccountcode";

          ALTER TABLE "payment_method"
          ADD COLUMN "customFieldsLedgeraccountcode" character varying(255);

          -- Restore data from temp column if it exists
          IF EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = 'payment_method' 
            AND column_name = '_temp_ledgeraccountcode'
          ) THEN
            UPDATE "payment_method"
            SET "customFieldsLedgeraccountcode" = "_temp_ledgeraccountcode";
            
            ALTER TABLE "payment_method"
            DROP COLUMN "_temp_ledgeraccountcode";
          END IF;

          -- Make boolean columns NOT NULL (they should already have values from UPDATE above)
          ALTER TABLE "payment_method"
          ALTER COLUMN "customFieldsIscashiercontrolled" SET NOT NULL;

          ALTER TABLE "payment_method"
          ALTER COLUMN "customFieldsRequiresreconciliation" SET NOT NULL;
        END IF;
      END $$;
    `);

    // ============================================
    // 2. Update notification_type_enum to include 'cash_variance'
    // ============================================
    await queryRunner.query(`
      DO $$
      DECLARE
        cash_variance_exists boolean;
        enum_exists boolean;
        old_enum_exists boolean;
      BEGIN
        -- Check if notification_type_enum exists
        SELECT EXISTS (
          SELECT 1 FROM pg_type WHERE typname = 'notification_type_enum'
        ) INTO enum_exists;

        -- Check if 'cash_variance' already exists in notification_type_enum
        IF enum_exists THEN
          SELECT EXISTS (
            SELECT 1 FROM pg_enum e
            JOIN pg_type t ON e.enumtypid = t.oid
            WHERE t.typname = 'notification_type_enum'
            AND e.enumlabel = 'cash_variance'
          ) INTO cash_variance_exists;
        ELSE
          cash_variance_exists := false;
        END IF;

        -- Check if old enum exists (from partial/interrupted migration)
        SELECT EXISTS (
          SELECT 1 FROM pg_type WHERE typname = 'notification_type_enum_old'
        ) INTO old_enum_exists;

        -- Only proceed if cash_variance doesn't exist
        IF NOT cash_variance_exists THEN
          -- If we're in the middle of a migration (old enum exists but new doesn't have cash_variance)
          -- Restore from old enum first
          IF old_enum_exists AND NOT enum_exists THEN
            ALTER TYPE "public"."notification_type_enum_old" RENAME TO "notification_type_enum";
            enum_exists := true;
          END IF;

          -- Rename current enum to old (if it exists)
          IF enum_exists THEN
            ALTER TYPE "public"."notification_type_enum" RENAME TO "notification_type_enum_old";
          END IF;

          -- Create new enum with 'cash_variance' added
          CREATE TYPE "public"."notification_type_enum" AS ENUM(
            'order', 
            'stock', 
            'ml_training', 
            'payment', 
            'cash_variance'
          );

          -- Convert column to new enum type (if table exists)
          IF EXISTS (
            SELECT 1 FROM information_schema.tables 
            WHERE table_name = 'notification'
          ) THEN
            ALTER TABLE "notification" 
            ALTER COLUMN "type" TYPE "public"."notification_type_enum" 
            USING "type"::text::"public"."notification_type_enum";
          END IF;

          -- Drop old enum
          DROP TYPE IF EXISTS "public"."notification_type_enum_old";
        END IF;
      END $$;
    `);

    // ============================================
    // 3. Create required indexes
    // ============================================

    // Index for cash_drawer_count pending reviews (where reviewedByUserId IS NULL)
    // Only create if table exists
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.tables 
          WHERE table_name = 'cash_drawer_count'
        ) THEN
          CREATE INDEX IF NOT EXISTS "IDX_931888d603f7ec746041466a63" 
          ON "cash_drawer_count" ("channelId", "reviewedByUserId") 
          WHERE "reviewedByUserId" IS NULL;
        END IF;
      END $$;
    `);

    // Index for cash_drawer_count by channel and session
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.tables 
          WHERE table_name = 'cash_drawer_count'
        ) THEN
          CREATE INDEX IF NOT EXISTS "IDX_08849aad6582435bc9f7aed071" 
          ON "cash_drawer_count" ("channelId", "sessionId");
        END IF;
      END $$;
    `);

    // Index for mpesa_verification by channel and session
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.tables 
          WHERE table_name = 'mpesa_verification'
        ) THEN
          CREATE INDEX IF NOT EXISTS "IDX_3903079605f5810e33e9b2ed78" 
          ON "mpesa_verification" ("channelId", "sessionId");
        END IF;
      END $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop indexes
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_3903079605f5810e33e9b2ed78"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_08849aad6582435bc9f7aed071"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_931888d603f7ec746041466a63"`);

    // Revert notification_type_enum (remove 'cash_variance')
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM pg_type WHERE typname = 'notification_type_enum'
        ) THEN
          -- Check if there are any records with 'cash_variance' type
          IF EXISTS (
            SELECT 1 FROM "notification" WHERE "type" = 'cash_variance'
          ) THEN
            RAISE EXCEPTION 'Cannot revert: notification records exist with cash_variance type';
          END IF;

          -- Rename current enum
          ALTER TYPE "public"."notification_type_enum" RENAME TO "notification_type_enum_old";

          -- Create enum without 'cash_variance'
          CREATE TYPE "public"."notification_type_enum" AS ENUM(
            'order', 
            'stock', 
            'ml_training', 
            'payment'
          );

          -- Convert column back
          ALTER TABLE "notification" 
          ALTER COLUMN "type" TYPE "public"."notification_type_enum" 
          USING "type"::text::"public"."notification_type_enum";

          -- Drop old enum
          DROP TYPE "public"."notification_type_enum_old";
        END IF;
      END $$;
    `);

    // Revert payment_method columns (restore to previous state)
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.tables 
          WHERE table_name = 'payment_method'
        ) THEN
          -- Make boolean columns nullable again
          ALTER TABLE "payment_method"
          ALTER COLUMN "customFieldsRequiresreconciliation" DROP NOT NULL;

          ALTER TABLE "payment_method"
          ALTER COLUMN "customFieldsIscashiercontrolled" DROP NOT NULL;

          -- Revert customFieldsLedgeraccountcode to varchar(64)
          ALTER TABLE "payment_method"
          DROP COLUMN IF EXISTS "customFieldsLedgeraccountcode";

          ALTER TABLE "payment_method"
          ADD COLUMN "customFieldsLedgeraccountcode" character varying(64);

          -- Revert customFieldsReconciliationtype to varchar(32) with default
          ALTER TABLE "payment_method"
          DROP COLUMN IF EXISTS "customFieldsReconciliationtype";

          ALTER TABLE "payment_method"
          ADD COLUMN "customFieldsReconciliationtype" character varying(32) DEFAULT 'none';
        END IF;
      END $$;
    `);
  }
}

import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Align DB with current entity/config to stop TypeORM schema-diff:
 *
 * 1. Customer: drop customFieldsCreditfrozen if present (creditFrozen is computed in CreditSummary, not stored).
 * 2. notification_type_enum: add 'approval' if missing (entity NotificationType.APPROVAL = 'approval').
 *
 * Idempotent: safe to run multiple times.
 */
export class AlignCustomerAndNotificationSchema9380000000000 implements MigrationInterface {
  name = 'AlignCustomerAndNotificationSchema9380000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = current_schema() AND table_name = 'customer' AND column_name = 'customFieldsCreditfrozen'
        ) THEN
          ALTER TABLE "customer" DROP COLUMN "customFieldsCreditfrozen";
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      DO $$
      DECLARE
        approval_exists boolean;
        enum_exists boolean;
      BEGIN
        SELECT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'notification_type_enum') INTO enum_exists;
        IF NOT enum_exists THEN
          RETURN;
        END IF;

        SELECT EXISTS (
          SELECT 1 FROM pg_enum e
          JOIN pg_type t ON e.enumtypid = t.oid
          WHERE t.typname = 'notification_type_enum' AND e.enumlabel = 'approval'
        ) INTO approval_exists;

        IF NOT approval_exists THEN
          ALTER TYPE "public"."notification_type_enum" RENAME TO "notification_type_enum_old";
          CREATE TYPE "public"."notification_type_enum" AS ENUM(
            'order', 'stock', 'ml_training', 'payment', 'cash_variance', 'approval'
          );
          ALTER TABLE "notification"
            ALTER COLUMN "type" TYPE "public"."notification_type_enum"
            USING "type"::text::"public"."notification_type_enum";
          DROP TYPE "public"."notification_type_enum_old";
        END IF;
      END $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = current_schema() AND table_name = 'customer' AND column_name = 'customFieldsCreditfrozen'
        ) THEN
          ALTER TABLE "customer" ADD COLUMN "customFieldsCreditfrozen" boolean;
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      DO $$
      DECLARE
        has_approval boolean;
      BEGIN
        SELECT EXISTS (SELECT 1 FROM "notification" WHERE "type"::text = 'approval') INTO has_approval;
        IF has_approval THEN
          RAISE EXCEPTION 'Cannot revert: notification records exist with type approval';
        END IF;
        ALTER TYPE "public"."notification_type_enum" RENAME TO "notification_type_enum_old";
        CREATE TYPE "public"."notification_type_enum" AS ENUM(
          'order', 'stock', 'ml_training', 'payment', 'cash_variance'
        );
        ALTER TABLE "notification"
          ALTER COLUMN "type" TYPE "public"."notification_type_enum"
          USING "type"::text::"public"."notification_type_enum";
        DROP TYPE "public"."notification_type_enum_old";
      END $$;
    `);
  }
}

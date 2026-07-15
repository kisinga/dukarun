import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Reconcile credit-notification schema drift:
 * - Replace the separate non-unique index + unique constraint on
 *   credit_notification_checkpoint with a single named unique index.
 * - Change pending_notification.error from varchar to text.
 *
 * Idempotent: each step checks existence before altering.
 */
export class FixCreditNotificationSchema1784120299965 implements MigrationInterface {
  name = 'FixCreditNotificationSchema1784120299965';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS "public"."IDX_credit_notification_checkpoint_lookup";
    `);
    await queryRunner.query(`
      ALTER TABLE "credit_notification_checkpoint"
      DROP CONSTRAINT IF EXISTS "UQ_credit_notification_checkpoint_lookup";
    `);

    await queryRunner.query(`
      ALTER TABLE "pending_notification"
      ALTER COLUMN "error" TYPE text;
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "IDX_credit_notification_checkpoint_lookup"
      ON "credit_notification_checkpoint" ("customerId", "triggerKey", "bucket");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS "public"."IDX_credit_notification_checkpoint_lookup";
    `);

    await queryRunner.query(`
      ALTER TABLE "pending_notification"
      ALTER COLUMN "error" TYPE character varying;
    `);

    await queryRunner.query(`
      ALTER TABLE "credit_notification_checkpoint"
      ADD CONSTRAINT "UQ_credit_notification_checkpoint_lookup"
      UNIQUE ("customerId", "triggerKey", "bucket");
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_credit_notification_checkpoint_lookup"
      ON "credit_notification_checkpoint" ("customerId", "triggerKey", "bucket");
    `);
  }
}

import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Add the credit_notification_checkpoint table for reminder deduplication.
 *
 * Idempotent: CREATE TABLE IF NOT EXISTS / DROP TABLE IF EXISTS.
 */
export class AddCreditNotificationCheckpoint9990000000004 implements MigrationInterface {
  name = 'AddCreditNotificationCheckpoint9990000000004';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "credit_notification_checkpoint" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "customerId" character varying NOT NULL,
        "triggerKey" character varying NOT NULL,
        "bucket" character varying NOT NULL,
        "sentAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_credit_notification_checkpoint" PRIMARY KEY ("id")
      );
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "IDX_credit_notification_checkpoint_lookup"
      ON "credit_notification_checkpoint" ("customerId", "triggerKey", "bucket");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "credit_notification_checkpoint" CASCADE;`);
  }
}

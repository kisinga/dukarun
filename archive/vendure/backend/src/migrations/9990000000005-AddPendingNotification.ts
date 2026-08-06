import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Add the pending_notification table for deferring system-generated
 * WhatsApp messages outside quiet hours.
 *
 * Idempotent: CREATE TABLE IF NOT EXISTS / DROP TABLE IF EXISTS.
 */
export class AddPendingNotification9990000000005 implements MigrationInterface {
  name = 'AddPendingNotification9990000000005';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "pending_notification" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "channelId" character varying NOT NULL,
        "triggerKey" character varying NOT NULL,
        "recipient" character varying NOT NULL,
        "body" text NOT NULL,
        "metadata" jsonb,
        "scheduledAt" timestamptz NOT NULL,
        "sentAt" timestamptz,
        "attempts" integer NOT NULL DEFAULT 0,
        "error" text,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_pending_notification" PRIMARY KEY ("id")
      );
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_pending_notification_scheduled"
      ON "pending_notification" ("sentAt", "scheduledAt")
      WHERE "sentAt" IS NULL;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "pending_notification" CASCADE;`);
  }
}

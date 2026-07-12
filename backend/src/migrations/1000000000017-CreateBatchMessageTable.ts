import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Create the batch_message table for super-admin broadcast campaigns.
 */
export class CreateBatchMessageTable1000000000017 implements MigrationInterface {
  name = 'CreateBatchMessageTable1000000000017';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "batch_message" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "name" character varying(255) NOT NULL,
        "content" text NOT NULL,
        "audience" character varying(32) NOT NULL,
        "channelIds" jsonb,
        "customUserIds" jsonb,
        "channels" jsonb NOT NULL,
        "status" character varying(16) NOT NULL,
        "recipientCount" integer NOT NULL DEFAULT 0,
        "sentCount" integer NOT NULL DEFAULT 0,
        "failedCount" integer NOT NULL DEFAULT 0,
        "failureLog" jsonb,
        "createdByUserId" character varying(255),
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "sentAt" TIMESTAMP WITH TIME ZONE
      );
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_batch_message_status"
        ON "batch_message" ("status");
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_batch_message_createdAt"
        ON "batch_message" ("createdAt");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_batch_message_createdAt";`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_batch_message_status";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "batch_message";`);
  }
}

import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Creates the approval_request table for the generic approval workflow system.
 * Idempotent: safe to re-run.
 */
export class CreateApprovalRequestEntity9100000000000 implements MigrationInterface {
  name = 'CreateApprovalRequestEntity9100000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.tables
          WHERE table_name = 'approval_request'
        ) THEN
          CREATE TABLE "approval_request" (
            "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
            "channelId" integer NOT NULL,
            "type" varchar(50) NOT NULL,
            "status" varchar(20) NOT NULL DEFAULT 'pending',
            "requestedById" varchar NOT NULL,
            "reviewedById" varchar,
            "reviewedAt" timestamp,
            "message" text,
            "metadata" jsonb NOT NULL DEFAULT '{}',
            "entityType" varchar,
            "entityId" varchar,
            "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
            "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
            CONSTRAINT "PK_approval_request" PRIMARY KEY ("id")
          );

          CREATE INDEX "IDX_approval_request_channel" ON "approval_request" ("channelId");
          CREATE INDEX "IDX_approval_request_status" ON "approval_request" ("channelId", "status");
          CREATE INDEX "IDX_approval_request_requester" ON "approval_request" ("channelId", "requestedById");
        END IF;
      END $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP TABLE IF EXISTS "approval_request";
    `);
  }
}

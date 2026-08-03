import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Add Cash Control Tables
 *
 * Creates tables for the cash control flow:
 * - cash_drawer_count: Records blind cash counts during sessions
 * - mpesa_verification: Records M-Pesa transaction verifications
 */
export class AddCashControlTables8000000000009 implements MigrationInterface {
  name = 'AddCashControlTables8000000000009';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create cash_drawer_count table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "cash_drawer_count" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "channelId" integer NOT NULL,
        "sessionId" uuid NOT NULL,
        "countType" varchar(16) NOT NULL,
        "takenAt" timestamp NOT NULL,
        "declaredCash" bigint NOT NULL,
        "expectedCash" bigint NOT NULL,
        "variance" bigint NOT NULL,
        "varianceReason" text,
        "reviewedByUserId" integer,
        "reviewedAt" timestamp,
        "reviewNotes" text,
        "countedByUserId" integer NOT NULL,
        CONSTRAINT "PK_cash_drawer_count" PRIMARY KEY ("id")
      )
    `);

    // Create indexes for cash_drawer_count
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_cash_drawer_count_channel_session" 
      ON "cash_drawer_count" ("channelId", "sessionId")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_cash_drawer_count_pending_reviews" 
      ON "cash_drawer_count" ("channelId", "reviewedByUserId")
      WHERE "reviewedByUserId" IS NULL
    `);

    // Create mpesa_verification table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "mpesa_verification" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "channelId" integer NOT NULL,
        "sessionId" uuid NOT NULL,
        "verifiedAt" timestamp NOT NULL,
        "transactionCount" integer NOT NULL,
        "allConfirmed" boolean NOT NULL,
        "flaggedTransactionIds" text,
        "notes" text,
        "verifiedByUserId" integer NOT NULL,
        CONSTRAINT "PK_mpesa_verification" PRIMARY KEY ("id")
      )
    `);

    // Create index for mpesa_verification
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_mpesa_verification_channel_session" 
      ON "mpesa_verification" ("channelId", "sessionId")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_mpesa_verification_channel_session"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "mpesa_verification"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_cash_drawer_count_pending_reviews"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_cash_drawer_count_channel_session"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "cash_drawer_count"`);
  }
}


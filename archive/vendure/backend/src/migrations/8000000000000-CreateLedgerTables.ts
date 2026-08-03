import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Create Ledger Tables
 *
 * Merges:
 * - 1765000000000-CreateLedgerTables.ts
 * - 1765000000001-AlignStockConstraints.ts (only ledger-related parts)
 * - 1765000000002-FixLedgerSchemaDiff.ts
 *
 * Final state:
 * - All ledger tables with correct constraints and indexes
 * - Legacy indexes/constraints dropped
 */
export class CreateLedgerTables8000000000000 implements MigrationInterface {
  name = 'CreateLedgerTables8000000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Ensure pgcrypto extension
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS pgcrypto;`);

    // Create ledger_account table
    await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS "ledger_account" (
                "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
                "channelId" integer NOT NULL,
                "code" varchar(64) NOT NULL,
                "name" varchar(256) NOT NULL,
                "type" varchar(16) NOT NULL,
                "isActive" boolean NOT NULL DEFAULT true
            )
        `);

    // Create unique index for ledger_account
    await queryRunner.query(`
            CREATE UNIQUE INDEX IF NOT EXISTS "IDX_e9a270270815811eeca8b2ed5c" 
            ON "ledger_account" ("channelId","code")
        `);

    // Create ledger_journal_entry table
    await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS "ledger_journal_entry" (
                "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
                "channelId" integer NOT NULL,
                "entryDate" date NOT NULL,
                "postedAt" timestamp NOT NULL DEFAULT now(),
                "sourceType" varchar(64) NOT NULL,
                "sourceId" varchar(64) NOT NULL,
                "status" varchar(16) NOT NULL DEFAULT 'posted',
                "reversalOf" uuid NULL,
                "memo" text NULL
            )
        `);

    // Add unique constraint on journal_entry source
    await queryRunner.query(`
            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM pg_constraint WHERE conname = 'uq_journal_entry_source'
                ) THEN
                    ALTER TABLE "ledger_journal_entry"
                    ADD CONSTRAINT "uq_journal_entry_source" UNIQUE ("channelId","sourceType","sourceId");
                END IF;
            END $$;
        `);

    // Create ledger_journal_line table
    await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS "ledger_journal_line" (
                "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
                "entryId" uuid NOT NULL,
                "accountId" uuid NOT NULL,
                "channelId" integer NOT NULL,
                "debit" bigint NOT NULL DEFAULT 0,
                "credit" bigint NOT NULL DEFAULT 0,
                "meta" jsonb NULL
            )
        `);

    // Create index for journal_line
    await queryRunner.query(`
            CREATE INDEX IF NOT EXISTS "IDX_f9cd7e4e7ad494c04ac5fc2524" 
            ON "ledger_journal_line" ("entryId")
        `);

    // Add FK constraints for journal_line
    await queryRunner.query(`
            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM pg_constraint WHERE conname = 'FK_f9cd7e4e7ad494c04ac5fc25244'
                ) THEN
                    ALTER TABLE "ledger_journal_line"
                    ADD CONSTRAINT "FK_f9cd7e4e7ad494c04ac5fc25244"
                    FOREIGN KEY ("entryId") REFERENCES "ledger_journal_entry"("id") 
                    ON DELETE CASCADE ON UPDATE NO ACTION;
                END IF;
            END $$;
        `);

    await queryRunner.query(`
            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM pg_constraint WHERE conname = 'FK_185fa35d92d3dc5aebc6c6e284c'
                ) THEN
                    ALTER TABLE "ledger_journal_line"
                    ADD CONSTRAINT "FK_185fa35d92d3dc5aebc6c6e284c"
                    FOREIGN KEY ("accountId") REFERENCES "ledger_account"("id") 
                    ON DELETE RESTRICT ON UPDATE NO ACTION;
                END IF;
            END $$;
        `);

    // Create money_event table
    await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS "money_event" (
                "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
                "channelId" integer NOT NULL,
                "eventDate" date NOT NULL,
                "type" varchar(64) NOT NULL,
                "amount" bigint NOT NULL,
                "paymentMethodCode" varchar(64) NULL,
                "cashierSessionId" uuid NULL,
                "sourceType" varchar(64) NOT NULL,
                "sourceId" varchar(64) NOT NULL,
                "memo" text NULL,
                "postedByUserId" integer NULL,
                "reversalOf" uuid NULL,
                "auditId" uuid NULL
            )
        `);

    // Add unique constraint on money_event source
    await queryRunner.query(`
            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM pg_constraint WHERE conname = 'uq_money_event_source'
                ) THEN
                    ALTER TABLE "money_event"
                    ADD CONSTRAINT "uq_money_event_source" UNIQUE ("channelId","sourceType","sourceId");
                END IF;
            END $$;
        `);

    // Create cashier_session table
    await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS "cashier_session" (
                "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
                "channelId" integer NOT NULL,
                "cashierUserId" integer NOT NULL,
                "openedAt" timestamp NOT NULL,
                "closedAt" timestamp NULL,
                "openingFloat" bigint NOT NULL DEFAULT 0,
                "closingDeclared" bigint NOT NULL DEFAULT 0,
                "status" varchar(16) NOT NULL DEFAULT 'open'
            )
        `);

    await queryRunner.query(`
            CREATE INDEX IF NOT EXISTS "IDX_2bfa5e2744f391a3887f3d82c4" 
            ON "cashier_session" ("channelId","openedAt")
        `);

    // Create reconciliation table
    await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS "reconciliation" (
                "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
                "channelId" integer NOT NULL,
                "scope" varchar(32) NOT NULL,
                "scopeRefId" varchar(64) NOT NULL,
                "rangeStart" date NOT NULL,
                "rangeEnd" date NOT NULL,
                "status" varchar(16) NOT NULL DEFAULT 'draft',
                "externalRef" varchar(128) NULL,
                "varianceAmount" bigint NOT NULL DEFAULT 0,
                "notes" text NULL,
                "createdBy" integer NOT NULL,
                "reviewedBy" integer NULL
            )
        `);

    await queryRunner.query(`
            CREATE INDEX IF NOT EXISTS "IDX_4baeb5137224fe3eef32c75b66" 
            ON "reconciliation" ("channelId","rangeStart","rangeEnd")
        `);

    // Create period_lock table
    await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS "period_lock" (
                "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
                "channelId" integer NOT NULL,
                "lockEndDate" date NULL,
                "lockedByUserId" integer NULL,
                "lockedAt" timestamp NULL
            )
        `);

    // Add unique constraint on period_lock
    await queryRunner.query(`
            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM pg_constraint WHERE conname = 'UQ_0a2327f3ce9a3e0335d62b02380'
                ) THEN
                    ALTER TABLE "period_lock"
                    ADD CONSTRAINT "UQ_0a2327f3ce9a3e0335d62b02380" UNIQUE ("channelId");
                END IF;
            END $$;
        `);

    // Drop legacy indexes/constraints if they exist
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_ledger_account_channel_code"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_journal_line_entry"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_journal_entry_source"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_period_lock_channel"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_money_event_source"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_cashier_session_opened"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_recon_range"`);
    await queryRunner.query(
      `ALTER TABLE "ledger_journal_line" DROP CONSTRAINT IF EXISTS "FK_line_account"`
    );
    await queryRunner.query(
      `ALTER TABLE "ledger_journal_line" DROP CONSTRAINT IF EXISTS "FK_line_entry"`
    );

    // Seed minimal accounts for channel 1
    await queryRunner.query(`
            INSERT INTO "ledger_account" ("channelId","code","name","type","isActive") VALUES
                (1,'CASH_ON_HAND','Cash on Hand','asset',true),
                (1,'BANK_MAIN','Bank - Main','asset',true),
                (1,'CLEARING_MPESA','Clearing - M-Pesa','asset',true),
                (1,'CLEARING_CREDIT','Clearing - Customer Credit','asset',true),
                (1,'CLEARING_GENERIC','Clearing - Generic','asset',true),
                (1,'SALES','Sales Revenue','income',true),
                (1,'SALES_RETURNS','Sales Returns','income',true),
                (1,'TAX_PAYABLE','Taxes Payable','liability',true),
                (1,'PROCESSOR_FEES','Payment Processor Fees','expense',true),
                (1,'CASH_SHORT_OVER','Cash Short/Over','expense',true)
            ON CONFLICT ("channelId","code") DO NOTHING
        `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "period_lock"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "reconciliation"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "cashier_session"`);
    await queryRunner.query(
      `ALTER TABLE IF EXISTS "money_event" DROP CONSTRAINT IF EXISTS "uq_money_event_source"`
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "money_event"`);
    await queryRunner.query(
      `ALTER TABLE IF EXISTS "ledger_journal_line" DROP CONSTRAINT IF EXISTS "FK_f9cd7e4e7ad494c04ac5fc25244"`
    );
    await queryRunner.query(
      `ALTER TABLE IF EXISTS "ledger_journal_line" DROP CONSTRAINT IF EXISTS "FK_185fa35d92d3dc5aebc6c6e284c"`
    );
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_f9cd7e4e7ad494c04ac5fc2524"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "ledger_journal_line"`);
    await queryRunner.query(
      `ALTER TABLE IF EXISTS "ledger_journal_entry" DROP CONSTRAINT IF EXISTS "uq_journal_entry_source"`
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "ledger_journal_entry"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_e9a270270815811eeca8b2ed5c"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "ledger_account"`);
  }
}

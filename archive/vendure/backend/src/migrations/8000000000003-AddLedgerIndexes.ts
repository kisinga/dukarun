import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Add Ledger Indexes
 *
 * Merges:
 * - 1766000200000-AddLedgerIndexes.ts
 * - 1766000500000-EnsureGinIndexes.ts
 * - 1766000600000-SyncGinIndexes.ts
 *
 * Final state:
 * - All ledger performance indexes (regular and GIN)
 */
export class AddLedgerIndexes8000000000003 implements MigrationInterface {
  name = 'AddLedgerIndexes8000000000003';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Regular indexes for ledger queries
    await queryRunner.query(`
            DROP INDEX IF EXISTS "IDX_journal_line_account_channel_date";
        `);
    await queryRunner.query(`
            CREATE INDEX IF NOT EXISTS "IDX_journal_line_account_channel_date" 
            ON "ledger_journal_line" ("accountId", "channelId")
        `);

    await queryRunner.query(`
            DROP INDEX IF EXISTS "IDX_journal_entry_channel_date";
        `);
    await queryRunner.query(`
            CREATE INDEX IF NOT EXISTS "IDX_journal_entry_channel_date" 
            ON "ledger_journal_entry" ("channelId", "entryDate")
        `);

    // GIN indexes for JSONB meta queries (TypeORM can't define these)
    await queryRunner.query(`
            DROP INDEX IF EXISTS "IDX_journal_line_meta_customer";
        `);
    await queryRunner.query(`
            CREATE INDEX IF NOT EXISTS "IDX_journal_line_meta_customer" 
            ON "ledger_journal_line" USING GIN ("meta" jsonb_path_ops)
            WHERE "meta"->>'customerId' IS NOT NULL
        `);

    await queryRunner.query(`
            DROP INDEX IF EXISTS "IDX_journal_line_meta_supplier";
        `);
    await queryRunner.query(`
            CREATE INDEX IF NOT EXISTS "IDX_journal_line_meta_supplier" 
            ON "ledger_journal_line" USING GIN ("meta" jsonb_path_ops)
            WHERE "meta"->>'supplierId' IS NOT NULL
        `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_journal_line_meta_supplier"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_journal_line_meta_customer"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_journal_entry_channel_date"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_journal_line_account_channel_date"`);
  }
}

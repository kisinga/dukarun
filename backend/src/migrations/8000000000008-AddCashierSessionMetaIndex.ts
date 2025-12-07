import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Add Cashier Session Meta Index
 *
 * Adds a GIN index on the ledger_journal_line meta field for cashierSessionId.
 * This enables efficient filtering of journal lines by cashier session
 * for reconciliation workflows.
 */
export class AddCashierSessionMetaIndex8000000000008 implements MigrationInterface {
  name = 'AddCashierSessionMetaIndex8000000000008';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // GIN index for cashierSessionId queries in journal line meta
    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_journal_line_meta_cashier_session";
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_journal_line_meta_cashier_session" 
      ON "ledger_journal_line" USING GIN ("meta" jsonb_path_ops)
      WHERE "meta"->>'cashierSessionId' IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_journal_line_meta_cashier_session"`);
  }
}








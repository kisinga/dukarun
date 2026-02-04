import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Rename cashierSessionId to openSessionId in journal line meta
 *
 * - Migrates existing meta JSONB: cashierSessionId -> openSessionId
 * - Replaces GIN index to use openSessionId for session-scoped queries
 */
export class RenameCashierSessionIdToOpenSessionId8000000000012 implements MigrationInterface {
  name = 'RenameCashierSessionIdToOpenSessionId8000000000012';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Migrate existing journal line meta: copy cashierSessionId to openSessionId, remove old key
    await queryRunner.query(`
      UPDATE "ledger_journal_line"
      SET "meta" = jsonb_set(
        "meta" - 'cashierSessionId',
        '{openSessionId}',
        "meta"->'cashierSessionId'
      )
      WHERE "meta" ? 'cashierSessionId'
    `);

    // Drop old index and create new one for openSessionId
    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_journal_line_meta_cashier_session"
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_journal_line_meta_open_session"
      ON "ledger_journal_line" USING GIN ("meta" jsonb_path_ops)
      WHERE "meta"->>'openSessionId' IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_journal_line_meta_open_session"
    `);

    // Revert meta: openSessionId -> cashierSessionId
    await queryRunner.query(`
      UPDATE "ledger_journal_line"
      SET "meta" = jsonb_set(
        "meta" - 'openSessionId',
        '{cashierSessionId}',
        "meta"->'openSessionId'
      )
      WHERE "meta" ? 'openSessionId'
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_journal_line_meta_cashier_session"
      ON "ledger_journal_line" USING GIN ("meta" jsonb_path_ops)
      WHERE "meta"->>'cashierSessionId' IS NOT NULL
    `);
  }
}

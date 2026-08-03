import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Expand ledger_journal_entry.sourceId from varchar(64) to varchar(128).
 * Composite sourceIds (e.g. sessionId-accountCode-countId for variance-adjustment) can exceed 64 chars.
 */
export class ExpandJournalEntrySourceIdLength8000000000018 implements MigrationInterface {
  name = 'ExpandJournalEntrySourceIdLength8000000000018';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "ledger_journal_entry"
      ALTER COLUMN "sourceId" TYPE varchar(128)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "ledger_journal_entry"
      ALTER COLUMN "sourceId" TYPE varchar(64)
    `);
  }
}

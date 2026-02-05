import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Add isSystemAccount to ledger_account. System accounts (clearing, short/over) are not manually adjusted in reconciliation.
 */
export class AddIsSystemAccountToLedgerAccount8000000000019 implements MigrationInterface {
  name = 'AddIsSystemAccountToLedgerAccount8000000000019';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "ledger_account"
      ADD COLUMN "isSystemAccount" boolean NOT NULL DEFAULT false
    `);
    await queryRunner.query(`
      UPDATE "ledger_account"
      SET "isSystemAccount" = true
      WHERE "code" IN ('CLEARING_MPESA', 'CLEARING_CREDIT', 'CLEARING_GENERIC', 'CASH_SHORT_OVER')
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "ledger_account"
      DROP COLUMN IF EXISTS "isSystemAccount"
    `);
  }
}

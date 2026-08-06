import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Add expectedAmountCents and varianceCents to reconciliation_account for audit and details display.
 * Nullable for existing rows; new reconciliations (cash-session closing and manual) set them.
 */
export class AddExpectedAndVarianceToReconciliationAccount8000000000020 implements MigrationInterface {
  name = 'AddExpectedAndVarianceToReconciliationAccount8000000000020';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "reconciliation_account"
      ADD COLUMN "expectedAmountCents" bigint NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "reconciliation_account"
      ADD COLUMN "varianceCents" bigint NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "reconciliation_account"
      DROP COLUMN IF EXISTS "varianceCents"
    `);
    await queryRunner.query(`
      ALTER TABLE "reconciliation_account"
      DROP COLUMN IF EXISTS "expectedAmountCents"
    `);
  }
}

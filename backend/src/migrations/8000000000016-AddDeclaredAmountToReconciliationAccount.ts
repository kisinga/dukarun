import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Add declaredAmountCents to reconciliation_account for per-account opening/closing amounts.
 * Nullable for existing rows; new opening flow sets it.
 */
export class AddDeclaredAmountToReconciliationAccount8000000000016 implements MigrationInterface {
  name = 'AddDeclaredAmountToReconciliationAccount8000000000016';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "reconciliation_account"
      ADD COLUMN "declaredAmountCents" bigint NULL
    `);
    await queryRunner.query(`
      UPDATE "reconciliation_account"
      SET "declaredAmountCents" = 0
      WHERE "declaredAmountCents" IS NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "reconciliation_account"
      DROP COLUMN IF EXISTS "declaredAmountCents"
    `);
  }
}

import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Drop openingFloat from cashier_session. Opening is now stored as reconciliation event
 * (reconciliation + reconciliation_account.declaredAmountCents); session opening total is derived.
 */
export class DropOpeningFloatFromCashierSession8000000000017 implements MigrationInterface {
  name = 'DropOpeningFloatFromCashierSession8000000000017';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "cashier_session"
      DROP COLUMN IF EXISTS "openingFloat"
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "cashier_session"
      ADD COLUMN "openingFloat" bigint NOT NULL DEFAULT 0
    `);
  }
}

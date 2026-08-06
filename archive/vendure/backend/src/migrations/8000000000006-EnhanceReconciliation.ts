import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Enhance Reconciliation Table
 *
 * Adds expectedBalance and actualBalance columns to reconciliation table.
 */
export class EnhanceReconciliation8000000000006 implements MigrationInterface {
  name = 'EnhanceReconciliation8000000000006';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add expectedBalance column (nullable bigint)
    await queryRunner.query(`
      ALTER TABLE "reconciliation"
      ADD COLUMN IF NOT EXISTS "expectedBalance" bigint NULL
    `);

    // Add actualBalance column (nullable bigint)
    await queryRunner.query(`
      ALTER TABLE "reconciliation"
      ADD COLUMN IF NOT EXISTS "actualBalance" bigint NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "reconciliation"
      DROP COLUMN IF EXISTS "actualBalance"
    `);

    await queryRunner.query(`
      ALTER TABLE "reconciliation"
      DROP COLUMN IF EXISTS "expectedBalance"
    `);
  }
}

import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Add Account Hierarchy
 *
 * Adds parentAccountId and isParent columns to support hierarchical account structure.
 * All cash-based payment methods will be sub-accounts under a CASH parent account.
 */
export class AddAccountHierarchy8000000000004 implements MigrationInterface {
  name = 'AddAccountHierarchy8000000000004';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add parentAccountId column (nullable UUID)
    // Note: No FK constraint - TypeORM doesn't create FKs for plain columns without @ManyToOne
    // The relationship is enforced at application level
    await queryRunner.query(`
      ALTER TABLE "ledger_account"
      ADD COLUMN IF NOT EXISTS "parentAccountId" uuid NULL
    `);

    // Add isParent column (boolean, default false)
    await queryRunner.query(`
      ALTER TABLE "ledger_account"
      ADD COLUMN IF NOT EXISTS "isParent" boolean NOT NULL DEFAULT false
    `);

    // Index will be created by TypeORM from @Index decorator in entity
    // No need to create it here - TypeORM will handle it
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop index (TypeORM will drop it automatically, but include for safety)
    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_ledger_account_parentAccountId"
    `);

    // Drop columns
    await queryRunner.query(`
      ALTER TABLE "ledger_account"
      DROP COLUMN IF EXISTS "isParent"
    `);

    await queryRunner.query(`
      ALTER TABLE "ledger_account"
      DROP COLUMN IF EXISTS "parentAccountId"
    `);
  }
}

import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Create reconciliation_account junction table
 *
 * Defines which accounts each reconciliation covers (freeze-frame scope).
 * FKs enforce referential integrity; no raw account codes as source of truth.
 */
export class CreateReconciliationAccountTable8000000000015 implements MigrationInterface {
  name = 'CreateReconciliationAccountTable8000000000015';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "reconciliation_account" (
        "reconciliationId" uuid NOT NULL,
        "accountId" uuid NOT NULL,
        CONSTRAINT "PK_reconciliation_account" PRIMARY KEY ("reconciliationId", "accountId"),
        CONSTRAINT "FK_reconciliation_account_reconciliation" FOREIGN KEY ("reconciliationId")
          REFERENCES "reconciliation"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT "FK_reconciliation_account_account" FOREIGN KEY ("accountId")
          REFERENCES "ledger_account"("id") ON DELETE RESTRICT ON UPDATE NO ACTION
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_reconciliation_account_reconciliationId" ON "reconciliation_account" ("reconciliationId")`
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_reconciliation_account_accountId" ON "reconciliation_account" ("accountId")`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "reconciliation_account"`);
  }
}

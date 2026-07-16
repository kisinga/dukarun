import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Add dueDate to stock_purchase so AP aging can be filtered and displayed
 * without recomputing supplier credit duration on every read.
 */
export class AddPurchaseDueDate9990000000006 implements MigrationInterface {
  name = 'AddPurchaseDueDate9990000000006';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "stock_purchase"
      ADD COLUMN IF NOT EXISTS "dueDate" TIMESTAMP NULL;
    `);

    // Backfill existing credit purchases using each supplier's credit duration.
    // Vendure stores custom fields as physical columns, not JSON.
    await queryRunner.query(`
      UPDATE "stock_purchase" p
      SET "dueDate" = p."purchaseDate" + (
        COALESCE(NULLIF(c."customFieldsSuppliercreditduration", 0), 30) || ' days'
      )::interval
      FROM "customer" c
      WHERE p."supplierId" = c.id
        AND p."isCreditPurchase" = true
        AND p."dueDate" IS NULL;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "stock_purchase"
      DROP COLUMN IF EXISTS "dueDate";
    `);
  }
}

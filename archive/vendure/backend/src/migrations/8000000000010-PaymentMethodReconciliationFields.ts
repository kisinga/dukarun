import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration: PaymentMethodReconciliationFields
 *
 * Adds custom fields to PaymentMethod for reconciliation configuration:
 * - reconciliationType: 'blind_count' | 'transaction_verification' | 'statement_match' | 'none'
 * - ledgerAccountCode: Account code for ledger postings
 * - isCashierControlled: Include in cashier session reconciliation
 * - requiresReconciliation: Must be reconciled before period close
 *
 * Backfills existing payment methods with defaults based on handler code.
 */
export class PaymentMethodReconciliationFields8000000000010 implements MigrationInterface {
  name = 'PaymentMethodReconciliationFields8000000000010';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Check if columns already exist (idempotent)
    const hasReconciliationType = await this.columnExists(
      queryRunner,
      'payment_method',
      'customFieldsReconciliationtype'
    );

    if (!hasReconciliationType) {
      // Add reconciliationType column
      await queryRunner.query(`
        ALTER TABLE "payment_method"
        ADD COLUMN IF NOT EXISTS "customFieldsReconciliationtype" character varying(32) DEFAULT 'none'
      `);
    }

    const hasLedgerAccountCode = await this.columnExists(
      queryRunner,
      'payment_method',
      'customFieldsLedgeraccountcode'
    );

    if (!hasLedgerAccountCode) {
      // Add ledgerAccountCode column
      await queryRunner.query(`
        ALTER TABLE "payment_method"
        ADD COLUMN IF NOT EXISTS "customFieldsLedgeraccountcode" character varying(64)
      `);
    }

    const hasIsCashierControlled = await this.columnExists(
      queryRunner,
      'payment_method',
      'customFieldsIscashiercontrolled'
    );

    if (!hasIsCashierControlled) {
      // Add isCashierControlled column
      await queryRunner.query(`
        ALTER TABLE "payment_method"
        ADD COLUMN IF NOT EXISTS "customFieldsIscashiercontrolled" boolean DEFAULT false
      `);
    }

    const hasRequiresReconciliation = await this.columnExists(
      queryRunner,
      'payment_method',
      'customFieldsRequiresreconciliation'
    );

    if (!hasRequiresReconciliation) {
      // Add requiresReconciliation column
      await queryRunner.query(`
        ALTER TABLE "payment_method"
        ADD COLUMN IF NOT EXISTS "customFieldsRequiresreconciliation" boolean DEFAULT true
      `);
    }

    // Backfill existing payment methods with defaults based on code prefix
    // Cash payment methods (code starts with 'cash')
    await queryRunner.query(`
      UPDATE "payment_method"
      SET
        "customFieldsReconciliationtype" = 'blind_count',
        "customFieldsLedgeraccountcode" = 'CASH_ON_HAND',
        "customFieldsIscashiercontrolled" = true,
        "customFieldsRequiresreconciliation" = true
      WHERE "code" LIKE 'cash-%'
        AND ("customFieldsReconciliationtype" IS NULL OR "customFieldsReconciliationtype" = 'none')
    `);

    // M-Pesa payment methods (code starts with 'mpesa')
    await queryRunner.query(`
      UPDATE "payment_method"
      SET
        "customFieldsReconciliationtype" = 'transaction_verification',
        "customFieldsLedgeraccountcode" = 'CLEARING_MPESA',
        "customFieldsIscashiercontrolled" = true,
        "customFieldsRequiresreconciliation" = true
      WHERE "code" LIKE 'mpesa-%'
        AND ("customFieldsReconciliationtype" IS NULL OR "customFieldsReconciliationtype" = 'none')
    `);

    // Credit payment methods (code starts with 'credit')
    await queryRunner.query(`
      UPDATE "payment_method"
      SET
        "customFieldsReconciliationtype" = 'none',
        "customFieldsLedgeraccountcode" = 'CLEARING_CREDIT',
        "customFieldsIscashiercontrolled" = false,
        "customFieldsRequiresreconciliation" = false
      WHERE "code" LIKE 'credit-%'
        AND ("customFieldsReconciliationtype" IS NULL OR "customFieldsReconciliationtype" = 'none')
    `);

    // Index for efficient queries by reconciliation type
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_payment_method_reconciliation_type"
      ON "payment_method" ("customFieldsReconciliationtype")
      WHERE "customFieldsReconciliationtype" IS NOT NULL
    `);

    // Index for cashier-controlled payment methods
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_payment_method_cashier_controlled"
      ON "payment_method" ("customFieldsIscashiercontrolled")
      WHERE "customFieldsIscashiercontrolled" = true
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop indexes
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_payment_method_cashier_controlled"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_payment_method_reconciliation_type"`);

    // Drop columns (if they exist)
    await queryRunner.query(`
      ALTER TABLE "payment_method"
      DROP COLUMN IF EXISTS "customFieldsRequiresreconciliation"
    `);
    await queryRunner.query(`
      ALTER TABLE "payment_method"
      DROP COLUMN IF EXISTS "customFieldsIscashiercontrolled"
    `);
    await queryRunner.query(`
      ALTER TABLE "payment_method"
      DROP COLUMN IF EXISTS "customFieldsLedgeraccountcode"
    `);
    await queryRunner.query(`
      ALTER TABLE "payment_method"
      DROP COLUMN IF EXISTS "customFieldsReconciliationtype"
    `);
  }

  /**
   * Check if a column exists in a table
   */
  private async columnExists(
    queryRunner: QueryRunner,
    tableName: string,
    columnName: string
  ): Promise<boolean> {
    const result = await queryRunner.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = $1
        AND column_name = $2
    `, [tableName, columnName.toLowerCase()]);

    return result.length > 0;
  }
}


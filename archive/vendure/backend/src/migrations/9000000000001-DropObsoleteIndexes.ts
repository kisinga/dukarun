import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Drop Obsolete Indexes
 *
 * Drops indexes that are no longer needed in the current schema configuration.
 * These indexes may have been created in previous migrations but are now
 * obsolete due to schema changes or optimization decisions.
 *
 * This migration is idempotent and safe to run multiple times.
 */
export class DropObsoleteIndexes9000000000001 implements MigrationInterface {
  name = 'DropObsoleteIndexes9000000000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Drop payment method indexes
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_payment_method_reconciliation_type"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_payment_method_cashier_controlled"`);

    // Drop cash drawer count indexes
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_cash_drawer_count_channel_session"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_cash_drawer_count_pending_reviews"`);

    // Drop M-Pesa verification index
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_mpesa_verification_channel_session"`);

    // Drop journal line meta cashier session index
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_journal_line_meta_cashier_session"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Recreate indexes if needed (reverse operations)
    // Note: These indexes are intentionally not recreated as they are obsolete
    // If rollback is needed, the indexes would need to be recreated based on
    // the original migration that created them, but since they're obsolete,
    // we don't recreate them here.
  }
}

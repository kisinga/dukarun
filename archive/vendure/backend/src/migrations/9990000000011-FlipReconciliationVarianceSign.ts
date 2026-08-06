import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Flip the sign of historical reconciliation.varianceAmount rows.
 *
 * Previously every writer (financial reconciliation, inventory reconciliation) stored
 * header variance as expected - actual. The unified convention is now declared - expected
 * (positive = overage, negative = shortage), matching the per-account varianceCents rows
 * shown alongside in the reconciliation history UI. All rows written before this
 * migration used the old convention, so they are negated here.
 *
 * Note: cash_drawer_count.variance rows are intentionally left alone — those were
 * computed against session-scoped expected (a scope change, not just a sign flip) and
 * cannot be corrected by negation.
 *
 * Idempotent in effect only if run once: running up() twice would re-flip. TypeORM's
 * migrations table prevents that.
 */
export class FlipReconciliationVarianceSign9990000000011 implements MigrationInterface {
  name = 'FlipReconciliationVarianceSign9990000000011';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const hasTable = await queryRunner.query(
      `SELECT 1 FROM information_schema.tables WHERE table_schema = current_schema() AND table_name = 'reconciliation'`
    );
    if (!Array.isArray(hasTable) || hasTable.length === 0) {
      return;
    }

    await queryRunner.query(
      `UPDATE "reconciliation" SET "varianceAmount" = -"varianceAmount" WHERE "varianceAmount" <> 0`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const hasTable = await queryRunner.query(
      `SELECT 1 FROM information_schema.tables WHERE table_schema = current_schema() AND table_name = 'reconciliation'`
    );
    if (!Array.isArray(hasTable) || hasTable.length === 0) {
      return;
    }

    // Negating again restores the old-convention values for rows that existed before up().
    await queryRunner.query(
      `UPDATE "reconciliation" SET "varianceAmount" = -"varianceAmount" WHERE "varianceAmount" <> 0`
    );
  }
}

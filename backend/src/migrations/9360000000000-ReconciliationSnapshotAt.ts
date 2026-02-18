import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Replace reconciliation range (rangeStart, rangeEnd) with single snapshot date (snapshotAt).
 * Reconciliation is a snapshot at one point in time.
 */
export class ReconciliationSnapshotAt9360000000000 implements MigrationInterface {
  name = 'ReconciliationSnapshotAt9360000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add snapshotAt with backfill from existing range
    await queryRunner.query(`
      ALTER TABLE "reconciliation"
      ADD COLUMN IF NOT EXISTS "snapshotAt" date NULL
    `);
    await queryRunner.query(`
      UPDATE "reconciliation"
      SET "snapshotAt" = COALESCE("rangeStart", "rangeEnd", CURRENT_DATE)
      WHERE "snapshotAt" IS NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "reconciliation"
      ALTER COLUMN "snapshotAt" SET NOT NULL
    `);

    // Drop old index and range columns
    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_4baeb5137224fe3eef32c75b66"
    `);
    await queryRunner.query(`
      ALTER TABLE "reconciliation"
      DROP COLUMN IF EXISTS "rangeStart"
    `);
    await queryRunner.query(`
      ALTER TABLE "reconciliation"
      DROP COLUMN IF EXISTS "rangeEnd"
    `);

    // Index for list/ordering by channel and snapshot date
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_reconciliation_channelId_snapshotAt"
      ON "reconciliation" ("channelId", "snapshotAt")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_reconciliation_channelId_snapshotAt"
    `);
    await queryRunner.query(`
      ALTER TABLE "reconciliation"
      ADD COLUMN IF NOT EXISTS "rangeStart" date NULL,
      ADD COLUMN IF NOT EXISTS "rangeEnd" date NULL
    `);
    await queryRunner.query(`
      UPDATE "reconciliation"
      SET "rangeStart" = "snapshotAt", "rangeEnd" = "snapshotAt"
      WHERE "rangeStart" IS NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "reconciliation"
      ALTER COLUMN "rangeStart" SET NOT NULL,
      ALTER COLUMN "rangeEnd" SET NOT NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "reconciliation"
      DROP COLUMN IF EXISTS "snapshotAt"
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_4baeb5137224fe3eef32c75b66"
      ON "reconciliation" ("channelId","rangeStart","rangeEnd")
    `);
  }
}

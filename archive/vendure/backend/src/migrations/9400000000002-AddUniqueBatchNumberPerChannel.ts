import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Enforce unique batchNumber per channel when provided.
 *
 * Idempotent per MIGRATION_GUIDELINES.md: CREATE UNIQUE INDEX IF NOT EXISTS.
 * Renamed from 9390000000003 to force rerun on this server and upstream.
 */
export class AddUniqueBatchNumberPerChannel9400000000002 implements MigrationInterface {
  name = 'AddUniqueBatchNumberPerChannel9400000000002';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_inventory_batch_channel_batchNumber"
      ON "inventory_batch" ("channelId", "batchNumber")
      WHERE "batchNumber" IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS "UQ_inventory_batch_channel_batchNumber"
    `);
  }
}

import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Create ML Extraction Queue
 *
 * Merges:
 * - 1760540000003-CreateMlExtractionQueueTable.ts
 *
 * Final state:
 * - ml_extraction_queue table with created_at, updated_at (keeping functional timestamps)
 */
export class CreateMlExtractionQueue6000000000000 implements MigrationInterface {
  name = 'CreateMlExtractionQueue6000000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS "ml_extraction_queue" (
                "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
                "channel_id" character varying(255) NOT NULL,
                "scheduled_at" TIMESTAMP NOT NULL,
                "status" character varying(50) NOT NULL DEFAULT 'pending',
                "created_at" TIMESTAMP NOT NULL DEFAULT NOW(),
                "updated_at" TIMESTAMP NOT NULL DEFAULT NOW(),
                "error" text
            )
        `);

    await queryRunner.query(`
            CREATE INDEX IF NOT EXISTS "idx_ml_extraction_queue_channel_id" 
            ON "ml_extraction_queue" ("channel_id")
        `);

    await queryRunner.query(`
            CREATE INDEX IF NOT EXISTS "idx_ml_extraction_queue_status_scheduled" 
            ON "ml_extraction_queue" ("status", "scheduled_at")
        `);

    await queryRunner.query(`
            CREATE INDEX IF NOT EXISTS "idx_ml_extraction_queue_created_at" 
            ON "ml_extraction_queue" ("created_at")
        `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_ml_extraction_queue_created_at"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_ml_extraction_queue_status_scheduled"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_ml_extraction_queue_channel_id"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "ml_extraction_queue"`);
  }
}

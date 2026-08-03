import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Drop the decommissioned Channel ML-training custom fields and the ml_extraction_queue table.
 *
 * Supersedes the additive migrations (which stay immutable as history):
 *   - 1000000000002-AddChannelMlTrainingFields      (mltrainingstatus / progress / productcount / imagecount)
 *   - 1000000000011-AddChannelMlTrainingQueueFields  (mltrainingqueuedat / lasttrainedat)
 *   - 1000000000007-AddChannelAssetRelationships     (mlmodeljson / bin / metadata asset FK columns)
 *   - 6000000000000-CreateMlExtractionQueue          (ml_extraction_queue table + indexes)
 *
 * The on-device recognition pipeline replaces the old Teachable-Machine training pipeline; these
 * fields/table hold only dead training state. Every statement is guarded with IF EXISTS so it is safe
 * to run whether or not each object is present — `mlTrainingStartedAt` / `mlTrainingError` never had an
 * additive migration (they existed only via Vendure auto-synchronize) and are dropped here too.
 *
 * NOT touched: companyLogoAsset (customFieldsCompanylogoassetid + FK_33e2e4ec9896bb0edf7bdab0cbc) and
 * the Product embedding columns customFieldsMlembedding / customFieldsMlembeddingversion (migration
 * 9700000000000). This migration is scoped strictly to the "channel" table + the ml_extraction_queue.
 */
export class DropChannelMlTrainingFields9800000000000 implements MigrationInterface {
  name = 'DropChannelMlTrainingFields9800000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'channel') THEN
          -- Drop the asset-relation FK constraints before their columns (mirrors 1000000000007 down()).
          ALTER TABLE "channel" DROP CONSTRAINT IF EXISTS "FK_209b14074b96d505fce431f7841";
          ALTER TABLE "channel" DROP CONSTRAINT IF EXISTS "FK_30369133482d7e7f8759cb833e5";
          ALTER TABLE "channel" DROP CONSTRAINT IF EXISTS "FK_8e0c8b4ebd7bbc9eee0aeb1db25";

          -- Asset-relation columns (mlModelJsonAsset / mlModelBinAsset / mlMetadataAsset).
          ALTER TABLE "channel" DROP COLUMN IF EXISTS "customFieldsMlmodeljsonassetid";
          ALTER TABLE "channel" DROP COLUMN IF EXISTS "customFieldsMlmodelbinassetid";
          ALTER TABLE "channel" DROP COLUMN IF EXISTS "customFieldsMlmetadataassetid";

          -- Scalar training-state columns.
          ALTER TABLE "channel" DROP COLUMN IF EXISTS "customFieldsMltrainingstatus";
          ALTER TABLE "channel" DROP COLUMN IF EXISTS "customFieldsMltrainingprogress";
          ALTER TABLE "channel" DROP COLUMN IF EXISTS "customFieldsMltrainingstartedat";
          ALTER TABLE "channel" DROP COLUMN IF EXISTS "customFieldsMltrainingerror";
          ALTER TABLE "channel" DROP COLUMN IF EXISTS "customFieldsMltrainingqueuedat";
          ALTER TABLE "channel" DROP COLUMN IF EXISTS "customFieldsMllasttrainedat";
          ALTER TABLE "channel" DROP COLUMN IF EXISTS "customFieldsMlproductcount";
          ALTER TABLE "channel" DROP COLUMN IF EXISTS "customFieldsMlimagecount";
        END IF;
      END $$;
    `);

    // Drop the ML extraction queue (indexes first, then table) — mirrors 6000000000000 down().
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_ml_extraction_queue_created_at"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_ml_extraction_queue_status_scheduled"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_ml_extraction_queue_channel_id"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "ml_extraction_queue"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Best-effort schema restore (nullable columns, no defaults) so the migration is reversible at the
    // schema level. The training pipeline that populated these is gone, so no data is restored. Recreates
    // only what the additive migrations created (not the auto-synced startedAt/error columns).
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'channel') THEN
          ALTER TABLE "channel" ADD COLUMN IF NOT EXISTS "customFieldsMlmodeljsonassetid" integer;
          ALTER TABLE "channel" ADD COLUMN IF NOT EXISTS "customFieldsMlmodelbinassetid" integer;
          ALTER TABLE "channel" ADD COLUMN IF NOT EXISTS "customFieldsMlmetadataassetid" integer;
          ALTER TABLE "channel" ADD COLUMN IF NOT EXISTS "customFieldsMltrainingstatus" character varying;
          ALTER TABLE "channel" ADD COLUMN IF NOT EXISTS "customFieldsMltrainingprogress" integer;
          ALTER TABLE "channel" ADD COLUMN IF NOT EXISTS "customFieldsMltrainingqueuedat" timestamp;
          ALTER TABLE "channel" ADD COLUMN IF NOT EXISTS "customFieldsMllasttrainedat" timestamp;
          ALTER TABLE "channel" ADD COLUMN IF NOT EXISTS "customFieldsMlproductcount" integer;
          ALTER TABLE "channel" ADD COLUMN IF NOT EXISTS "customFieldsMlimagecount" integer;

          IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FK_209b14074b96d505fce431f7841') THEN
            ALTER TABLE "channel" ADD CONSTRAINT "FK_209b14074b96d505fce431f7841"
              FOREIGN KEY ("customFieldsMlmodeljsonassetid") REFERENCES "asset"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
          END IF;
          IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FK_30369133482d7e7f8759cb833e5') THEN
            ALTER TABLE "channel" ADD CONSTRAINT "FK_30369133482d7e7f8759cb833e5"
              FOREIGN KEY ("customFieldsMlmodelbinassetid") REFERENCES "asset"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
          END IF;
          IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FK_8e0c8b4ebd7bbc9eee0aeb1db25') THEN
            ALTER TABLE "channel" ADD CONSTRAINT "FK_8e0c8b4ebd7bbc9eee0aeb1db25"
              FOREIGN KEY ("customFieldsMlmetadataassetid") REFERENCES "asset"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
          END IF;
        END IF;
      END $$;
    `);

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
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_ml_extraction_queue_channel_id" ON "ml_extraction_queue" ("channel_id")`
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_ml_extraction_queue_status_scheduled" ON "ml_extraction_queue" ("status", "scheduled_at")`
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_ml_extraction_queue_created_at" ON "ml_extraction_queue" ("created_at")`
    );
  }
}

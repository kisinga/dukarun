import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Add Channel ML Training Queue Fields
 *
 * Adds:
 * - mlTrainingQueuedAt: DateTime field to mark when training is queued
 * - mlLastTrainedAt: DateTime field to track last successful training (for rate limiting)
 */
export class AddChannelMlTrainingQueueFields1000000000011 implements MigrationInterface {
  name = 'AddChannelMlTrainingQueueFields1000000000011';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            DO $$
            BEGIN
                IF EXISTS (
                    SELECT 1 FROM information_schema.tables 
                    WHERE table_name = 'channel'
                ) THEN
                    -- Add mlTrainingQueuedAt field if it doesn't exist
                    IF NOT EXISTS (
                        SELECT 1 FROM information_schema.columns
                        WHERE table_name = 'channel' AND column_name = 'customFieldsMltrainingqueuedat'
                    ) THEN
                        ALTER TABLE "channel" 
                        ADD COLUMN "customFieldsMltrainingqueuedat" timestamp;
                    END IF;

                    -- Add mlLastTrainedAt field if it doesn't exist
                    IF NOT EXISTS (
                        SELECT 1 FROM information_schema.columns
                        WHERE table_name = 'channel' AND column_name = 'customFieldsMllasttrainedat'
                    ) THEN
                        ALTER TABLE "channel" 
                        ADD COLUMN "customFieldsMllasttrainedat" timestamp;
                    END IF;
                END IF;
            END $$;
        `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            DO $$
            BEGIN
                IF EXISTS (
                    SELECT 1 FROM information_schema.tables 
                    WHERE table_name = 'channel'
                ) THEN
                    -- Remove mlTrainingQueuedAt field
                    IF EXISTS (
                        SELECT 1 FROM information_schema.columns
                        WHERE table_name = 'channel' AND column_name = 'customFieldsMltrainingqueuedat'
                    ) THEN
                        ALTER TABLE "channel" 
                        DROP COLUMN "customFieldsMltrainingqueuedat";
                    END IF;

                    -- Remove mlLastTrainedAt field
                    IF EXISTS (
                        SELECT 1 FROM information_schema.columns
                        WHERE table_name = 'channel' AND column_name = 'customFieldsMllasttrainedat'
                    ) THEN
                        ALTER TABLE "channel" 
                        DROP COLUMN "customFieldsMllasttrainedat";
                    END IF;
                END IF;
            END $$;
        `);
  }
}

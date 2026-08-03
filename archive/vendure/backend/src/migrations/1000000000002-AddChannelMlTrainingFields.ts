import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Add Channel ML Training Fields
 *
 * Merges:
 * - 1760540000002-FixMlTrainingFieldsConstraints.ts
 *
 * Final state:
 * - Channel: ML training fields with NOT NULL constraints
 */
export class AddChannelMlTrainingFields1000000000002 implements MigrationInterface {
  name = 'AddChannelMlTrainingFields1000000000002';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            DO $$
            BEGIN
                IF EXISTS (
                    SELECT 1 FROM information_schema.tables 
                    WHERE table_name = 'channel'
                ) THEN
                    -- Add ML training fields if they don't exist
                    IF NOT EXISTS (
                        SELECT 1 FROM information_schema.columns
                        WHERE table_name = 'channel' AND column_name = 'customFieldsMltrainingstatus'
                    ) THEN
                        ALTER TABLE "channel" 
                        ADD COLUMN "customFieldsMltrainingstatus" character varying NOT NULL DEFAULT 'idle';
                    END IF;

                    IF NOT EXISTS (
                        SELECT 1 FROM information_schema.columns
                        WHERE table_name = 'channel' AND column_name = 'customFieldsMltrainingprogress'
                    ) THEN
                        ALTER TABLE "channel" 
                        ADD COLUMN "customFieldsMltrainingprogress" integer NOT NULL DEFAULT 0;
                    END IF;

                    IF NOT EXISTS (
                        SELECT 1 FROM information_schema.columns
                        WHERE table_name = 'channel' AND column_name = 'customFieldsMlproductcount'
                    ) THEN
                        ALTER TABLE "channel" 
                        ADD COLUMN "customFieldsMlproductcount" integer NOT NULL DEFAULT 0;
                    END IF;

                    IF NOT EXISTS (
                        SELECT 1 FROM information_schema.columns
                        WHERE table_name = 'channel' AND column_name = 'customFieldsMlimagecount'
                    ) THEN
                        ALTER TABLE "channel" 
                        ADD COLUMN "customFieldsMlimagecount" integer NOT NULL DEFAULT 0;
                    END IF;

                    -- Set NOT NULL constraints (idempotent - only if column exists and is nullable)
                    IF EXISTS (
                        SELECT 1 FROM information_schema.columns
                        WHERE table_name = 'channel' 
                        AND column_name = 'customFieldsMltrainingstatus'
                        AND is_nullable = 'YES'
                    ) THEN
                        ALTER TABLE "channel" 
                        ALTER COLUMN "customFieldsMltrainingstatus" SET NOT NULL;
                    END IF;

                    IF EXISTS (
                        SELECT 1 FROM information_schema.columns
                        WHERE table_name = 'channel' 
                        AND column_name = 'customFieldsMltrainingprogress'
                        AND is_nullable = 'YES'
                    ) THEN
                        ALTER TABLE "channel" 
                        ALTER COLUMN "customFieldsMltrainingprogress" SET NOT NULL;
                    END IF;

                    IF EXISTS (
                        SELECT 1 FROM information_schema.columns
                        WHERE table_name = 'channel' 
                        AND column_name = 'customFieldsMlproductcount'
                        AND is_nullable = 'YES'
                    ) THEN
                        ALTER TABLE "channel" 
                        ALTER COLUMN "customFieldsMlproductcount" SET NOT NULL;
                    END IF;

                    IF EXISTS (
                        SELECT 1 FROM information_schema.columns
                        WHERE table_name = 'channel' 
                        AND column_name = 'customFieldsMlimagecount'
                        AND is_nullable = 'YES'
                    ) THEN
                        ALTER TABLE "channel" 
                        ALTER COLUMN "customFieldsMlimagecount" SET NOT NULL;
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
                    ALTER TABLE "channel" 
                    DROP COLUMN IF EXISTS "customFieldsMlimagecount";

                    ALTER TABLE "channel" 
                    DROP COLUMN IF EXISTS "customFieldsMlproductcount";

                    ALTER TABLE "channel" 
                    DROP COLUMN IF EXISTS "customFieldsMltrainingprogress";

                    ALTER TABLE "channel" 
                    DROP COLUMN IF EXISTS "customFieldsMltrainingstatus";
                END IF;
            END $$;
        `);
  }
}

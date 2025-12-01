import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Add Channel Cash Control Fields
 *
 * Adds cash control related custom fields to the Channel table:
 * - cashControlEnabled: Enable cash control for the channel
 * - requireOpeningCount: Require opening cash count when starting a session
 * - varianceNotificationThreshold: Minimum variance to trigger manager notification
 */
export class AddChannelCashControlFields8000000000011 implements MigrationInterface {
    name = 'AddChannelCashControlFields8000000000011';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            DO $$
            BEGIN
                -- Add cash control fields to Channel
                IF EXISTS (
                    SELECT 1 FROM information_schema.tables 
                    WHERE table_name = 'channel'
                ) THEN
                    ALTER TABLE "channel" 
                    ADD COLUMN IF NOT EXISTS "customFieldsCashcontrolenabled" boolean NOT NULL DEFAULT true;

                    ALTER TABLE "channel" 
                    ADD COLUMN IF NOT EXISTS "customFieldsRequireopeningcount" boolean NOT NULL DEFAULT true;

                    ALTER TABLE "channel" 
                    ADD COLUMN IF NOT EXISTS "customFieldsVariancenotificationthreshold" integer NOT NULL DEFAULT 100;
                END IF;
            END $$;
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            DO $$
            BEGIN
                -- Remove cash control fields from Channel
                IF EXISTS (
                    SELECT 1 FROM information_schema.tables 
                    WHERE table_name = 'channel'
                ) THEN
                    ALTER TABLE "channel" 
                    DROP COLUMN IF EXISTS "customFieldsCashcontrolenabled";

                    ALTER TABLE "channel" 
                    DROP COLUMN IF EXISTS "customFieldsRequireopeningcount";

                    ALTER TABLE "channel" 
                    DROP COLUMN IF EXISTS "customFieldsVariancenotificationthreshold";
                END IF;
            END $$;
        `);
    }
}



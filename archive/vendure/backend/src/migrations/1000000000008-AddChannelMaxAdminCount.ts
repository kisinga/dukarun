import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Add Channel MaxAdminCount Field
 *
 * Adds maxAdminCount custom field to Channel entity for rate limiting team member creation.
 * Default value: 5
 */
export class AddChannelMaxAdminCount1000000000008 implements MigrationInterface {
  name = 'AddChannelMaxAdminCount1000000000008';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            DO $$
            BEGIN
                -- Add maxAdminCount field to Channel
                IF EXISTS (
                    SELECT 1 FROM information_schema.tables 
                    WHERE table_name = 'channel'
                ) THEN
                    ALTER TABLE "channel" 
                    ADD COLUMN IF NOT EXISTS "customFieldsMaxadmincount" integer NOT NULL DEFAULT 5;
                END IF;
            END $$;
        `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            DO $$
            BEGIN
                -- Remove maxAdminCount field from Channel
                IF EXISTS (
                    SELECT 1 FROM information_schema.tables 
                    WHERE table_name = 'channel'
                ) THEN
                    ALTER TABLE "channel" 
                    DROP COLUMN IF EXISTS "customFieldsMaxadmincount";
                END IF;
            END $$;
        `);
  }
}


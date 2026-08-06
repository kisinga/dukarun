import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Add GlobalSettings.trialDays custom field (default trial duration in days).
 * Column type matches custom field type 'int' (PostgreSQL integer).
 */
export class AddGlobalSettingsTrialDays9400000000000 implements MigrationInterface {
  name = 'AddGlobalSettingsTrialDays9400000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'global_settings') THEN
          ALTER TABLE "global_settings" ADD COLUMN IF NOT EXISTS "customFieldsTrialdays" integer NOT NULL DEFAULT 30;
        END IF;
      END $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'global_settings') THEN
          ALTER TABLE "global_settings" DROP COLUMN IF EXISTS "customFieldsTrialdays";
        END IF;
      END $$;
    `);
  }
}

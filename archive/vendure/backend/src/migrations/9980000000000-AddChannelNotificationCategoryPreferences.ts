import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddChannelNotificationCategoryPreferences9980000000000 implements MigrationInterface {
  name = 'AddChannelNotificationCategoryPreferences9980000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'channel') THEN
          ALTER TABLE "channel"
          ADD COLUMN IF NOT EXISTS "customFieldsNotificationcategorypreferences" text;
        END IF;
      END $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'channel') THEN
          ALTER TABLE "channel"
          DROP COLUMN IF EXISTS "customFieldsNotificationcategorypreferences";
        END IF;
      END $$;
    `);
  }
}

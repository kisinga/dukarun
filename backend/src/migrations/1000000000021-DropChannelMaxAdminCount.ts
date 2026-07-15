import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Drop the legacy maxAdminCount channel custom field.
 * Admin limits now come from SubscriptionTier.limits.maxAdmins.
 */
export class DropChannelMaxAdminCount1000000000021 implements MigrationInterface {
  name = 'DropChannelMaxAdminCount1000000000021';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'channel' AND column_name = 'customFieldsMaxadmincount'
        ) THEN
          ALTER TABLE "channel" DROP COLUMN "customFieldsMaxadmincount";
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
          ADD COLUMN IF NOT EXISTS "customFieldsMaxadmincount" integer NOT NULL DEFAULT 5;
        END IF;
      END $$;
    `);
  }
}

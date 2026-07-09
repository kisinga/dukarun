import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Add master switch for customer notifications (GlobalSettings) and per-customer opt-in.
 */
export class AddCustomerNotificationControls1000000000015 implements MigrationInterface {
  name = 'AddCustomerNotificationControls1000000000015';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'global_settings') THEN
          ALTER TABLE "global_settings" ADD COLUMN IF NOT EXISTS "customFieldsCustomernotificationsenabled" boolean NOT NULL DEFAULT false;
        END IF;

        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'customer') THEN
          ALTER TABLE "customer" ADD COLUMN IF NOT EXISTS "customFieldsNotificationsenabled" boolean NOT NULL DEFAULT false;
        END IF;
      END $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'global_settings') THEN
          ALTER TABLE "global_settings" DROP COLUMN IF EXISTS "customFieldsCustomernotificationsenabled";
        END IF;

        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'customer') THEN
          ALTER TABLE "customer" DROP COLUMN IF EXISTS "customFieldsNotificationsenabled";
        END IF;
      END $$;
    `);
  }
}

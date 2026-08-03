import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Add phoneNumber custom field to the User entity.
 *
 * Stores the admin's mobile number for WhatsApp and SMS notifications.
 * Idempotent (ADD COLUMN IF NOT EXISTS) and table-guarded so replays are safe.
 */
export class AddUserPhoneNumberField9990000000003 implements MigrationInterface {
  name = 'AddUserPhoneNumberField9990000000003';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.tables WHERE table_name = 'user'
        ) THEN
          ALTER TABLE "user"
          ADD COLUMN IF NOT EXISTS "customFieldsPhonenumber" character varying(255);
        END IF;
      END $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.tables WHERE table_name = 'user'
        ) THEN
          ALTER TABLE "user" DROP COLUMN IF EXISTS "customFieldsPhonenumber";
        END IF;
      END $$;
    `);
  }
}

import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSubscriptionGracePeriodEnd9970000000000 implements MigrationInterface {
  name = 'AddSubscriptionGracePeriodEnd9970000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'channel') THEN
          ALTER TABLE "channel"
          ADD COLUMN IF NOT EXISTS "customFieldsSubscriptiongraceperiodend" TIMESTAMP;
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
          DROP COLUMN IF EXISTS "customFieldsSubscriptiongraceperiodend";
        END IF;
      END $$;
    `);
  }
}

import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSubscriptionExemptionFields9960000000000 implements MigrationInterface {
  name = 'AddSubscriptionExemptionFields9960000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'channel') THEN
          ALTER TABLE "channel"
          ADD COLUMN IF NOT EXISTS "customFieldsSubscriptionexemptuntil" TIMESTAMP;

          ALTER TABLE "channel"
          ADD COLUMN IF NOT EXISTS "customFieldsSubscriptionexemptreason" text;
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
          DROP COLUMN IF EXISTS "customFieldsSubscriptionexemptreason";

          ALTER TABLE "channel"
          DROP COLUMN IF EXISTS "customFieldsSubscriptionexemptuntil";
        END IF;
      END $$;
    `);
  }
}

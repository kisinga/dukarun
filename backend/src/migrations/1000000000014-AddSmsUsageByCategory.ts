import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Add Channel custom field smsUsageByCategory (JSON string) for type-scoped SMS counts.
 * Backfill: set to {} so existing smsUsedThisPeriod remains source of total until code reads both.
 */
export class AddSmsUsageByCategory1000000000014 implements MigrationInterface {
  name = 'AddSmsUsageByCategory1000000000014';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'channel') THEN
          ALTER TABLE "channel"
          ADD COLUMN IF NOT EXISTS "customFieldsSmsusagebycategory" text;
        END IF;
      END $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'channel') THEN
          ALTER TABLE "channel" DROP COLUMN IF EXISTS "customFieldsSmsusagebycategory";
        END IF;
      END $$;
    `);
  }
}
